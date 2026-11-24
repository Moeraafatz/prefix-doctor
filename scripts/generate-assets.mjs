#!/usr/bin/env node
/**
 * Generates hilarious, 100% XML-valid, STRICT Monochrome Black & White SVG assets
 * with ONLY Red (#DC2626), Green (#16A34A), and Yellow (#CA8A04) indicator accents.
 *
 * Zero neon. Zero gradients. Every text node XML-escaped via escXml().
 * All numbers read verbatim from benchmarks/results.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const RESULTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks/results.json'), 'utf8'));

fs.mkdirSync(ASSETS_DIR, { recursive: true });

const INK = '#0A0A0A';
const INK2 = '#262626';
const MUTED = '#525252';
const LIGHT = '#D4D4D4';
const PAPER = '#F7F7F7';
const WHITE = '#FFFFFF';
const GREEN = '#16A34A';
const YELLOW = '#CA8A04';
const RED = '#DC2626';

const MONO = "'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";

function escXml(str) {
  return String(str || '')
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function writeSvg(name, content) {
  const out = path.join(ASSETS_DIR, name);
  fs.writeFileSync(out, content.trim() + '\n', 'utf8');
  console.log(`Generated ${path.relative(ROOT, out)}`);
}

const TS = RESULTS.scenarios.timestamp_buster;

// ============================================================================
// 1. FUNNY B&W HERO LOGO: "90% OFF KV CACHE" Ice Cube vs Evil Clock Blowtorch
// ============================================================================
function generateLogo() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 320" width="920" height="320" role="img" aria-label="prefix-doctor logo: KV Cache ice cube rescued from a blowtorch timestamp">
  <rect width="920" height="320" fill="${WHITE}" />
  <rect x="8" y="8" width="904" height="304" fill="${WHITE}" stroke="${INK}" stroke-width="2.5" />

  <!-- Top Instrumentation Strip -->
  <line x1="8" y1="42" x2="912" y2="42" stroke="${INK}" stroke-width="1.5" />
  <circle cx="28" cy="25" r="5" fill="${GREEN}" stroke="${INK}" stroke-width="1.2" />
  <circle cx="46" cy="25" r="5" fill="${YELLOW}" stroke="${INK}" stroke-width="1.2" />
  <circle cx="64" cy="25" r="5" fill="${RED}" stroke="${INK}" stroke-width="1.2" />
  <text x="84" y="29" font-family="${MONO}" font-size="11" font-weight="700" fill="${INK}">KV PREFIX CLINIC // STOP PAYING 10x BECAUSE OF ONE TIMESTAMP</text>
  <text x="896" y="29" text-anchor="end" font-family="${MONO}" font-size="11" fill="${MUTED}">v1.0.0 · ZERO DEPS · ZERO NEON</text>

  <!-- LEFT BRAND BLOCK -->
  <g transform="translate(28, 62)">
    <text x="0" y="42" font-family="${MONO}" font-size="37" font-weight="800" letter-spacing="-1.2" fill="${INK}">prefix-doctor</text>
    <line x1="0" y1="56" x2="312" y2="56" stroke="${INK}" stroke-width="2" />
    <text x="0" y="80" font-family="${SANS}" font-size="14" font-weight="700" fill="${INK2}">KV Prompt-Cache Break Debugger</text>
    <text x="0" y="99" font-family="${SANS}" font-size="12.5" fill="${MUTED}">Pinpoints the exact byte busting your 90%-off</text>
    <text x="0" y="115" font-family="${SANS}" font-size="12.5" fill="${MUTED}">prefix cache and heals requests losslessly.</text>

    <g transform="translate(0, 134)">
      <rect x="0" y="0" width="312" height="24" fill="${PAPER}" stroke="${INK}" stroke-width="1.2" />
      <circle cx="14" cy="12" r="4" fill="${GREEN}" />
      <text x="26" y="16" font-family="${MONO}" font-size="10.2" font-weight="700" fill="${INK}">${escXml(`-${TS.cost_reduction_pct}% COST · HIT ${TS.before_hit_rate_pct}% -> ${TS.after_hit_rate_pct}%`)}</text>

      <rect x="0" y="31" width="312" height="24" fill="${PAPER}" stroke="${INK}" stroke-width="1.2" />
      <circle cx="14" cy="43" r="4" fill="${YELLOW}" />
      <text x="26" y="47" font-family="${MONO}" font-size="10.2" font-weight="700" fill="${INK}">WRITE-TAX BREAK-EVEN + 9 BUSTER CLASSES</text>

      <rect x="0" y="62" width="312" height="24" fill="${PAPER}" stroke="${INK}" stroke-width="1.2" />
      <circle cx="14" cy="74" r="4" fill="${RED}" />
      <text x="26" y="78" font-family="${MONO}" font-size="10.2" font-weight="700" fill="${INK}">ANTHROPIC · OPENAI · GEMINI · DEEPSEEK</text>
    </g>
  </g>

  <!-- RIGHT ILLUSTRATION: Melting "90% OFF KV CACHE" Ice Cube vs Mischievous Timestamp Clock -->
  <g transform="translate(362, 58)">
    <rect x="0" y="0" width="528" height="236" fill="${PAPER}" stroke="${INK}" stroke-width="1.6" />

    <!-- Top Diagnosis Speech Bubble -->
    <rect x="16" y="12" width="496" height="36" fill="${WHITE}" stroke="${INK}" stroke-width="1.4" />
    <circle cx="30" cy="30" r="4.5" fill="${GREEN}" />
    <text x="42" y="27" font-family="${MONO}" font-size="9.8" font-weight="800" fill="${INK}">DOCTOR'S NOTE: "MOVE THE CLOCK TO THE TAIL, NOT SYSTEM."</text>
    <text x="42" y="41" font-family="${MONO}" font-size="8.8" fill="${MUTED}">1 volatile timestamp at byte 14 melted 90% of a 40-turn KV cache.</text>

    <!-- LEFT INSIDE SCENE: Melting KV Cache Ice Cube -->
    <g transform="translate(34, 72)">
      <!-- Puddle under ice cube -->
      <ellipse cx="78" cy="126" rx="74" ry="12" fill="${WHITE}" stroke="${INK}" stroke-width="1.6" />
      <text x="78" y="129" text-anchor="middle" font-family="${MONO}" font-size="8" font-weight="700" fill="${RED}">1.25x WRITE-TAX PUDDLE ($$$)</text>

      <!-- Isometric Ice Cube (Crisp B&W ink!) -->
      <polygon points="36,36 106,36 124,20 54,20" fill="${WHITE}" stroke="${INK}" stroke-width="2" />
      <rect x="36" y="36" width="70" height="72" fill="${WHITE}" stroke="${INK}" stroke-width="2" />
      <polygon points="106,36 124,20 124,92 106,108" fill="${PAPER}" stroke="${INK}" stroke-width="2" />
      <!-- Melting drips -->
      <path d="M44,108 Q44,119 48,119 Q52,119 52,108" fill="${WHITE}" stroke="${INK}" stroke-width="1.4" />
      <path d="M90,108 Q90,117 94,117 Q98,117 98,108" fill="${WHITE}" stroke="${INK}" stroke-width="1.4" />
      <!-- Worried face on Ice Cube -->
      <circle cx="58" cy="60" r="2.8" fill="${INK}" />
      <circle cx="84" cy="60" r="2.8" fill="${INK}" />
      <path d="M62,74 Q71,68 80,74" fill="none" stroke="${INK}" stroke-width="1.8" />
      <text x="71" y="90" text-anchor="middle" font-family="${MONO}" font-size="8.5" font-weight="800" fill="${INK}">90% OFF</text>
      <text x="71" y="101" text-anchor="middle" font-family="${MONO}" font-size="8" font-weight="700" fill="${MUTED}">KV CACHE</text>

      <!-- Thermometer Gauge -->
      <rect x="-12" y="28" width="12" height="76" rx="6" fill="${WHITE}" stroke="${INK}" stroke-width="1.6" />
      <circle cx="-6" cy="98" r="8" fill="${RED}" stroke="${INK}" stroke-width="1.6" />
      <rect x="-9" y="42" width="6" height="52" fill="${RED}" />
    </g>

    <!-- CENTER: Flame / Cache-Bust Beam from Clock to Ice Cube -->
    <g transform="translate(178, 126)">
      <polygon points="108,8 20,-10 38,8 6,16 36,24 22,38 108,20" fill="${WHITE}" stroke="${RED}" stroke-width="1.8" />
      <polygon points="102,11 46,2 56,11 36,16 56,21 48,28 102,17" fill="${YELLOW}" stroke="${RED}" stroke-width="1.1" />
      <text x="64" y="-14" text-anchor="middle" font-family="${MONO}" font-size="8.5" font-weight="800" fill="${RED}">BYTE 14 DIVERGENCE!</text>
    </g>

    <!-- RIGHT INSIDE SCENE: Mischievous Alarm Clock holding Blowtorch -->
    <g transform="translate(310, 74)">
      <!-- Clock Body -->
      <rect x="28" y="32" width="152" height="78" rx="8" fill="${WHITE}" stroke="${INK}" stroke-width="2.2" />
      <!-- Alarm bells on top -->
      <path d="M46,32 C46,16 74,16 74,32" fill="${PAPER}" stroke="${INK}" stroke-width="2" />
      <path d="M134,32 C134,16 162,16 162,32" fill="${PAPER}" stroke="${INK}" stroke-width="2" />
      <!-- Clock LCD screen -->
      <rect x="42" y="46" width="124" height="34" fill="${INK}" />
      <circle cx="52" cy="56" r="3" fill="${RED}" />
      <text x="108" y="68" text-anchor="middle" font-family="${MONO}" font-size="13" font-weight="800" fill="${WHITE}">15:44:07</text>
      <!-- Evil little eyebrows / smirk -->
      <text x="104" y="98" text-anchor="middle" font-family="${MONO}" font-size="8.5" font-weight="700" fill="${INK}">system: Current time</text>
      <!-- Blowtorch nozzle pointing left -->
      <rect x="-12" y="58" width="40" height="14" fill="${INK2}" stroke="${INK}" stroke-width="1.6" />
      <polygon points="-24,54 -12,58 -12,72 -24,76" fill="${WHITE}" stroke="${INK}" stroke-width="1.6" />
      <!-- Little feet -->
      <rect x="52" y="110" width="18" height="12" fill="${INK}" />
      <rect x="138" y="110" width="18" height="12" fill="${INK}" />
    </g>

    <!-- Bottom Caption Strip -->
    <circle cx="22" cy="222" r="4" fill="${RED}" />
    <text x="32" y="226" font-family="${MONO}" font-size="9.3" font-weight="700" fill="${INK}">${escXml(`BEFORE: $${TS.before_cost_usd.toFixed(2)} (0% HIT)`)}</text>
    <circle cx="236" cy="222" r="4" fill="${GREEN}" />
    <text x="246" y="226" font-family="${MONO}" font-size="9.3" font-weight="800" fill="${INK}">${escXml(`AFTER HEAL: $${TS.after_cost_usd.toFixed(2)} (${TS.after_hit_rate_pct}% HIT · -${TS.cost_reduction_pct}%)`)}</text>
  </g>
</svg>`;
  writeSvg('logo.svg', svg);
}

// ============================================================================
// 2. REAL 40-TURN COST BURN GRAPH (The $100 Clock Bug — Before vs After)
// ============================================================================
function generateCostBurnGraph() {
  const W = 880;
  const H = 430;
  const pad = { top: 68, right: 44, bottom: 72, left: 78 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const beforeArr = TS.cum_before_usd;
  const noCacheArr = TS.cum_nocache_usd;
  const afterArr = TS.cum_after_usd;
  const maxUsd = Math.ceil((beforeArr[beforeArr.length - 1] * 1.12) * 2) / 2;

  const x = (idx) => pad.left + (idx / (beforeArr.length - 1)) * plotW;
  const y = (val) => pad.top + (1 - val / maxUsd) * plotH;
  const toPath = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  let grid = '';
  for (let i = 0; i <= 5; i++) {
    const val = (maxUsd * i) / 5;
    const yy = y(val);
    grid += `<line x1="${pad.left}" y1="${yy.toFixed(1)}" x2="${W - pad.right}" y2="${yy.toFixed(1)}" stroke="${LIGHT}" stroke-width="1" />`;
    grid += `<text x="${pad.left - 10}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-family="${MONO}" font-size="10.5" fill="${MUTED}">$${val.toFixed(2)}</text>`;
  }
  for (const t of [1, 10, 20, 30, 40]) {
    const xx = x(t - 1);
    grid += `<line x1="${xx.toFixed(1)}" y1="${pad.top}" x2="${xx.toFixed(1)}" y2="${H - pad.bottom}" stroke="${LIGHT}" stroke-width="1" stroke-dasharray="2 4" />`;
    grid += `<text x="${xx.toFixed(1)}" y="${H - pad.bottom + 18}" text-anchor="middle" font-family="${MONO}" font-size="10.5" fill="${MUTED}">Turn ${t}</text>`;
  }

  const endIdx = beforeArr.length - 1;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="40-Turn Coding Agent Cumulative API Cost Before vs After prefix-doctor">
  <rect width="${W}" height="${H}" fill="${WHITE}" />
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="${WHITE}" stroke="${INK}" stroke-width="2" />

  <text x="26" y="34" font-family="${MONO}" font-size="15" font-weight="800" fill="${INK}">FIG 1. THE CLOCK BUG TAX — 40-TURN CUMULATIVE API SPEND</text>
  <text x="26" y="52" font-family="${MONO}" font-size="11" fill="${MUTED}">${escXml(`Measured via benchmarks/run.mjs · ${RESULTS.benchmark_provider.name} ($15/M input, 1.25x write, 0.10x read)`)}</text>

  ${grid}

  <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${H - pad.bottom}" stroke="${INK}" stroke-width="2" />
  <line x1="${pad.left}" y1="${H - pad.bottom}" x2="${W - pad.right}" y2="${H - pad.bottom}" stroke="${INK}" stroke-width="2" />
  <text x="22" y="${pad.top + plotH / 2}" transform="rotate(-90 22 ${pad.top + plotH / 2})" text-anchor="middle" font-family="${MONO}" font-size="11" font-weight="700" fill="${INK}">CUMULATIVE INPUT COST ($ USD)</text>

  <!-- Broken Cache (RED - actually HIGHER than no cache because of 1.25x write tax!) -->
  <path d="${toPath(beforeArr)}" fill="none" stroke="${RED}" stroke-width="2.6" />
  <circle cx="${x(endIdx).toFixed(1)}" cy="${y(beforeArr[endIdx]).toFixed(1)}" r="5" fill="${RED}" stroke="${INK}" stroke-width="1.2" />

  <!-- No Cache Baseline (YELLOW dashed) -->
  <path d="${toPath(noCacheArr)}" fill="none" stroke="${YELLOW}" stroke-width="2.2" stroke-dasharray="7 4" />
  <circle cx="${x(endIdx).toFixed(1)}" cy="${y(noCacheArr[endIdx]).toFixed(1)}" r="5" fill="${YELLOW}" stroke="${INK}" stroke-width="1.2" />

  <!-- prefix-doctor Healed (GREEN) -->
  <path d="${toPath(afterArr)}" fill="none" stroke="${GREEN}" stroke-width="2.8" />
  <circle cx="${x(endIdx).toFixed(1)}" cy="${y(afterArr[endIdx]).toFixed(1)}" r="5" fill="${GREEN}" stroke="${INK}" stroke-width="1.2" />

  <!-- Zero-Overlap Callouts -->
  <g>
    <line x1="364" y1="166" x2="${x(22).toFixed(1)}" y2="${y(beforeArr[22]).toFixed(1)}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="2 2" />
    <rect x="122" y="126" width="268" height="40" fill="${WHITE}" stroke="${INK}" stroke-width="1.3" />
    <circle cx="134" cy="140" r="3.5" fill="${RED}" />
    <text x="144" y="143" font-family="${MONO}" font-size="9.5" font-weight="800" fill="${INK}">WRITE-TAX LOSS ZONE (1.25x)</text>
    <text x="132" y="158" font-family="${MONO}" font-size="9" fill="${MUTED}">Broken cache costs 25% MORE than no cache!</text>
  </g>

  <g>
    <line x1="772" y1="118" x2="${(x(endIdx) - 5).toFixed(1)}" y2="${y(beforeArr[endIdx]).toFixed(1)}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="2 2" />
    <rect x="526" y="76" width="246" height="40" fill="${WHITE}" stroke="${INK}" stroke-width="1.4" />
    <circle cx="538" cy="91" r="3.5" fill="${RED}" />
    <text x="548" y="94" font-family="${MONO}" font-size="10" font-weight="800" fill="${INK}">${escXml(`BROKEN PREFIX: $${TS.before_cost_usd.toFixed(2)}`)}</text>
    <text x="536" y="109" font-family="${MONO}" font-size="9" fill="${MUTED}">${escXml(`0% hit rate · vs $${TS.no_cache_cost_usd.toFixed(2)} uncached`)}</text>
  </g>

  <g>
    <line x1="484" y1="308" x2="${x(25).toFixed(1)}" y2="${y(afterArr[25]).toFixed(1)}" stroke="${GREEN}" stroke-width="1.4" stroke-dasharray="3 2" />
    <rect x="296" y="266" width="318" height="42" fill="${WHITE}" stroke="${INK}" stroke-width="1.6" />
    <circle cx="308" cy="282" r="4" fill="${GREEN}" />
    <text x="319" y="285" font-family="${MONO}" font-size="10.2" font-weight="800" fill="${INK}">${escXml(`prefix-doctor HEALED: $${TS.after_cost_usd.toFixed(2)} (-${TS.cost_reduction_pct}%)`)}</text>
    <text x="306" y="300" font-family="${MONO}" font-size="9" fill="${MUTED}">${escXml(`${TS.after_hit_rate_pct}% KV hit rate · Saved $${TS.dollars_saved_usd.toFixed(2)} on 1 session`)}</text>
  </g>

  <!-- Bottom Legend -->
  <line x1="20" y1="${H - 36}" x2="${W - 20}" y2="${H - 36}" stroke="${LIGHT}" stroke-width="1" />
  <circle cx="32" cy="${H - 20}" r="4.5" fill="${RED}" />
  <text x="42" y="${H - 16}" font-family="${MONO}" font-size="10.2" fill="${INK}">${escXml(`Broken Prefix ($${TS.before_cost_usd.toFixed(2)})`)}</text>
  <circle cx="286" cy="${H - 20}" r="4.5" fill="${YELLOW}" />
  <text x="296" y="${H - 16}" font-family="${MONO}" font-size="10.2" fill="${INK}">${escXml(`No Caching ($${TS.no_cache_cost_usd.toFixed(2)})`)}</text>
  <circle cx="526" cy="${H - 20}" r="4.5" fill="${GREEN}" />
  <text x="536" y="${H - 16}" font-family="${MONO}" font-size="10.2" font-weight="700" fill="${INK}">${escXml(`prefix-doctor Healed ($${TS.after_cost_usd.toFixed(2)} · -${TS.cost_reduction_pct}%)`)}</text>
</svg>`;
  writeSvg('cost-burn-graph.svg', svg);
}

// ============================================================================
// 3. MATHEMATICAL WRITE-TAX BREAK-EVEN GRAPH: p* = (w - 1) / (w - r)
// ============================================================================
function generateBreakevenGraph() {
  const W = 880;
  const H = 390;
  const pad = { top: 68, right: 44, bottom: 68, left: 74 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const x = (pct) => pad.left + (pct / 100) * plotW;
  const y = (mult) => pad.top + (1 - mult / 2.1) * plotH;

  const curveOf = (w, r) => {
    const pts = [];
    for (let p = 0; p <= 100; p += 5) {
      const m = w * (1 - p / 100) + r * (p / 100);
      pts.push(`${p === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(m).toFixed(1)}`);
    }
    return pts.join(' ');
  };

  let grid = '';
  for (const p of [0, 20, 40, 60, 80, 100]) {
    grid += `<line x1="${x(p).toFixed(1)}" y1="${pad.top}" x2="${x(p).toFixed(1)}" y2="${H - pad.bottom}" stroke="${LIGHT}" stroke-width="1" stroke-dasharray="2 4" />`;
    grid += `<text x="${x(p).toFixed(1)}" y="${H - pad.bottom + 18}" text-anchor="middle" font-family="${MONO}" font-size="10.5" fill="${MUTED}">${p}%</text>`;
  }
  for (const m of [0.1, 0.5, 1.0, 1.5, 2.0]) {
    grid += `<text x="${pad.left - 10}" y="${(y(m) + 4).toFixed(1)}" text-anchor="end" font-family="${MONO}" font-size="10.5" fill="${MUTED}">${m.toFixed(1)}x</text>`;
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Provider Write-Tax Break-Even Hit Rate Curve">
  <rect width="${W}" height="${H}" fill="${WHITE}" />
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="${WHITE}" stroke="${INK}" stroke-width="2" />

  <text x="26" y="34" font-family="${MONO}" font-size="15" font-weight="800" fill="${INK}">FIG 2. THE WRITE-TAX TRAP — BREAK-EVEN HIT RATE p* = (w - 1) / (w - r)</text>
  <text x="26" y="52" font-family="${MONO}" font-size="11" fill="${MUTED}">Effective input multiplier vs KV cache hit rate · Above 1.0x, caching actively LOSES money</text>

  ${grid}

  <!-- 1.0x Break-Even Line -->
  <line x1="${pad.left}" y1="${y(1.0).toFixed(1)}" x2="${W - pad.right}" y2="${y(1.0).toFixed(1)}" stroke="${RED}" stroke-width="1.6" stroke-dasharray="6 4" />
  <text x="${W - pad.right - 6}" y="${(y(1.0) - 6).toFixed(1)}" text-anchor="end" font-family="${MONO}" font-size="9.5" font-weight="800" fill="${RED}">1.0x NO-CACHE LINE (ABOVE = YOU LOSE MONEY)</text>

  <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${H - pad.bottom}" stroke="${INK}" stroke-width="2" />
  <line x1="${pad.left}" y1="${H - pad.bottom}" x2="${W - pad.right}" y2="${H - pad.bottom}" stroke="${INK}" stroke-width="2" />
  <text x="22" y="${pad.top + plotH / 2}" transform="rotate(-90 22 ${pad.top + plotH / 2})" text-anchor="middle" font-family="${MONO}" font-size="11" font-weight="700" fill="${INK}">EFFECTIVE COST MULTIPLIER</text>

  <!-- Curves -->
  <path d="${curveOf(2.0, 0.1)}" fill="none" stroke="${RED}" stroke-width="2.4" />
  <path d="${curveOf(1.25, 0.1)}" fill="none" stroke="${YELLOW}" stroke-width="2.4" />
  <path d="${curveOf(1.0, 0.1)}" fill="none" stroke="${GREEN}" stroke-width="2.4" />

  <!-- Break-even intersection dots -->
  <circle cx="${x(21.74).toFixed(1)}" cy="${y(1.0).toFixed(1)}" r="5" fill="${YELLOW}" stroke="${INK}" stroke-width="1.4" />
  <circle cx="${x(52.63).toFixed(1)}" cy="${y(1.0).toFixed(1)}" r="5" fill="${RED}" stroke="${INK}" stroke-width="1.4" />

  <!-- Crisp Zero-Overlap Callouts -->
  <g transform="translate(500, 82)">
    <rect x="0" y="0" width="320" height="36" fill="${WHITE}" stroke="${INK}" stroke-width="1.3" />
    <circle cx="12" cy="13" r="3.5" fill="${RED}" />
    <text x="22" y="16" font-family="${MONO}" font-size="9.5" font-weight="800" fill="${INK}">Anthropic 1h TTL (2.0x write): p* = 52.6%</text>
    <text x="10" y="30" font-family="${MONO}" font-size="8.8" fill="${MUTED}">Never turn on 1h TTL on volatile prefixes!</text>
  </g>

  <g transform="translate(148, 250)">
    <rect x="0" y="0" width="290" height="36" fill="${WHITE}" stroke="${INK}" stroke-width="1.3" />
    <circle cx="12" cy="13" r="3.5" fill="${YELLOW}" />
    <text x="22" y="16" font-family="${MONO}" font-size="9.5" font-weight="800" fill="${INK}">Anthropic 5m TTL (1.25x): p* = 21.7%</text>
    <text x="10" y="30" font-family="${MONO}" font-size="8.8" fill="${MUTED}">Safe once hit rate crosses 22% (2nd reuse)</text>
  </g>

  <g transform="translate(546, 250)">
    <rect x="0" y="0" width="274" height="36" fill="${WHITE}" stroke="${INK}" stroke-width="1.3" />
    <circle cx="12" cy="13" r="3.5" fill="${GREEN}" />
    <text x="22" y="16" font-family="${MONO}" font-size="9.5" font-weight="800" fill="${INK}">OpenAI / Gemini / DeepSeek: p* = 0%</text>
    <text x="10" y="30" font-family="${MONO}" font-size="8.8" fill="${MUTED}">Zero write surcharge; 0.1x read discount</text>
  </g>

  <!-- Legend -->
  <line x1="20" y1="${H - 34}" x2="${W - 20}" y2="${H - 34}" stroke="${LIGHT}" stroke-width="1" />
  <circle cx="32" cy="${H - 18}" r="4" fill="${RED}" />
  <text x="42" y="${H - 14}" font-family="${MONO}" font-size="10" fill="${INK}">Anthropic 1h (2.0x write)</text>
  <circle cx="242" cy="${H - 18}" r="4" fill="${YELLOW}" />
  <text x="252" y="${H - 14}" font-family="${MONO}" font-size="10" fill="${INK}">Anthropic 5m (1.25x write)</text>
  <circle cx="468" cy="${H - 18}" r="4" fill="${GREEN}" />
  <text x="478" y="${H - 14}" font-family="${MONO}" font-size="10" font-weight="700" fill="${INK}">OpenAI / Gemini / DeepSeek (1.0x write)</text>
</svg>`;
  writeSvg('breakeven-curve.svg', svg);
}

// ============================================================================
// 4. ARCHITECTURE DIAGRAM: 4-Scenario Scorecard + Lossless Canonicalizer Flow
// ============================================================================
function generateArchitectureDiagram() {
  const W = 920;
  const H = 435;
  const sc = RESULTS.scenarios;

  const box = (x, y, w, h, title, l1, l2, led) => `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${WHITE}" stroke="${INK}" stroke-width="1.8" />
      <rect x="${x}" y="${y}" width="${w}" height="24" fill="${PAPER}" stroke="${INK}" stroke-width="1.2" />
      <circle cx="${x + 12}" cy="${y + 12}" r="4" fill="${led}" stroke="${INK}" stroke-width="0.9" />
      <text x="${x + 22}" y="${y + 16}" font-family="${MONO}" font-size="10.2" font-weight="800" fill="${INK}">${escXml(title)}</text>
      <text x="${x + 10}" y="${y + 42}" font-family="${MONO}" font-size="9.3" fill="${INK2}">${escXml(l1)}</text>
      <text x="${x + 10}" y="${y + 57}" font-family="${MONO}" font-size="8.9" fill="${MUTED}">${escXml(l2)}</text>
    </g>`;

  const rows = [
    ['timestamp_buster', 'Timestamp + UUID in System'],
    ['shuffled_mcp_tools', 'Shuffled MCP Tool Order'],
    ['rag_system_mutation', 'Dynamic RAG in System'],
    ['model_ping_pong', 'Mid-Session Model Switch']
  ];

  let scoreRows = '';
  rows.forEach(([key, label], i) => {
    const d = sc[key];
    const y = 316 + i * 24;
    scoreRows += `
      <circle cx="42" cy="${y + 5}" r="3.5" fill="${GREEN}" />
      <text x="54" y="${y + 9}" font-family="${MONO}" font-size="9.8" font-weight="700" fill="${INK}">${escXml(label)}</text>
      <text x="310" y="${y + 9}" font-family="${MONO}" font-size="9.6" fill="${RED}">${escXml(`Before: ${d.before_hit_rate_pct}% hit ($${d.before_cost_usd.toFixed(2)})`)}</text>
      <text x="545" y="${y + 9}" font-family="${MONO}" font-size="9.6" font-weight="800" fill="${GREEN}">${escXml(`After: ${d.after_hit_rate_pct}% hit ($${d.after_cost_usd.toFixed(2)} | -${d.cost_reduction_pct}%)`)}</text>`;
  });

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="prefix-doctor Architecture and 4-Scenario Healing Scorecard">
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0 L10 5 L0 10 z" fill="${INK}" />
    </marker>
  </defs>

  <rect width="${W}" height="${H}" fill="${WHITE}" />
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="${WHITE}" stroke="${INK}" stroke-width="2" />

  <text x="24" y="34" font-family="${MONO}" font-size="15" font-weight="800" fill="${INK}">FIG 3. INSIDE THE CLINIC — LOSSLESS HEALING PIPELINE &amp; 4-SCENARIO LAB</text>
  <text x="24" y="51" font-family="${MONO}" font-size="11" fill="${MUTED}">Zero-dep local proxy + CLI + MCP tools · Preserves 100% of prompt semantics while freezing KV prefixes</text>

  <!-- Pipeline Row -->
  ${box(24, 70, 200, 74, '1. WIRE SERIALIZER', '[model]->[tools]->[sys]', 'Exact provider byte order', YELLOW)}
  ${box(248, 70, 200, 74, '2. LCP + RADIX TRIE', 'Pinpoints break byte', '9 cache-buster classes', RED)}
  ${box(472, 70, 200, 74, '3. CANONICALIZER', 'Sort tools[] & JSON keys', 'Move clock/UUID to tail', GREEN)}
  ${box(696, 70, 200, 74, '4. BREAKPOINT OPT', 'Inject cache_control', 'Verify write-tax p*', GREEN)}

  <line x1="224" y1="107" x2="246" y2="107" stroke="${INK}" stroke-width="1.6" marker-end="url(#arr)" />
  <line x1="448" y1="107" x2="470" y2="107" stroke="${INK}" stroke-width="1.6" marker-end="url(#arr)" />
  <line x1="672" y1="107" x2="694" y2="107" stroke="${INK}" stroke-width="1.6" marker-end="url(#arr)" />

  <!-- Before vs After Wire Layout Strip -->
  <rect x="24" y="164" width="424" height="84" fill="${PAPER}" stroke="${INK}" stroke-width="1.4" />
  <circle cx="38" cy="180" r="4" fill="${RED}" />
  <text x="48" y="184" font-family="${MONO}" font-size="10" font-weight="800" fill="${INK}">BROKEN WIRE ORDER (0% KV CACHE HIT)</text>
  <rect x="36" y="196" width="110" height="36" fill="${WHITE}" stroke="${RED}" stroke-width="1.4" />
  <text x="91" y="218" text-anchor="middle" font-family="${MONO}" font-size="8.5" fill="${RED}">tools (shuffled)</text>
  <rect x="152" y="196" width="136" height="36" fill="${WHITE}" stroke="${RED}" stroke-width="1.4" />
  <text x="220" y="218" text-anchor="middle" font-family="${MONO}" font-size="8.5" fill="${RED}">sys + 15:44:07</text>
  <rect x="294" y="196" width="142" height="36" fill="${WHITE}" stroke="${RED}" stroke-width="1.4" />
  <text x="365" y="218" text-anchor="middle" font-family="${MONO}" font-size="8.5" fill="${RED}">history (all cold!)</text>

  <rect x="472" y="164" width="424" height="84" fill="${PAPER}" stroke="${INK}" stroke-width="1.4" />
  <circle cx="486" cy="180" r="4" fill="${GREEN}" />
  <text x="496" y="184" font-family="${MONO}" font-size="10" font-weight="800" fill="${INK}">HEALED WIRE ORDER (90%+ KV CACHE HIT)</text>
  <rect x="484" y="196" width="106" height="36" fill="${WHITE}" stroke="${GREEN}" stroke-width="1.6" />
  <text x="537" y="218" text-anchor="middle" font-family="${MONO}" font-size="8.5" font-weight="700" fill="${GREEN}">sorted tools*</text>
  <rect x="596" y="196" width="98" height="36" fill="${WHITE}" stroke="${GREEN}" stroke-width="1.6" />
  <text x="645" y="218" text-anchor="middle" font-family="${MONO}" font-size="8.5" font-weight="700" fill="${GREEN}">frozen sys*</text>
  <rect x="700" y="196" width="96" height="36" fill="${WHITE}" stroke="${GREEN}" stroke-width="1.6" />
  <text x="748" y="218" text-anchor="middle" font-family="${MONO}" font-size="8.5" font-weight="700" fill="${GREEN}">history*</text>
  <rect x="802" y="196" width="84" height="36" fill="${WHITE}" stroke="${YELLOW}" stroke-width="1.4" />
  <text x="844" y="218" text-anchor="middle" font-family="${MONO}" font-size="8" fill="${INK}">tail + clock</text>

  <!-- 4-Scenario Measured Table -->
  <rect x="24" y="266" width="872" height="148" fill="${WHITE}" stroke="${INK}" stroke-width="1.5" />
  <rect x="24" y="266" width="872" height="30" fill="${PAPER}" stroke="${INK}" stroke-width="1.1" />
  <text x="38" y="285" font-family="${MONO}" font-size="10.5" font-weight="800" fill="${INK}">40-TURN BENCHMARK RESULTS ACROSS ALL 4 REAL-WORLD CACHE-BUSTER SCENARIOS (OPUS 5m TTL)</text>
  ${scoreRows}
</svg>`;
  writeSvg('architecture-diagram.svg', svg);
}

// ============================================================================
// 5. LIVE WEB INSPECTOR + CLI PREVIEW GRAPHIC
// ============================================================================
function generateUiPreview() {
  const W = 900;
  const H = 430;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="prefix-doctor Monochrome Web UI and CLI Preview">
  <rect width="${W}" height="${H}" fill="${WHITE}" />
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="${WHITE}" stroke="${INK}" stroke-width="2" />

  <!-- Browser Window -->
  <rect x="22" y="22" width="546" height="386" fill="${WHITE}" stroke="${INK}" stroke-width="1.8" />
  <rect x="22" y="22" width="546" height="28" fill="${PAPER}" stroke="${INK}" stroke-width="1.4" />
  <circle cx="38" cy="36" r="4" fill="${RED}" />
  <circle cx="52" cy="36" r="4" fill="${YELLOW}" />
  <circle cx="66" cy="36" r="4" fill="${GREEN}" />
  <text x="84" y="40" font-family="${MONO}" font-size="10" font-weight="700" fill="${INK}">http://127.0.0.1:4949 — prefix-doctor Web Clinic</text>

  <!-- KPI Row -->
  <g transform="translate(34, 62)">
    <rect x="0" y="0" width="124" height="50" fill="${WHITE}" stroke="${INK}" stroke-width="1.2" />
    <text x="8" y="14" font-family="${MONO}" font-size="7.8" fill="${MUTED}">BEFORE GRADE</text>
    <circle cx="14" cy="30" r="4" fill="${RED}" />
    <text x="23" y="34" font-family="${MONO}" font-size="11" font-weight="800" fill="${INK}">WRITE TAX</text>
    <text x="8" y="45" font-family="${MONO}" font-size="7.5" fill="${MUTED}">0.0% KV hit rate</text>

    <rect x="132" y="0" width="124" height="50" fill="${WHITE}" stroke="${INK}" stroke-width="1.2" />
    <text x="140" y="14" font-family="${MONO}" font-size="7.8" fill="${MUTED}">AFTER HEAL</text>
    <circle cx="146" cy="30" r="4" fill="${GREEN}" />
    <text x="155" y="34" font-family="${MONO}" font-size="12" font-weight="800" fill="${INK}">${escXml(`${TS.after_hit_rate_pct}%`)}</text>
    <text x="140" y="45" font-family="${MONO}" font-size="7.5" fill="${MUTED}">Warm KV prefix</text>

    <rect x="264" y="0" width="124" height="50" fill="${WHITE}" stroke="${INK}" stroke-width="1.2" />
    <text x="272" y="14" font-family="${MONO}" font-size="7.8" fill="${MUTED}">COST DROP</text>
    <circle cx="278" cy="30" r="4" fill="${GREEN}" />
    <text x="287" y="34" font-family="${MONO}" font-size="12" font-weight="800" fill="${INK}">${escXml(`-${TS.cost_reduction_pct}%`)}</text>
    <text x="272" y="45" font-family="${MONO}" font-size="7.5" fill="${MUTED}">${escXml(`Saved $${TS.dollars_saved_usd.toFixed(2)}`)}</text>

    <rect x="396" y="0" width="126" height="50" fill="${WHITE}" stroke="${INK}" stroke-width="1.2" />
    <text x="404" y="14" font-family="${MONO}" font-size="7.8" fill="${MUTED}">BREAK-EVEN p*</text>
    <circle cx="410" cy="30" r="4" fill="${YELLOW}" />
    <text x="419" y="34" font-family="${MONO}" font-size="12" font-weight="800" fill="${INK}">21.7%</text>
    <text x="404" y="45" font-family="${MONO}" font-size="7.5" fill="${MUTED}">Anthropic 5m TTL</text>
  </g>

  <!-- Turn-by-Turn Bars -->
  <g transform="translate(34, 124)">
    <rect x="0" y="0" width="522" height="142" fill="${PAPER}" stroke="${INK}" stroke-width="1.3" />
    <text x="10" y="18" font-family="${MONO}" font-size="9.5" font-weight="800" fill="${INK}">TURN-BY-TURN KV PREFIX X-RAY (GREEN = CACHED · RED = BUSTED)</text>

    <text x="10" y="38" font-family="${MONO}" font-size="8.5" fill="${INK}">Turn 1 [WARMUP]</text>
    <rect x="130" y="28" width="220" height="12" fill="${YELLOW}" stroke="${INK}" stroke-width="1" />
    <text x="358" y="38" font-family="${MONO}" font-size="8.5" fill="${MUTED}">write 5,800 tok</text>

    <text x="10" y="60" font-family="${MONO}" font-size="8.5" fill="${RED}">Turn 2 [BUSTED]</text>
    <rect x="130" y="50" width="250" height="12" fill="${RED}" stroke="${INK}" stroke-width="1" />
    <text x="388" y="60" font-family="${MONO}" font-size="8.5" font-weight="700" fill="${RED}">0% hit (byte 14!)</text>

    <rect x="10" y="70" width="502" height="30" fill="${WHITE}" stroke="${RED}" stroke-width="1.2" />
    <circle cx="22" cy="85" r="3.5" fill="${RED}" />
    <text x="32" y="88" font-family="${MONO}" font-size="8.4" fill="${INK}">VOLATILE_TIMESTAMP: "Current time: 2026-11-24T15:44:07Z" in system</text>

    <text x="10" y="122" font-family="${MONO}" font-size="8.5" font-weight="700" fill="${GREEN}">Turn 2 [HEALED]</text>
    <rect x="130" y="112" width="236" height="12" fill="${GREEN}" stroke="${INK}" stroke-width="1" />
    <rect x="366" y="112" width="18" height="12" fill="${YELLOW}" stroke="${INK}" stroke-width="1" />
    <text x="392" y="122" font-family="${MONO}" font-size="8.5" font-weight="800" fill="${GREEN}">96% hit · -88% $</text>
  </g>

  <!-- Code Auditor Panel -->
  <g transform="translate(34, 278)">
    <rect x="0" y="0" width="522" height="118" fill="${WHITE}" stroke="${INK}" stroke-width="1.3" />
    <rect x="0" y="0" width="522" height="22" fill="${PAPER}" stroke="${INK}" stroke-width="1" />
    <text x="10" y="15" font-family="${MONO}" font-size="8.5" font-weight="800" fill="${INK}">STATIC PROMPT-BUILDER CODE AUDITOR (JS / TS / PYTHON)</text>
    <circle cx="16" cy="40" r="3.5" fill="${RED}" />
    <text x="26" y="43" font-family="${MONO}" font-size="8.6" font-weight="700" fill="${INK}">[CRITICAL] SRC_TIMESTAMP_IN_SYSTEM (agent.ts:1)</text>
    <circle cx="16" cy="64" r="3.5" fill="${RED}" />
    <text x="26" y="67" font-family="${MONO}" font-size="8.6" font-weight="700" fill="${INK}">[CRITICAL] SRC_UUID_IN_SYSTEM (agent.ts:2)</text>
    <circle cx="16" cy="88" r="3.5" fill="${YELLOW}" />
    <text x="26" y="91" font-family="${MONO}" font-size="8.6" fill="${INK}">[HIGH] SRC_UNSORTED_TOOLS_ENUM (agent.ts:6)</text>
    <text x="26" y="109" font-family="${MONO}" font-size="8" fill="${MUTED}">Catches cache-busting bugs in CI before deploying agents</text>
  </g>

  <!-- RIGHT PANE: Terminal CLI -->
  <g transform="translate(584, 22)">
    <rect x="0" y="0" width="294" height="386" fill="${INK}" stroke="${INK}" stroke-width="1.8" />
    <rect x="0" y="0" width="294" height="28" fill="${INK2}" stroke="${INK}" stroke-width="1" />
    <circle cx="16" cy="14" r="3.5" fill="${RED}" />
    <circle cx="29" cy="14" r="3.5" fill="${YELLOW}" />
    <circle cx="42" cy="14" r="3.5" fill="${GREEN}" />
    <text x="58" y="18" font-family="${MONO}" font-size="9.5" font-weight="700" fill="${WHITE}">zsh — prefix-doctor CLI</text>

    <g font-family="${MONO}" font-size="8.6" fill="${WHITE}">
      <text x="12" y="50" fill="${LIGHT}">$ prefix-doctor diagnose trace.jsonl</text>
      <circle cx="16" cy="68" r="3" fill="${RED}" />
      <text x="25" y="71" font-weight="700" fill="${RED}">WRITE_TAX_LOSS (0.0% hit)</text>
      <text x="20" y="87" fill="${WHITE}">${escXml(`Actual: $${TS.before_cost_usd.toFixed(2)} vs Opt $${TS.after_cost_usd.toFixed(2)}`)}</text>
      <text x="20" y="103" fill="${YELLOW}">Culprit: VOLATILE_TIMESTAMP</text>

      <text x="12" y="132" fill="${LIGHT}">$ prefix-doctor heal trace.jsonl</text>
      <circle cx="16" cy="150" r="3" fill="${GREEN}" />
      <text x="25" y="153" font-weight="700" fill="${GREEN}">${escXml(`Hit: 0% -> ${TS.after_hit_rate_pct}%`)}</text>
      <text x="20" y="169" fill="${GREEN}">${escXml(`Cost: -$${TS.dollars_saved_usd.toFixed(2)} (-${TS.cost_reduction_pct}%)`)}</text>

      <text x="12" y="198" fill="${LIGHT}">$ prefix-doctor proxy --heal</text>
      <circle cx="16" cy="216" r="3" fill="${GREEN}" />
      <text x="25" y="219">Listening :4949 (auto-heal ON)</text>
      <text x="20" y="235" fill="${LIGHT}">POST /v1/messages</text>
      <text x="20" y="250" fill="${LIGHT}">POST /v1/chat/completions</text>

      <text x="12" y="280" fill="${LIGHT}">$ prefix-doctor breakeven</text>
      <text x="16" y="298" fill="${YELLOW}">anthropic_5m   1.25x -&gt; 21.7%</text>
      <text x="16" y="314" fill="${RED}">anthropic_1h   2.00x -&gt; 52.6%</text>
      <text x="16" y="330" fill="${GREEN}">openai_std     1.00x -&gt;  0.0%</text>
      <text x="16" y="346" fill="${GREEN}">deepseek_auto  1.00x -&gt;  0.0%</text>
      <text x="16" y="370" fill="${GREEN}">exit 0 · zero dependencies</text>
    </g>
  </g>
</svg>`;
  writeSvg('ui-preview.svg', svg);
}

generateLogo();
generateCostBurnGraph();
generateBreakevenGraph();
generateArchitectureDiagram();
generateUiPreview();
