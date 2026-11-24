import { analyzeSessionTrace } from '../core/analyzer.js';
import { canonicalizeRequest, healSessionTrace } from '../core/canonicalizer.js';
import { auditPromptSourceCode } from '../core/templates.js';
import { getProviderProfile, computeBreakEvenHitRate } from '../core/pricing.js';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'prefix-doctor',
  version: '1.0.0'
};

export const MCP_TOOLS = [
  {
    name: 'prefix_diagnose_trace',
    description:
      'Analyze a multi-turn LLM API trace (array of Anthropic/OpenAI request objects) to compute exact byte/token Longest Common Prefix (LCP), KV cache hit rate, write-tax break-even, wasted dollars, and exact cache-buster root causes.',
    inputSchema: {
      type: 'object',
      properties: {
        turns: { type: 'array', items: { type: 'object' }, description: 'Sequential LLM request payloads.' },
        provider: {
          type: 'string',
          enum: ['anthropic_5m', 'anthropic_1h', 'anthropic_opus_5m', 'openai_std', 'gemini_implicit', 'deepseek_auto'],
          description: 'Provider caching profile (default: "anthropic_5m").'
        }
      },
      required: ['turns']
    }
  },
  {
    name: 'prefix_heal_trace',
    description:
      'Losslessly canonicalize a multi-turn trace (sorts tools[] + JSON keys, relocates volatile timestamps/UUIDs from system to tail user turn, injects optimal cache_control breakpoints) and returns Before vs After cache hit rate and dollar savings.',
    inputSchema: {
      type: 'object',
      properties: {
        turns: { type: 'array', items: { type: 'object' }, description: 'Sequential LLM request payloads.' },
        provider: { type: 'string', description: 'Provider profile (default: "anthropic_5m").' },
        pin_model: { type: 'boolean', description: 'Pin model mid-session to eliminate cold prefills (default: true).' }
      },
      required: ['turns']
    }
  },
  {
    name: 'prefix_heal_request',
    description: 'Losslessly canonicalize a single Anthropic or OpenAI API request payload for maximum KV prefix cache hits.',
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'object', description: 'Single API request payload.' },
        provider: { type: 'string', description: 'Provider profile (default: "anthropic_5m").' }
      },
      required: ['request']
    }
  },
  {
    name: 'prefix_audit_code',
    description:
      'Static audit of JS/TS/Python prompt-builder source code for KV cache-busting anti-patterns (timestamps/UUIDs in system prompt, unsorted tools[], messages.unshift, missing Anthropic cache_control).',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code to inspect.' },
        file: { type: 'string', description: 'Filename for line reporting (default: "agent.ts").' }
      },
      required: ['code']
    }
  },
  {
    name: 'prefix_calc_breakeven',
    description: 'Compute provider Write-Tax Break-Even hit rate p* = (w - 1) / (w - r) and TTL/minimum-token rules.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Provider profile ID (default: "anthropic_5m").' }
      }
    }
  }
];

export function handleMcpRequest(msg) {
  const { id, method, params = {} } = msg;

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      }
    };
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };
  }

  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments || {};
    try {
      let out;
      if (name === 'prefix_diagnose_trace') {
        out = analyzeSessionTrace(args.turns || [], { provider: args.provider || 'anthropic_5m' });
      } else if (name === 'prefix_heal_trace') {
        const res = healSessionTrace(args.turns || [], {
          provider: args.provider || 'anthropic_5m',
          pinModel: args.pin_model !== false
        });
        out = { delta: res.delta, before_summary: res.before.summary, after_summary: res.after.summary, changes_by_turn: res.changes_by_turn };
      } else if (name === 'prefix_heal_request') {
        out = canonicalizeRequest(args.request || {}, { provider: args.provider || 'anthropic_5m' });
      } else if (name === 'prefix_audit_code') {
        out = auditPromptSourceCode(args.code || '', args.file || 'agent.ts');
      } else if (name === 'prefix_calc_breakeven') {
        const profile = getProviderProfile(args.provider || 'anthropic_5m');
        out = {
          provider: profile,
          break_even_hit_rate_pct: Number((computeBreakEvenHitRate(profile) * 100).toFixed(1))
        };
      } else {
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: { isError: true, content: [{ type: 'text', text: `prefix-doctor error: ${err.message}` }] }
      };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export function startStdioMcpServer() {
  let buffer = Buffer.alloc(0);
  let useContentLength = false;

  const send = (payload) => {
    const json = JSON.stringify(payload);
    if (useContentLength) {
      process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
    } else {
      process.stdout.write(json + '\n');
    }
  };

  const dispatch = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    const resp = handleMcpRequest(msg);
    if (resp) send(resp);
  };

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      const str = buffer.toString('utf8');
      if (str.startsWith('Content-Length:')) {
        useContentLength = true;
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const header = buffer.slice(0, headerEnd).toString('utf8');
        const m = header.match(/Content-Length:\s*(\d+)/i);
        if (!m) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }
        const len = parseInt(m[1], 10);
        const total = headerEnd + 4 + len;
        if (buffer.length < total) break;
        const body = buffer.slice(headerEnd + 4, total).toString('utf8');
        buffer = buffer.slice(total);
        dispatch(body);
      } else {
        const nl = buffer.indexOf('\n');
        if (nl === -1) break;
        const line = buffer.slice(0, nl).toString('utf8');
        buffer = buffer.slice(nl + 1);
        dispatch(line);
      }
    }
  });
}
