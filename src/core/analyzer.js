import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { getProviderProfile, computeBreakEvenHitRate, computeTurnCost } from './pricing.js';

/**
 * Exact Byte/Token Longest-Common-Prefix (LCP) Engine & 9-Class Cache-Buster Classifier.
 *
 * Models real provider KV prefix serialization order:
 *   [model] -> [tools] -> [system] -> [messages[0..n]]
 *
 * Grounded in:
 * - "Don't Break the Cache" (arXiv:2601.06007)
 * - "Context Has a Price" (arXiv:2611.22238)
 * - "ShadowPrefill" (arXiv:2611.13176)
 */

export function estimateTokens(text) {
  if (!text) return 0;
  const str = String(text);
  if (!str.trim()) return 0;
  const segs = str.match(/[A-Za-z]+|[0-9]+|[^\sA-Za-z0-9]+|\n/g);
  if (!segs) return Math.ceil(str.length / 4);
  let sum = 0;
  for (const s of segs) {
    if (s === '\n') sum += 0.5;
    else if (/^[A-Za-z]+$/.test(s)) sum += s.length <= 4 ? 1 : Math.ceil(s.length / 4.2);
    else if (/^[0-9]+$/.test(s)) sum += Math.ceil(s.length / 2.8);
    else sum += Math.ceil(s.length / 1.8);
  }
  return Math.max(1, Math.round(sum));
}

function sha256Short(str) {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function stringifyContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === 'string') return b;
        if (b && typeof b.text === 'string') return b.text;
        return JSON.stringify(b);
      })
      .join('\n');
  }
  if (content && typeof content === 'object') return JSON.stringify(content);
  return '';
}

/**
 * Flattens an Anthropic or OpenAI request into exact wire-order KV segments
 * while recording byte offsets of every section (tools, system, each message).
 */
export function serializeRequestPrefix(req) {
  const model = String(req.model || 'claude-sonnet');
  const segments = [];
  let cursor = 0;

  const pushSeg = (section, label, text, hasCacheControl = false) => {
    const start = cursor;
    const content = String(text || '');
    cursor += content.length;
    segments.push({
      section,
      label,
      start,
      end: cursor,
      chars: content.length,
      tokens: estimateTokens(content),
      hasCacheControl,
      text: content
    });
  };

  // 1. Tools section (evaluated FIRST in Anthropic & OpenAI KV prefix hashing!)
  if (Array.isArray(req.tools) && req.tools.length > 0) {
    const toolsHasCache = req.tools.some((t) => Boolean(t && t.cache_control));
    const toolsText = JSON.stringify(req.tools);
    pushSeg('tools', `tools[${req.tools.length}]`, `<<TOOLS>>\n${toolsText}\n`, toolsHasCache);
  }

  // 2. System prompt section
  if (req.system !== undefined && req.system !== null) {
    const sysHasCache =
      Array.isArray(req.system) && req.system.some((b) => Boolean(b && b.cache_control));
    const sysText = stringifyContent(req.system);
    pushSeg('system', 'system', `<<SYSTEM>>\n${sysText}\n`, sysHasCache);
  }

  // 3. Messages sequence (emits per-block segments when content is a block array so
  // explicit cache_control breakpoints placed BEFORE a volatile tail block resolve accurately!)
  const messages = Array.isArray(req.messages) ? req.messages : [];
  messages.forEach((m, idx) => {
    const role = m.role || 'user';
    const section = role === 'system' || role === 'developer' ? 'system' : 'message';
    if (Array.isArray(m.content) && m.content.length > 0) {
      m.content.forEach((blk, bi) => {
        const blkText = typeof blk === 'string' ? blk : typeof blk?.text === 'string' ? blk.text : JSON.stringify(blk);
        const prefix = bi === 0 ? `<<${role.toUpperCase()}#${idx}>>\n` : '';
        const blkHasCache = Boolean(blk && blk.cache_control) || (bi === m.content.length - 1 && Boolean(m.cache_control));
        pushSeg(section, `msg[${idx}]:${role}[${bi}]`, `${prefix}${blkText}\n`, blkHasCache);
      });
    } else {
      const msgHasCache = Boolean(m.cache_control);
      pushSeg(section, `msg[${idx}]:${role}`, `<<${role.toUpperCase()}#${idx}>>\n${stringifyContent(m.content)}\n`, msgHasCache);
    }
  });

  const fullText = segments.map((s) => s.text).join('');
  const totalTokens = segments.reduce((a, s) => a + s.tokens, 0);
  const hasAnyExplicitBreakpoint = segments.some((s) => s.hasCacheControl);

  return {
    model,
    fullText,
    segments,
    totalChars: fullText.length,
    totalTokens,
    hasAnyExplicitBreakpoint,
    prefixHash: sha256Short(`${model}::${fullText}`)
  };
}

export function longestCommonPrefixIndex(a, b) {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

function findSegmentAtOffset(segments, offset) {
  for (const s of segments) {
    if (offset >= s.start && offset < s.end) return s;
  }
  return segments[segments.length - 1] || null;
}

function lineSnippetAt(text, offset) {
  const start = Math.max(0, text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1);
  let end = text.indexOf('\n', offset);
  if (end === -1) end = text.length;
  return text.slice(start, Math.min(end, start + 140)).trim();
}

function stableDeepJson(val) {
  if (Array.isArray(val)) return val.map(stableDeepJson);
  if (val && typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val).sort()) {
      out[k] = stableDeepJson(val[k]);
    }
    return out;
  }
  return val;
}

/**
 * 9-Class Forensic Cache-Buster Classifier.
 * Pinpoints WHY the KV prefix diverged between prevReq and currReq.
 */
function classifyCacheBreak({ prevReq, currReq, prevSer, currSer, lcpChar, idleSeconds, profile }) {
  const busters = [];

  // 1. Model switch mid-session (ShadowPrefill cold prefill penalty!)
  if (prevSer.model !== currSer.model) {
    busters.push({
      code: 'MODEL_SWITCH_COLD_PREFILL',
      severity: 'critical',
      section: 'model',
      offset_char: 0,
      title: `Model switched mid-session (${prevSer.model} -> ${currSer.model})`,
      evidence: `KV caches are model-isolated; switching models forces a 100% cold prefill (arXiv:2611.13176).`,
      fix: 'Keep long multi-turn loops pinned to one model or isolate sub-tasks on a separate branch.'
    });
    return busters;
  }

  // 2. TTL Expiration
  if (idleSeconds !== null && idleSeconds > profile.ttlSeconds) {
    busters.push({
      code: 'TTL_EXPIRATION',
      severity: 'high',
      section: 'ttl',
      offset_char: 0,
      title: `Idle gap (${Math.round(idleSeconds)}s) exceeded provider TTL (${profile.ttlSeconds}s)`,
      evidence: `Warm KV block evicted before turn resumed.`,
      fix:
        profile.id === 'anthropic_5m'
          ? 'Consider 1-hour TTL only if expected reuse exceeds 52.6% write-tax break-even, or send lightweight keep-alive ticks.'
          : 'Reduce idle gaps or batch multi-step agent turns inside TTL window.'
    });
    return busters;
  }

  // 3. Explicit provider missing cache_control breakpoints
  if (profile.mode === 'explicit' && !currSer.hasAnyExplicitBreakpoint && currSer.totalTokens >= profile.minCacheTokens) {
    busters.push({
      code: 'MISSING_CACHE_BREAKPOINT',
      severity: 'high',
      section: 'config',
      offset_char: 0,
      title: `${profile.name} requires explicit cache_control breakpoints (0 found)`,
      evidence: `Request has ${currSer.totalTokens} tokens (>= ${profile.minCacheTokens} min) but no cache_control: { type: "ephemeral" }.`,
      fix: 'Attach cache_control: { type: "ephemeral" } at the end of tools, static system prompt, and stable history.'
    });
  }

  // Check if prefix actually broke BEFORE the end of previous reusable prefix
  const reusableLimit = Math.max(0, prevSer.totalChars - 4);
  if (lcpChar >= reusableLimit) {
    return busters;
  }

  const segCurr = findSegmentAtOffset(currSer.segments, lcpChar);
  const segPrev = findSegmentAtOffset(prevSer.segments, lcpChar);
  const currLine = lineSnippetAt(currSer.fullText, lcpChar);
  const prevLine = lineSnippetAt(prevSer.fullText, lcpChar);
  const section = segCurr ? segCurr.section : 'unknown';

  // 4. Tool schema ordering or JSON key jitter
  if (section === 'tools') {
    const prevTools = Array.isArray(prevReq.tools) ? prevReq.tools : [];
    const currTools = Array.isArray(currReq.tools) ? currReq.tools : [];
    const prevNames = prevTools.map((t) => t.name || t.function?.name || '').join(',');
    const currNames = currTools.map((t) => t.name || t.function?.name || '').join(',');
    const prevSorted = [...prevTools].sort((a, b) => String(a.name || a.function?.name || '').localeCompare(String(b.name || b.function?.name || '')));
    const currSorted = [...currTools].sort((a, b) => String(a.name || a.function?.name || '').localeCompare(String(b.name || b.function?.name || '')));

    if (prevNames !== currNames && JSON.stringify(stableDeepJson(prevSorted)) === JSON.stringify(stableDeepJson(currSorted))) {
      busters.push({
        code: 'TOOL_SCHEMA_REORDER',
        severity: 'critical',
        section: 'tools',
        offset_char: lcpChar,
        title: 'MCP / Tool schemas emitted in non-deterministic order',
        evidence: `Same ${currTools.length} tools serialized in different order at byte ${lcpChar}, busting 100% of downstream KV cache!`,
        fix: 'Sort tools[] lexicographically by name before sending requests (auto-fixed by `prefix-doctor heal`).'
      });
      return busters;
    }

    if (JSON.stringify(stableDeepJson(prevTools)) === JSON.stringify(stableDeepJson(currTools))) {
      busters.push({
        code: 'JSON_KEY_JITTER',
        severity: 'high',
        section: 'tools',
        offset_char: lcpChar,
        title: 'JSON Schema object key order jitter inside tools[]',
        evidence: `Semantically identical tool schemas differed only in JSON key order at byte ${lcpChar}.`,
        fix: 'Canonicalize JSON Schema keys recursively before serialization.'
      });
      return busters;
    }

    busters.push({
      code: 'TOOL_SCHEMA_MUTATION',
      severity: 'high',
      section: 'tools',
      offset_char: lcpChar,
      title: 'Tool definitions mutated mid-session',
      evidence: `tools[] changed at byte ${lcpChar}: "${currLine.slice(0, 90)}"`,
      fix: 'Keep tool schemas fixed for the lifetime of a session; avoid dynamically injecting/removing tools per turn.'
    });
    return busters;
  }

  // 5. Volatile timestamp inside prefix
  const combinedDiff = `${prevLine}\n${currLine}`;
  if (
    /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b|\b\d{10,13}\b|\b(?:current[_ ]?(?:time|date|timestamp)|local[_ ]?time|now|uptime|elapsed)\s*[:=]/i.test(
      combinedDiff
    )
  ) {
    busters.push({
      code: 'VOLATILE_TIMESTAMP',
      severity: 'critical',
      section,
      offset_char: lcpChar,
      title: `Volatile timestamp/clock busted KV cache inside ${section} at byte ${lcpChar}`,
      evidence: `Turn N-1: "${prevLine.slice(0, 68)}"  vs  Turn N: "${currLine.slice(0, 68)}"`,
      fix: 'Move timestamps out of system/early prefix into the tail of the latest user turn (or quantize to day-level).'
    });
    return busters;
  }

  // 6. Volatile UUID / Request ID / Trace ID / Nonce
  if (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b(?:request[_-]?id|trace[_-]?id|span[_-]?id|run[_-]?id|session[_-]?nonce|turn[_-]?(?:id|num|count)|correlation[_-]?id)\s*[:=]/i.test(
      combinedDiff
    )
  ) {
    busters.push({
      code: 'VOLATILE_UUID_TRACE_ID',
      severity: 'critical',
      section,
      offset_char: lcpChar,
      title: `Dynamic UUID / request_id / turn counter busted KV cache inside ${section}`,
      evidence: `Turn N-1: "${prevLine.slice(0, 68)}"  vs  Turn N: "${currLine.slice(0, 68)}"`,
      fix: 'Never inject per-request UUIDs, trace IDs, or turn counters into the cached prefix; relocate to tail metadata.'
    });
    return busters;
  }

  // 7. System prompt mutated (e.g. RAG or dynamic state injected into system!)
  if (section === 'system') {
    busters.push({
      code: 'MUTATED_SYSTEM_PROMPT',
      severity: 'critical',
      section: 'system',
      offset_char: lcpChar,
      title: `Dynamic mutation inside system prompt busted entire conversation KV cache`,
      evidence: `Diverged at byte ${lcpChar} ("${currLine.slice(0, 88)}")`,
      fix: 'Freeze system prompt bit-for-bit; append dynamic RAG snippets or repo status as late user messages.'
    });
    return busters;
  }

  // 8. Mid-conversation context insertion / deletion / editing (Context Has a Price, arXiv:2611.22238)
  busters.push({
    code: 'DYNAMIC_CONTEXT_PREPEND',
    severity: 'high',
    section: segCurr ? segCurr.label : section,
    offset_char: lcpChar,
    title: `Historical message mutated or prepended at ${segCurr ? segCurr.label : section} (byte ${lcpChar})`,
    evidence: `Previous (${segPrev?.label || '?'}): "${prevLine.slice(0, 56)}" != Current: "${currLine.slice(0, 56)}"`,
    fix: 'Treat earlier turns as append-only immutable blocks; place newly retrieved context at the tail (arXiv:2611.22238).'
  });

  return busters;
}

/**
 * Analyzes an entire multi-turn agent trace (array of API requests) against a provider's
 * KV prefix caching rules, break-even economics, and forensic cache-buster taxonomy.
 */
export function analyzeSessionTrace(turnsInput, { provider = 'anthropic_5m' } = {}) {
  const start = performance.now();
  const profile = getProviderProfile(provider);
  const breakEvenRate = computeBreakEvenHitRate(profile);
  const turns = Array.isArray(turnsInput) ? turnsInput : [];

  if (turns.length === 0) {
    return {
      provider: profile,
      break_even_hit_rate_pct: Number((breakEvenRate * 100).toFixed(1)),
      turn_count: 0,
      overall_color: 'green',
      overall_grade: 'NO_DATA',
      summary: {
        total_input_tokens: 0,
        cached_read_tokens: 0,
        cache_write_tokens: 0,
        uncached_tokens: 0,
        effective_hit_rate_pct: 0,
        actual_cost_usd: 0,
        no_cache_cost_usd: 0,
        optimal_cost_usd: 0,
        wasted_usd: 0,
        write_tax_penalty: false
      },
      buster_counts: {},
      turns: [],
      latency_ms: 0
    };
  }

  // Simulated provider KV cache pool (stores previously warmed prefixes with model + timestamp)
  const cachePool = [];
  const turnReports = [];
  const busterCounts = {};

  let totalInputTokens = 0;
  let totalReadTokens = 0;
  let totalWriteTokens = 0;
  let totalUncachedTokens = 0;
  let totalActualUsd = 0;
  let totalNoCacheUsd = 0;
  let prevSer = null;
  let prevReq = null;
  let prevTs = null;

  for (let i = 0; i < turns.length; i++) {
    const req = turns[i];
    const tsMs = typeof req.timestamp_ms === 'number'
      ? req.timestamp_ms
      : typeof req.timestamp === 'string' && Number.isFinite(Date.parse(req.timestamp))
        ? Date.parse(req.timestamp)
        : i * 15_000; // default 15s between consecutive agent turns

    const ser = serializeRequestPrefix(req);
    const idleSeconds = prevTs !== null ? Math.max(0, (tsMs - prevTs) / 1000) : null;

    // Find best matching warm prefix in provider KV cache pool for the same model within TTL
    let bestLcpChar = 0;
    let bestEntry = null;
    for (const entry of cachePool) {
      if (entry.model !== ser.model) continue;
      if ((tsMs - entry.lastHitMs) / 1000 > profile.ttlSeconds) continue;
      const lcp = longestCommonPrefixIndex(entry.fullText, ser.fullText);
      if (lcp > bestLcpChar) {
        bestLcpChar = lcp;
        bestEntry = entry;
      }
    }

    // For explicit-caching providers (Anthropic), cache hits only credit up to the
    // furthest matching explicit `cache_control` breakpoint offset <= bestLcpChar.
    let effectiveMatchedChar = bestLcpChar;
    if (profile.mode === 'explicit') {
      effectiveMatchedChar = 0;
      for (const seg of ser.segments) {
        if (seg.hasCacheControl && seg.end <= bestLcpChar) {
          effectiveMatchedChar = seg.end;
        }
      }
    }

    // Estimate cached tokens from matched prefix string
    const matchedText = effectiveMatchedChar > 0 ? ser.fullText.slice(0, effectiveMatchedChar) : '';
    const rawMatchedTokens = effectiveMatchedChar > 0 ? estimateTokens(matchedText) : 0;

    const cachingEnabledOnTurn =
      ser.totalTokens >= profile.minCacheTokens &&
      (profile.mode === 'automatic' || ser.hasAnyExplicitBreakpoint);

    // Provider only credits a KV read hit if matched prefix >= minCacheTokens and caching is active
    const cachedReadTokens =
      cachingEnabledOnTurn && rawMatchedTokens >= profile.minCacheTokens
        ? Math.min(ser.totalTokens, rawMatchedTokens)
        : 0;

    // On explicit providers, tokens written to cache are up to the furthest explicit cache_control breakpoint;
    // tokens after the last breakpoint are billed as regular uncached input (1.0x).
    let writeEligibleTokens = ser.totalTokens;
    if (profile.mode === 'explicit' && cachingEnabledOnTurn) {
      let lastBpEnd = 0;
      for (const seg of ser.segments) {
        if (seg.hasCacheControl) lastBpEnd = seg.end;
      }
      writeEligibleTokens = lastBpEnd > 0 ? Math.min(ser.totalTokens, estimateTokens(ser.fullText.slice(0, lastBpEnd))) : 0;
    }

    const cacheWriteTokens = cachingEnabledOnTurn ? Math.max(0, writeEligibleTokens - cachedReadTokens) : 0;
    const uncachedInputTokens = Math.max(0, ser.totalTokens - cachedReadTokens - cacheWriteTokens);

    if (bestEntry && cachedReadTokens > 0) {
      bestEntry.lastHitMs = tsMs;
    }
    if (cachingEnabledOnTurn) {
      cachePool.push({
        model: ser.model,
        fullText: ser.fullText,
        lastHitMs: tsMs
      });
      if (cachePool.length > 32) cachePool.shift();
    }

    // Forensic diagnosis against immediately preceding turn
    let busters = [];
    if (prevSer) {
      const pairLcp = longestCommonPrefixIndex(prevSer.fullText, ser.fullText);
      busters = classifyCacheBreak({
        prevReq,
        currReq: req,
        prevSer,
        currSer: ser,
        lcpChar: pairLcp,
        idleSeconds,
        profile
      });
      for (const b of busters) {
        busterCounts[b.code] = (busterCounts[b.code] || 0) + 1;
      }
    } else if (profile.mode === 'explicit' && !ser.hasAnyExplicitBreakpoint && ser.totalTokens >= profile.minCacheTokens) {
      busters.push({
        code: 'MISSING_CACHE_BREAKPOINT',
        severity: 'high',
        section: 'config',
        offset_char: 0,
        title: `${profile.name} requires explicit cache_control breakpoints (0 found)`,
        evidence: `Turn 1 has ${ser.totalTokens} tokens (>= ${profile.minCacheTokens}) with no cache_control.`,
        fix: 'Add cache_control: { type: "ephemeral" } to tools, static system prompt, and stable history.'
      });
      busterCounts.MISSING_CACHE_BREAKPOINT = (busterCounts.MISSING_CACHE_BREAKPOINT || 0) + 1;
    }

    const reusableTokens = prevSer ? Math.min(prevSer.totalTokens, ser.totalTokens) : 0;
    const hitRatePct =
      i === 0
        ? 0
        : reusableTokens > 0
          ? Number(Math.min(100, (cachedReadTokens / reusableTokens) * 100).toFixed(1))
          : 0;

    const cost = computeTurnCost({
      cachedReadTokens,
      cacheWriteTokens,
      uncachedInputTokens,
      profile
    });

    totalInputTokens += ser.totalTokens;
    totalReadTokens += cachedReadTokens;
    totalWriteTokens += cacheWriteTokens;
    totalUncachedTokens += uncachedInputTokens;
    totalActualUsd += cost.total_usd;
    totalNoCacheUsd += cost.no_cache_usd;

    let color = 'green';
    let status = 'CACHED';
    if (i === 0) {
      color = busters.length > 0 ? 'yellow' : 'green';
      status = busters.length > 0 ? 'NO_BREAKPOINT' : 'WARMUP';
    } else if (hitRatePct < 25 || busters.some((b) => b.severity === 'critical')) {
      color = 'red';
      status = 'BUSTED';
    } else if (hitRatePct < 75 || busters.length > 0) {
      color = 'yellow';
      status = 'DEGRADED';
    }

    turnReports.push({
      turn: i + 1,
      model: ser.model,
      timestamp_ms: tsMs,
      total_tokens: ser.totalTokens,
      reusable_tokens: reusableTokens,
      cached_read_tokens: cachedReadTokens,
      cache_write_tokens: cacheWriteTokens,
      uncached_tokens: uncachedInputTokens,
      hit_rate_pct: hitRatePct,
      lcp_char_offset: bestLcpChar,
      status,
      color,
      cost,
      busters
    });

    prevSer = ser;
    prevReq = req;
    prevTs = tsMs;
  }

  // Effective hit rate across all reusable tokens (turns 2..N)
  const totalReusable = turnReports.slice(1).reduce((a, t) => a + t.reusable_tokens, 0);
  const effectiveHitRatePct =
    totalReusable > 0 ? Number(Math.min(100, (totalReadTokens / totalReusable) * 100).toFixed(1)) : 0;

  // Theoretical upper bound (if 100% of every prior turn stayed warm + only new deltas written)
  let optimalCostUsd = 0;
  let prevOptimalTok = 0;
  for (let i = 0; i < turnReports.length; i++) {
    const tok = turnReports[i].total_tokens;
    const optRead = i === 0 ? 0 : Math.min(prevOptimalTok, tok);
    const optWrite = Math.max(0, tok - optRead);
    const c = computeTurnCost({
      cachedReadTokens: optRead >= profile.minCacheTokens ? optRead : 0,
      cacheWriteTokens: tok >= profile.minCacheTokens ? (optRead >= profile.minCacheTokens ? optWrite : tok) : 0,
      uncachedInputTokens: tok < profile.minCacheTokens ? tok : 0,
      profile
    });
    optimalCostUsd += c.total_usd;
    prevOptimalTok = tok;
  }

  const wastedUsd = Math.max(0, totalActualUsd - optimalCostUsd);
  const writeTaxPenalty = totalActualUsd > totalNoCacheUsd + 1e-6;

  let overallColor = 'green';
  let overallGrade = 'HEALTHY';
  if (effectiveHitRatePct < 35 || writeTaxPenalty) {
    overallColor = 'red';
    overallGrade = writeTaxPenalty ? 'WRITE_TAX_LOSS' : 'CACHE_BROKEN';
  } else if (effectiveHitRatePct < 78) {
    overallColor = 'yellow';
    overallGrade = 'DEGRADED';
  }

  return {
    provider: profile,
    break_even_hit_rate_pct: Number((breakEvenRate * 100).toFixed(1)),
    turn_count: turns.length,
    overall_color: overallColor,
    overall_grade: overallGrade,
    summary: {
      total_input_tokens: totalInputTokens,
      cached_read_tokens: totalReadTokens,
      cache_write_tokens: totalWriteTokens,
      uncached_tokens: totalUncachedTokens,
      effective_hit_rate_pct: effectiveHitRatePct,
      actual_cost_usd: Number(totalActualUsd.toFixed(4)),
      no_cache_cost_usd: Number(totalNoCacheUsd.toFixed(4)),
      optimal_cost_usd: Number(optimalCostUsd.toFixed(4)),
      wasted_usd: Number(wastedUsd.toFixed(4)),
      potential_savings_pct:
        totalActualUsd > 0 ? Number(((wastedUsd / totalActualUsd) * 100).toFixed(1)) : 0,
      write_tax_penalty: writeTaxPenalty
    },
    buster_counts: busterCounts,
    turns: turnReports,
    latency_ms: Number((performance.now() - start).toFixed(2))
  };
}
