#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { analyzeSessionTrace } from '../src/core/analyzer.js';
import { healSessionTrace } from '../src/core/canonicalizer.js';
import { auditPromptSourceCode } from '../src/core/templates.js';
import { PROVIDER_PROFILES, computeBreakEvenHitRate } from '../src/core/pricing.js';
import { buildDemoTrace } from '../src/core/demos.js';
import { createProxyAndUiServer } from '../src/proxy/server.js';
import { startStdioMcpServer } from '../src/mcp/server.js';
import { installAgentAdapters } from '../src/adapters/installer.js';

const A = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function dot(color) {
  if (color === 'green') return `${A.green}●${A.reset}`;
  if (color === 'yellow') return `${A.yellow}●${A.reset}`;
  if (color === 'red') return `${A.red}●${A.reset}`;
  return '○';
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function loadTraceFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) return JSON.parse(raw);
  if (raw.startsWith('{') && !raw.includes('\n{')) {
    const obj = JSON.parse(raw);
    return Array.isArray(obj.turns) ? obj.turns : [obj];
  }
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function printHelp() {
  console.log(`
${A.bold}prefix-doctor v1.0.0${A.reset} — KV Prompt-Cache Break Debugger, Prefix Canonicalizer & Cost-Saving Proxy
${A.dim}Exact Byte/Token LCP · 9-Class Cache-Buster Forensics · Write-Tax Break-Even · Live Healing Proxy${A.reset}

${A.bold}USAGE${A.reset}
  prefix-doctor <command> [args] [options]

${A.bold}COMMANDS${A.reset}
  diagnose <trace.json|jsonl>   Analyze multi-turn API trace for KV prefix breaks & wasted dollars
  heal <trace.json|jsonl>       Losslessly canonicalize trace & compare Before vs After cost
  audit-code <file|dir>         Static audit JS/TS/Python prompt builders for cache-busting bugs
  breakeven                     Print Write-Tax Break-Even hit rate table across all providers
  proxy [--port 4949]           Run local Anthropic/OpenAI live proxy (--upstream <url> --heal)
  ui [--port 4949] [--demo]     Launch monochrome B&W Prefix Doctor web inspector
  mcp                           Start stdio MCP server (5 prompt-cache tools for coding agents)
  init [targets]                Install portable SKILL.md + MCP config (all|claude|codex|cursor|windsurf|antigravity)
  doctor                        Verify Node >=22.5 and run self-diagnostic check

${A.bold}FLAGS${A.reset}
  --provider <id>               anthropic_5m (default), anthropic_1h, anthropic_opus_5m, openai_std, gemini_implicit, deepseek_auto
  --demo <scenario>             Use built-in broken trace (timestamp_buster, shuffled_mcp_tools, model_ping_pong, rag_system_mutation)
  --out <file>                  Write healed trace JSON to disk
  --json                        Output structured JSON

${A.bold}EXAMPLES${A.reset}
  prefix-doctor diagnose --demo timestamp_buster
  prefix-doctor heal --demo shuffled_mcp_tools --provider anthropic_opus_5m
  prefix-doctor audit-code src/agent.ts
  prefix-doctor ui --port 4949 --demo
`);
}

function printDiagnosis(report) {
  const s = report.summary;
  console.log(
    `\n${dot(report.overall_color)} ${A.bold}prefix-doctor diagnose${A.reset} — ${report.turn_count} turns (${report.provider.name}) in ${report.latency_ms}ms`
  );
  console.log(`  Grade:          ${dot(report.overall_color)} ${A.bold}${report.overall_grade}${A.reset}   |   Break-even hit rate: ${report.break_even_hit_rate_pct}%`);
  console.log(`  KV Hit Rate:    ${s.effective_hit_rate_pct}%  (read=${s.cached_read_tokens.toLocaleString()} tok · write=${s.cache_write_tokens.toLocaleString()} tok · uncached=${s.uncached_tokens.toLocaleString()} tok)`);
  console.log(`  Session Cost:   $${s.actual_cost_usd.toFixed(4)} actual  vs  $${s.optimal_cost_usd.toFixed(4)} optimal  (wasted $${s.wasted_usd.toFixed(4)} / ${s.potential_savings_pct}%)`);
  if (s.write_tax_penalty) {
    console.log(`  ${dot('red')} WRITE-TAX LOSS: Caching cost MORE than uncached ($${s.no_cache_cost_usd.toFixed(4)}) because hit rate < ${report.break_even_hit_rate_pct}%!`);
  }
  const busters = Object.entries(report.buster_counts);
  if (busters.length > 0) {
    console.log(`\n  ${A.bold}Detected Cache-Busters:${A.reset}`);
    for (const [code, count] of busters) {
      console.log(`    ${dot('red')} ${code} (×${count} turns)`);
    }
  }
  console.log('');
  for (const t of report.turns) {
    const bTag = t.busters.length > 0 ? ` [${t.busters.map((b) => b.code).join(', ')}]` : '';
    console.log(
      `  ${dot(t.color)} Turn ${String(t.turn).padStart(2)} | ${t.status.padEnd(13)} | hit=${String(t.hit_rate_pct).padStart(5)}% | tok=${String(t.total_tokens).padStart(6)} | $${t.cost.total_usd.toFixed(4)}${bTag}`
    );
    for (const b of t.busters) {
      console.log(`      ${A.dim}${b.title} — ${b.evidence}${A.reset}`);
    }
  }
  console.log('');
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];
  const provider = String(flags.provider || 'anthropic_5m');

  if (!cmd || cmd === 'help' || flags.help || flags.h) {
    printHelp();
    return;
  }

  if (cmd === 'mcp') {
    startStdioMcpServer();
    return;
  }

  if (cmd === 'ui' || cmd === 'serve' || cmd === 'proxy') {
    const port = Number(flags.port || flags.p || 4949);
    const host = String(flags.host || '127.0.0.1');
    const upstreamUrl = flags.upstream ? String(flags.upstream) : null;
    const autoHeal = Boolean(flags.heal);
    const seedDemo = Boolean(flags.demo || cmd === 'ui');
    const { server } = createProxyAndUiServer({ provider, upstreamUrl, autoHeal, seedDemo });
    server.listen(port, host, () => {
      console.log(`${dot('green')} ${A.bold}prefix-doctor ${cmd}${A.reset} listening at http://${host}:${port}`);
      console.log(
        `  provider: ${provider}  |  auto-heal: ${autoHeal ? 'ON' : 'OFF'}  |  upstream: ${upstreamUrl || 'dry-run diagnostic'}  |  http-mcp: POST /mcp`
      );
    });
    return;
  }

  if (cmd === 'init') {
    const rawTargets = positional.slice(1);
    const targets = rawTargets.length > 0 ? rawTargets.flatMap((t) => t.split(',')) : ['all'];
    const targetDir = path.resolve(String(flags.dir || process.cwd()));
    const res = installAgentAdapters({ targetDir, targets, useLocalBin: !flags.npx });
    if (flags.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`${dot('green')} Installed prefix-doctor SKILL.md & MCP config for: ${res.targets.join(', ')}`);
      for (const f of res.files) console.log(`  + ${path.relative(targetDir, f) || f}`);
    }
    return;
  }

  if (cmd === 'doctor') {
    const nodeVer = process.versions.node;
    const major = Number(nodeVer.split('.')[0]);
    const minor = Number(nodeVer.split('.')[1]);
    const ok = major > 22 || (major === 22 && minor >= 5);
    const smoke = healSessionTrace(buildDemoTrace('timestamp_buster', 6), { provider: 'anthropic_5m' });
    console.log(`${A.bold}prefix-doctor doctor${A.reset}`);
    console.log(`  ${dot(ok ? 'green' : 'red')} Node.js: v${nodeVer} (requires >=22.5.0)`);
    console.log(
      `  ${dot(smoke.delta.hit_rate_after_pct >= 80 ? 'green' : 'red')} Self-check (timestamp_buster): hit rate ${smoke.delta.hit_rate_before_pct}% -> ${smoke.delta.hit_rate_after_pct}% (saved ${smoke.delta.cost_reduction_pct}%)`
    );
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (cmd === 'breakeven') {
    const rows = Object.values(PROVIDER_PROFILES).map((p) => ({
      id: p.id,
      name: p.name,
      mode: p.mode,
      write: `${p.writeMultiplier}x`,
      read: `${p.readMultiplier}x`,
      min_tokens: p.minCacheTokens,
      ttl_s: p.ttlSeconds,
      break_even_pct: Number((computeBreakEvenHitRate(p) * 100).toFixed(1))
    }));
    if (flags.json) {
      console.log(JSON.stringify(rows, null, 2));
    } else {
      console.log(`\n${A.bold}Provider KV Prompt-Cache Write-Tax Break-Even Table${A.reset}\n`);
      for (const r of rows) {
        const c = r.break_even_pct === 0 ? 'green' : r.break_even_pct <= 25 ? 'yellow' : 'red';
        console.log(
          `  ${dot(c)} ${r.id.padEnd(19)} | ${r.mode.padEnd(9)} | write ${r.write.padEnd(5)} | read ${r.read.padEnd(5)} | min ${String(r.min_tokens).padStart(4)} tok | TTL ${String(r.ttl_s).padStart(4)}s | break-even ${r.break_even_pct}%`
        );
      }
      console.log('');
    }
    return;
  }

  if (cmd === 'diagnose') {
    const file = positional[1];
    const demoName = typeof flags.demo === 'string' ? flags.demo : flags.demo ? 'timestamp_buster' : null;
    const turns = demoName ? buildDemoTrace(demoName, Number(flags.turns || 8)) : file ? loadTraceFile(file) : null;
    if (!turns) {
      console.error(`${dot('red')} Provide a trace file or --demo timestamp_buster`);
      process.exitCode = 1;
      return;
    }
    const report = analyzeSessionTrace(turns, { provider });
    if (flags.json) console.log(JSON.stringify(report, null, 2));
    else printDiagnosis(report);
    process.exitCode = report.overall_color === 'red' ? 1 : 0;
    return;
  }

  if (cmd === 'heal') {
    const file = positional[1];
    const demoName = typeof flags.demo === 'string' ? flags.demo : flags.demo ? 'timestamp_buster' : null;
    const turns = demoName ? buildDemoTrace(demoName, Number(flags.turns || 8)) : file ? loadTraceFile(file) : null;
    if (!turns) {
      console.error(`${dot('red')} Provide a trace file or --demo timestamp_buster`);
      process.exitCode = 1;
      return;
    }
    const res = healSessionTrace(turns, { provider, pinModel: !flags['no-pin-model'] });
    if (flags.out) {
      fs.writeFileSync(String(flags.out), JSON.stringify(res.healed_turns, null, 2) + '\n', 'utf8');
    }
    if (flags.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      const d = res.delta;
      console.log(`\n${dot('green')} ${A.bold}prefix-doctor heal${A.reset} (${res.provider.name})`);
      console.log(`  KV Cache Hit Rate: ${dot('red')} ${d.hit_rate_before_pct}%  ->  ${dot('green')} ${d.hit_rate_after_pct}%  (+${d.hit_rate_lift_pts} pts)`);
      console.log(`  Session Cost:      $${d.cost_before_usd.toFixed(4)}  ->  $${d.cost_after_usd.toFixed(4)}  (saved $${d.dollars_saved_usd.toFixed(4)} / -${d.cost_reduction_pct}%)`);
      if (flags.out) console.log(`  Healed trace written to ${flags.out}`);
      console.log('');
    }
    return;
  }

  if (cmd === 'audit-code') {
    const target = positional[1];
    if (!target || !fs.existsSync(target)) {
      console.error(`${dot('red')} Provide an existing JS/TS/Python file or directory to audit.`);
      process.exitCode = 1;
      return;
    }
    const filesToCheck = [];
    const walk = (p, depth = 0) => {
      if (depth > 5) return;
      const st = fs.statSync(p);
      if (st.isFile()) {
        if (/\.(?:js|mjs|cjs|ts|tsx|py)$/.test(p)) filesToCheck.push(p);
      } else if (st.isDirectory()) {
        for (const e of fs.readdirSync(p, { withFileTypes: true })) {
          if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
          walk(path.join(p, e.name), depth + 1);
        }
      }
    };
    walk(target);
    const reports = filesToCheck.map((f) => auditPromptSourceCode(fs.readFileSync(f, 'utf8'), f));
    const flagged = reports.filter((r) => r.findings.length > 0);
    if (flags.json) {
      console.log(JSON.stringify({ checked: filesToCheck.length, flagged: flagged.length, reports: flagged }, null, 2));
    } else {
      console.log(`\n${dot(flagged.length ? 'red' : 'green')} Audited ${filesToCheck.length} file(s) — ${flagged.length} with cache-busting patterns\n`);
      for (const r of flagged) {
        for (const f of r.findings) {
          console.log(`  ${dot(f.severity === 'critical' ? 'red' : 'yellow')} [${f.severity.toUpperCase()}] ${f.id} (${f.file}:${f.line}) — ${f.title}`);
          console.log(`      ${A.dim}${f.evidence}${A.reset}`);
          console.log(`      Fix: ${f.fix}`);
        }
      }
      console.log('');
    }
    process.exitCode = flagged.some((r) => r.color === 'red') ? 1 : 0;
    return;
  }

  console.error(`${dot('red')} Unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(`${dot('red')} ${err.message}`);
  process.exitCode = 1;
});
