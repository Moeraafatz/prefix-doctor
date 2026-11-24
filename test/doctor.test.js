import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { computeBreakEvenHitRate, getProviderProfile } from '../src/core/pricing.js';
import { analyzeSessionTrace } from '../src/core/analyzer.js';
import { canonicalizeRequest, healSessionTrace } from '../src/core/canonicalizer.js';
import { auditPromptSourceCode } from '../src/core/templates.js';
import { buildDemoTrace } from '../src/core/demos.js';
import { handleMcpRequest } from '../src/mcp/server.js';
import { createProxyAndUiServer } from '../src/proxy/server.js';
import { installAgentAdapters } from '../src/adapters/installer.js';

test('Write-Tax Break-Even formula matches exact provider caching math', () => {
  // Anthropic 5m: (1.25 - 1) / (1.25 - 0.10) = 0.25 / 1.15 = 0.2174 (21.7%)
  assert.equal(computeBreakEvenHitRate('anthropic_5m'), 0.2174);
  // Anthropic 1h: (2.0 - 1) / (2.0 - 0.10) = 1.0 / 1.9 = 0.5263 (52.6%)
  assert.equal(computeBreakEvenHitRate('anthropic_1h'), 0.5263);
  // OpenAI / Gemini / DeepSeek (1.0x write): 0% break-even
  assert.equal(computeBreakEvenHitRate('openai_std'), 0);
  assert.equal(computeBreakEvenHitRate('gemini_implicit'), 0);
  assert.equal(getProviderProfile('anthropic_opus_5m').inputPerMillionUsd, 15.0);
});

test('Forensic analyzer detects VOLATILE_TIMESTAMP and proves write-tax penalty before healing', () => {
  const broken = buildDemoTrace('timestamp_buster', 8);
  const diag = analyzeSessionTrace(broken, { provider: 'anthropic_5m' });

  assert.equal(diag.overall_color, 'red');
  assert.ok(diag.buster_counts.VOLATILE_TIMESTAMP >= 6, 'Should detect timestamp buster across turns');
  assert.ok(diag.summary.effective_hit_rate_pct < 20, 'Timestamp in system must destroy KV hit rate');
  assert.equal(diag.summary.write_tax_penalty, true, 'Must flag that write tax made bill worse than no cache');

  const healed = healSessionTrace(broken, { provider: 'anthropic_5m' });
  assert.ok(healed.delta.hit_rate_after_pct >= 80, `Expected >=80% hit rate after healing, got ${healed.delta.hit_rate_after_pct}%`);
  assert.ok(healed.delta.cost_reduction_pct >= 60, `Expected >=60% cost reduction, got ${healed.delta.cost_reduction_pct}%`);
  assert.equal(healed.after.summary.write_tax_penalty, false);
});

test('Forensic analyzer detects TOOL_SCHEMA_REORDER and canonicalizer restores full prefix hits', () => {
  const broken = buildDemoTrace('shuffled_mcp_tools', 8);
  const diag = analyzeSessionTrace(broken, { provider: 'anthropic_5m' });

  assert.ok(diag.buster_counts.TOOL_SCHEMA_REORDER >= 4);
  const healed = healSessionTrace(broken, { provider: 'anthropic_5m' });
  assert.ok(healed.delta.hit_rate_after_pct >= 90);
  assert.ok(healed.delta.cost_reduction_pct >= 50);
});

test('Forensic analyzer detects MODEL_SWITCH_COLD_PREFILL and RAG system mutations', () => {
  const modelSwitch = analyzeSessionTrace(buildDemoTrace('model_ping_pong', 6), { provider: 'anthropic_5m' });
  assert.ok(modelSwitch.buster_counts.MODEL_SWITCH_COLD_PREFILL >= 4);

  const ragMut = buildDemoTrace('rag_system_mutation', 8);
  const ragDiag = analyzeSessionTrace(ragMut, { provider: 'anthropic_5m' });
  assert.ok(ragDiag.buster_counts.VOLATILE_TIMESTAMP || ragDiag.buster_counts.MUTATED_SYSTEM_PROMPT);
  const ragHealed = healSessionTrace(ragMut, { provider: 'anthropic_5m' });
  assert.ok(ragHealed.delta.hit_rate_after_pct >= 80);
});

test('Forensic analyzer detects TTL_EXPIRATION when turn gap exceeds provider TTL', () => {
  const base = buildDemoTrace('shuffled_mcp_tools', 2);
  // Make Turn 1 and Turn 2 identical tools, but 10 minutes apart (> 300s Anthropic 5m TTL)
  base[1].tools = JSON.parse(JSON.stringify(base[0].tools));
  base[0].timestamp_ms = 1_764_000_000_000;
  base[1].timestamp_ms = 1_764_000_000_000 + 600_000;

  const diag = analyzeSessionTrace(base, { provider: 'anthropic_5m' });
  assert.equal(diag.buster_counts.TTL_EXPIRATION, 1);
  assert.equal(diag.turns[1].cached_read_tokens, 0);
});

test('Single-request canonicalizer preserves volatile info at tail without data loss', () => {
  const req = {
    model: 'claude-sonnet-4',
    tools: [
      { name: 'zeta', input_schema: { z: 1, a: 2 } },
      { name: 'alpha', input_schema: { b: 1, a: 2 } }
    ],
    system: 'Current time: 2026-11-24T15:00:00Z\nRequest ID: 550e8400-e29b-41d4-a716-446655440000\nYou are a helpful coding assistant.',
    messages: [{ role: 'user', content: 'Fix auth bug.' }]
  };

  const { healed, relocated_volatile_count } = canonicalizeRequest(req, { provider: 'anthropic_5m' });
  assert.equal(healed.tools[0].name, 'alpha');
  assert.equal(healed.tools[1].name, 'zeta');
  assert.deepEqual(Object.keys(healed.tools[0].input_schema), ['a', 'b']);
  assert.equal(relocated_volatile_count, 2);
  const lastMsgText = JSON.stringify(healed.messages[healed.messages.length - 1].content);
  assert.ok(lastMsgText.includes('2026-11-24T15:00:00Z'), 'Volatile clock must be preserved at tail, never lost');
  assert.ok(lastMsgText.includes('550e8400-e29b-41d4-a716-446655440000'), 'Request ID must be preserved at tail');
});

test('Static prompt-code auditor catches timestamps, UUIDs, unsorted tools, unshift, and missing cache_control', () => {
  const buggyCode = `
const systemPrompt = \`Current time: \${new Date().toISOString()} / \${crypto.randomUUID()}\`;
messages.unshift({ role: 'user', content: ragChunk });
await anthropic.messages.create({
  model: 'claude-sonnet-4',
  tools: Object.values(toolMap),
  system: systemPrompt,
  messages
});`;
  const audit = auditPromptSourceCode(buggyCode, 'src/agent.ts');
  assert.equal(audit.verdict, 'CACHE_BROKEN');
  const ids = audit.findings.map((f) => f.id);
  assert.ok(ids.includes('SRC_TIMESTAMP_IN_SYSTEM'));
  assert.ok(ids.includes('SRC_UUID_IN_SYSTEM'));
  assert.ok(ids.includes('SRC_UNSORTED_TOOLS_ENUM'));
  assert.ok(ids.includes('SRC_HISTORY_MUTATION_UNSHIFT'));
  assert.ok(ids.includes('SRC_ANTHROPIC_NO_CACHE_CONTROL'));
});

test('MCP JSON-RPC 2.0 handler and hermetic HTTP/Proxy server operate end-to-end', async () => {
  const init = handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.result.serverInfo.name, 'prefix-doctor');

  const list = handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.equal(list.result.tools.length, 5);

  const { handler } = createProxyAndUiServer({ provider: 'anthropic_5m', autoHeal: true, seedDemo: false });
  const invoke = (method, url, body = null) =>
    new Promise((resolve) => {
      const req = new Readable({ read() {} });
      req.method = method;
      req.url = url;
      req.headers = { host: '127.0.0.1:4949' };
      if (body) req.push(JSON.stringify(body));
      req.push(null);
      let status = 200;
      const chunks = [];
      const res = {
        writeHead(c) { status = c; },
        write(ch) { chunks.push(Buffer.from(ch)); },
        end(ch) {
          if (ch) chunks.push(Buffer.from(ch));
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status, json: text ? JSON.parse(text) : null });
        }
      };
      handler(req, res);
    });

  const h = await invoke('GET', '/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.json.engine, 'prefix-doctor');

  // Send two consecutive broken requests through the auto-healing dry-run proxy!
  const demo = buildDemoTrace('timestamp_buster', 2);
  const p1 = await invoke('POST', '/v1/messages', demo[0]);
  assert.equal(p1.status, 200);
  assert.ok(p1.json.healed.relocated >= 2);

  const p2 = await invoke('POST', '/v1/messages', demo[1]);
  assert.equal(p2.status, 200);
  assert.ok(p2.json.latest_turn.hit_rate_pct >= 75, 'Auto-healing proxy should restore warm KV hit on Turn 2');
});

test('Agent adapter installer wires prefix-doctor SKILL.md and MCP config across all 5 coding agents', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdoc-init-'));
  try {
    const res = installAgentAdapters({ targetDir: tmpDir, targets: ['all'] });
    assert.equal(res.targets.length, 5);
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude/skills/prefix-doctor/SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.mcp.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.codex/skills/prefix-doctor/SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor/rules/prefix-doctor.mdc')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor/mcp.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.windsurf/rules/prefix-doctor.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent/skills/prefix-doctor/SKILL.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
