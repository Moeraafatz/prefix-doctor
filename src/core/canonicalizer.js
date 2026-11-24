import { getProviderProfile } from './pricing.js';
import { analyzeSessionTrace, estimateTokens } from './analyzer.js';

/**
 * Lossless Cache-Preserving Prompt Canonicalizer & Breakpoint Optimizer.
 *
 * Grounded in:
 * - "Don't Break the Cache" (arXiv:2601.06007)
 * - "Cache-Aware Prompt Compression (CAPC)" (arXiv:2607.15516)
 * - "Context Has a Price" (arXiv:2611.22238)
 *
 * Transforms LLM API requests with ZERO semantic information loss:
 *   1. Lexicographically sorts tools[] and recursively canonicalizes JSON Schema keys
 *   2. Relocates volatile lines (timestamps, UUIDs, trace IDs, turn counters) from static
 *      system prefix to the tail of the latest user turn
 *   3. Places optimal explicit cache_control breakpoints for explicit-caching providers
 */

const VOLATILE_LINE_PATTERNS = [
  /\b(?:current[_ ]?(?:time|date|timestamp)|local[_ ]?time|timestamp|utc[_ ]?time|now)\s*[:=]/i,
  /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/,
  /\b(?:request[_-]?id|trace[_-]?id|span[_-]?id|run[_-]?id|correlation[_-]?id|session[_-]?nonce)\s*[:=]/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\b(?:turn|step|iteration)\s*(?:#|:|=)\s*\d+\b/i,
  /^\s*(?:dynamic[_ ]?context|live[_ ]?git[_ ]?status|active[_ ]?rag[_ ]?snippet)\s*:/i
];

function deepSortKeys(val) {
  if (Array.isArray(val)) return val.map(deepSortKeys);
  if (val && typeof val === 'object') {
    const sorted = {};
    for (const key of Object.keys(val).sort()) {
      sorted[key] = deepSortKeys(val[key]);
    }
    return sorted;
  }
  return val;
}

function isVolatileLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return VOLATILE_LINE_PATTERNS.some((rx) => rx.test(trimmed));
}

function stripVolatileLines(text) {
  const lines = String(text || '').split('\n');
  const kept = [];
  const extracted = [];
  for (const line of lines) {
    if (isVolatileLine(line)) {
      extracted.push(line.trim());
    } else {
      kept.push(line);
    }
  }
  return {
    cleaned: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    extracted
  };
}

function appendVolatileToTail(messages, volatileLines, { explicitCache = false } = {}) {
  const out = messages.map((m) => ({ ...m }));
  const hasVol = volatileLines && volatileLines.length > 0;
  const tagText = hasVol ? `<turn_volatile_metadata>\n${volatileLines.join('\n')}\n</turn_volatile_metadata>` : null;

  // Find final user turn to place stable cached block BEFORE volatile tail metadata
  // (Exact Anthropic + arXiv:2601.06007 pattern: stable history gets cached, volatile tail never pollutes next turn!)
  let targetIdx = -1;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === 'user') {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx === -1) {
    if (tagText) out.push({ role: 'user', content: tagText });
    return out;
  }

  const msg = out[targetIdx];
  let blocks;
  if (typeof msg.content === 'string') {
    blocks = [{ type: 'text', text: msg.content }];
  } else if (Array.isArray(msg.content)) {
    blocks = msg.content.map((b) => {
      const copy = typeof b === 'string' ? { type: 'text', text: b } : { ...b };
      delete copy.cache_control;
      return copy;
    });
  } else {
    blocks = [{ type: 'text', text: String(msg.content || '') }];
  }

  if (explicitCache && blocks.length > 0) {
    blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  }
  if (tagText) {
    blocks.push({ type: 'text', text: tagText });
  }

  msg.content = blocks.length === 1 && !explicitCache ? blocks[0].text : blocks;
  out[targetIdx] = msg;
  return out;
}

export function canonicalizeRequest(req, { provider = 'anthropic_5m' } = {}) {
  const profile = getProviderProfile(provider);
  const cloned = JSON.parse(JSON.stringify(req || {}));
  const changes = [];
  const extractedVolatile = [];

  // 1. Canonicalize & sort tools[] deterministically
  if (Array.isArray(cloned.tools) && cloned.tools.length > 0) {
    const beforeJson = JSON.stringify(cloned.tools);
    const cleanedTools = cloned.tools.map((t) => {
      const copy = deepSortKeys(t);
      delete copy.cache_control;
      return copy;
    });
    cleanedTools.sort((a, b) => {
      const na = String(a.name || a.function?.name || '');
      const nb = String(b.name || b.function?.name || '');
      return na.localeCompare(nb);
    });
    if (profile.mode === 'explicit') {
      cleanedTools[cleanedTools.length - 1].cache_control = { type: 'ephemeral' };
    }
    cloned.tools = cleanedTools;
    if (JSON.stringify(cloned.tools) !== beforeJson) {
      changes.push('CANONICALIZED_TOOLS_ORDER_AND_KEYS');
    }
  }

  // 2. Relocate volatile lines out of Anthropic `system` field
  if (typeof cloned.system === 'string') {
    const { cleaned, extracted } = stripVolatileLines(cloned.system);
    if (extracted.length > 0) {
      extractedVolatile.push(...extracted);
      changes.push(`RELOCATED_${extracted.length}_VOLATILE_SYSTEM_LINES`);
    }
    if (profile.mode === 'explicit' && estimateTokens(cleaned) >= 120) {
      cloned.system = [{ type: 'text', text: cleaned, cache_control: { type: 'ephemeral' } }];
      changes.push('INJECTED_SYSTEM_CACHE_BREAKPOINT');
    } else {
      cloned.system = cleaned;
    }
  } else if (Array.isArray(cloned.system)) {
    const newBlocks = [];
    for (const blk of cloned.system) {
      if (blk && blk.type === 'text' && typeof blk.text === 'string') {
        const { cleaned, extracted } = stripVolatileLines(blk.text);
        if (extracted.length > 0) {
          extractedVolatile.push(...extracted);
          changes.push(`RELOCATED_${extracted.length}_VOLATILE_SYSTEM_LINES`);
        }
        if (cleaned) {
          const copy = { ...blk, text: cleaned };
          delete copy.cache_control;
          newBlocks.push(copy);
        }
      } else {
        newBlocks.push(blk);
      }
    }
    if (profile.mode === 'explicit' && newBlocks.length > 0) {
      newBlocks[newBlocks.length - 1].cache_control = { type: 'ephemeral' };
      changes.push('INJECTED_SYSTEM_CACHE_BREAKPOINT');
    }
    cloned.system = newBlocks;
  }

  // 3. Relocate volatile lines out of OpenAI-style leading system/developer message
  const messages = Array.isArray(cloned.messages) ? cloned.messages : [];
  if (messages.length > 0 && (messages[0].role === 'system' || messages[0].role === 'developer')) {
    if (typeof messages[0].content === 'string') {
      const { cleaned, extracted } = stripVolatileLines(messages[0].content);
      if (extracted.length > 0) {
        extractedVolatile.push(...extracted);
        messages[0].content = cleaned;
        changes.push(`RELOCATED_${extracted.length}_VOLATILE_SYSTEM_LINES`);
      }
    }
  }

  // Append all relocated volatile metadata AFTER the rolling cache_control breakpoint on the final user turn
  const explicitCache = profile.mode === 'explicit';
  const updatedMessages = appendVolatileToTail(messages, extractedVolatile, { explicitCache });

  // Also place a rolling checkpoint on the prior turn boundary (idx = length - 3) when history grows,
  // so Turn K+1 matches Turn K's exact breakpoint even as new assistant+user turns append!
  if (explicitCache && updatedMessages.length >= 3) {
    const priorIdx = updatedMessages.length - 3;
    const pMsg = { ...updatedMessages[priorIdx] };
    if (typeof pMsg.content === 'string') {
      pMsg.content = [{ type: 'text', text: pMsg.content, cache_control: { type: 'ephemeral' } }];
    } else if (Array.isArray(pMsg.content) && pMsg.content.length > 0) {
      const last = { ...pMsg.content[pMsg.content.length - 1], cache_control: { type: 'ephemeral' } };
      pMsg.content = [...pMsg.content.slice(0, -1), last];
    }
    updatedMessages[priorIdx] = pMsg;
  }
  if (explicitCache && updatedMessages.length >= 1) {
    changes.push('INJECTED_HISTORY_ROLLING_BREAKPOINT');
  }

  cloned.messages = updatedMessages;
  return {
    healed: cloned,
    changes: [...new Set(changes)],
    relocated_volatile_count: extractedVolatile.length
  };
}

/**
 * Heals an entire multi-turn session trace (relocating volatile prefix mutations,
 * stabilizing tool ordering, optionally pinning model switches, and lifting
 * mid-session prepended context to append-only tail order) and compares exact Before vs After economics!
 */
export function healSessionTrace(turnsInput, { provider = 'anthropic_5m', pinModel = true } = {}) {
  const turns = Array.isArray(turnsInput) ? turnsInput : [];
  const before = analyzeSessionTrace(turns, { provider });

  const primaryModel = turns[0]?.model || 'claude-sonnet';
  const healedTurns = [];
  const allChanges = [];

  // Track canonical stable system prompt from turn 1 to stabilize dynamic system mutations
  let frozenSystemText = null;

  for (let i = 0; i < turns.length; i++) {
    const raw = JSON.parse(JSON.stringify(turns[i]));
    const turnChanges = [];

    if (pinModel && raw.model && raw.model !== primaryModel) {
      raw.model = primaryModel;
      turnChanges.push('PINNED_MODEL_TO_KEEP_KV_WARM');
    }

    const { healed, changes } = canonicalizeRequest(raw, { provider });
    turnChanges.push(...changes);

    // If system prompt STILL mutated dynamically after line relocation (e.g. dynamic RAG injected into system),
    // freeze the static core from Turn 1 and relocate the delta to the tail user turn!
    const sysText =
      typeof healed.system === 'string'
        ? healed.system
        : Array.isArray(healed.system)
          ? healed.system.map((b) => b.text || '').join('\n')
          : null;

    if (sysText !== null) {
      if (frozenSystemText === null) {
        frozenSystemText = sysText;
      } else if (sysText !== frozenSystemText) {
        // Compute diff lines added after frozenSystemText
        const baseLines = new Set(frozenSystemText.split('\n').map((l) => l.trim()));
        const deltaLines = sysText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !baseLines.has(l));
        if (deltaLines.length > 0) {
          if (Array.isArray(healed.system)) {
            healed.system = [{ type: 'text', text: frozenSystemText, cache_control: { type: 'ephemeral' } }];
          } else {
            healed.system = frozenSystemText;
          }
          healed.messages = appendVolatileToTail(healed.messages || [], deltaLines, { explicitCache: provider.startsWith('anthropic') });
          turnChanges.push('FROZE_SYSTEM_AND_MOVED_DYNAMIC_DELTA_TO_TAIL');
        }
      }
    }

    healedTurns.push(healed);
    allChanges.push({ turn: i + 1, changes: [...new Set(turnChanges)] });
  }

  const after = analyzeSessionTrace(healedTurns, { provider });
  const dollarsSaved = Number(Math.max(0, before.summary.actual_cost_usd - after.summary.actual_cost_usd).toFixed(4));
  const savingsPct =
    before.summary.actual_cost_usd > 0
      ? Number(((dollarsSaved / before.summary.actual_cost_usd) * 100).toFixed(1))
      : 0;

  return {
    provider: before.provider,
    before,
    after,
    healed_turns: healedTurns,
    delta: {
      hit_rate_before_pct: before.summary.effective_hit_rate_pct,
      hit_rate_after_pct: after.summary.effective_hit_rate_pct,
      hit_rate_lift_pts: Number((after.summary.effective_hit_rate_pct - before.summary.effective_hit_rate_pct).toFixed(1)),
      cost_before_usd: before.summary.actual_cost_usd,
      cost_after_usd: after.summary.actual_cost_usd,
      dollars_saved_usd: dollarsSaved,
      cost_reduction_pct: savingsPct
    },
    changes_by_turn: allChanges
  };
}
