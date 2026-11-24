import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSessionTrace } from '../core/analyzer.js';
import { canonicalizeRequest, healSessionTrace } from '../core/canonicalizer.js';
import { auditPromptSourceCode } from '../core/templates.js';
import { PROVIDER_PROFILES, computeBreakEvenHitRate, getProviderProfile } from '../core/pricing.js';
import { buildDemoTrace, DEMO_SCENARIOS } from '../core/demos.js';
import { handleMcpRequest } from '../mcp/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '../../web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > 8 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

export function createProxyAndUiServer({
  provider = 'anthropic_5m',
  upstreamUrl = null,
  autoHeal = false,
  seedDemo = false
} = {}) {
  const liveTurns = seedDemo ? buildDemoTrace('timestamp_buster', 8) : [];
  const sseClients = new Set();

  const broadcast = (event) => {
    const msg = `data: ${JSON.stringify(event)}\n\n`;
    for (const c of sseClients) {
      try {
        c.write(msg);
      } catch {
        sseClients.delete(c);
      }
    }
  };

  const handler = async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      });
      return res.end();
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const reqProvider = url.searchParams.get('provider') || provider;

    try {
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, {
          status: 'ok',
          engine: 'prefix-doctor',
          version: '1.0.0',
          provider: reqProvider,
          autoHeal,
          upstreamConfigured: Boolean(upstreamUrl)
        });
      }

      if (pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', turns: liveTurns.length })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (pathname === '/api/providers' && req.method === 'GET') {
        const list = Object.values(PROVIDER_PROFILES).map((p) => ({
          ...p,
          break_even_hit_rate_pct: Number((computeBreakEvenHitRate(p) * 100).toFixed(1))
        }));
        return sendJson(res, 200, { providers: list, demos: DEMO_SCENARIOS });
      }

      if (pathname === '/api/live-session' && req.method === 'GET') {
        return sendJson(res, 200, analyzeSessionTrace(liveTurns, { provider: reqProvider }));
      }

      if (pathname === '/api/demo' && req.method === 'POST') {
        const body = await readBody(req);
        const scenario = body.scenario || 'timestamp_buster';
        const demoTurns = buildDemoTrace(scenario, Number(body.turns || 8));
        liveTurns.length = 0;
        liveTurns.push(...demoTurns);
        const report = analyzeSessionTrace(liveTurns, { provider: body.provider || reqProvider });
        broadcast({ type: 'session_updated', turns: liveTurns.length });
        return sendJson(res, 200, { scenario, report, turns: demoTurns });
      }

      if (pathname === '/api/diagnose' && req.method === 'POST') {
        const body = await readBody(req);
        const turns = Array.isArray(body.turns) ? body.turns : liveTurns;
        return sendJson(res, 200, analyzeSessionTrace(turns, { provider: body.provider || reqProvider }));
      }

      if (pathname === '/api/heal' && req.method === 'POST') {
        const body = await readBody(req);
        const turns = Array.isArray(body.turns) ? body.turns : liveTurns;
        return sendJson(res, 200, healSessionTrace(turns, {
          provider: body.provider || reqProvider,
          pinModel: body.pin_model !== false
        }));
      }

      if (pathname === '/api/audit-code' && req.method === 'POST') {
        const body = await readBody(req);
        return sendJson(res, 200, auditPromptSourceCode(body.code || '', body.file || 'agent.ts'));
      }

      if (pathname === '/api/breakeven' && req.method === 'GET') {
        const p = getProviderProfile(reqProvider);
        return sendJson(res, 200, {
          provider: p,
          break_even_hit_rate_pct: Number((computeBreakEvenHitRate(p) * 100).toFixed(1))
        });
      }

      // Streamable HTTP JSON-RPC MCP
      if (pathname === '/mcp' && req.method === 'POST') {
        const body = await readBody(req);
        const reply = handleMcpRequest(body);
        if (!reply) {
          res.writeHead(202);
          return res.end();
        }
        return sendJson(res, 200, reply);
      }

      // Live Transparent Cache-Healing Proxy for Anthropic (/v1/messages) & OpenAI (/v1/chat/completions)
      if ((pathname === '/v1/messages' || pathname === '/v1/chat/completions') && req.method === 'POST') {
        const body = await readBody(req);
        const detectedProvider = pathname === '/v1/messages' ? 'anthropic_5m' : 'openai_std';
        let outboundBody = body;
        let healInfo = null;

        if (autoHeal || url.searchParams.get('heal') === '1') {
          const resHeal = canonicalizeRequest(body, { provider: detectedProvider });
          outboundBody = resHeal.healed;
          healInfo = { changes: resHeal.changes, relocated: resHeal.relocated_volatile_count };
        }

        liveTurns.push({ ...outboundBody, timestamp_ms: Date.now() });
        if (liveTurns.length > 200) liveTurns.shift();
        const liveDiag = analyzeSessionTrace(liveTurns, { provider: detectedProvider });
        broadcast({ type: 'turn_recorded', turn: liveTurns.length, hitRate: liveDiag.summary.effective_hit_rate_pct });

        // If upstreamUrl configured, forward transparently; otherwise return dry-run proxy diagnostic!
        if (upstreamUrl) {
          const target = new URL(pathname + url.search, upstreamUrl).toString();
          const fwdHeaders = { 'content-type': 'application/json' };
          for (const h of ['authorization', 'x-api-key', 'anthropic-version', 'anthropic-beta']) {
            if (req.headers[h]) fwdHeaders[h] = req.headers[h];
          }
          const upstreamRes = await fetch(target, {
            method: 'POST',
            headers: fwdHeaders,
            body: JSON.stringify(outboundBody)
          });
          const text = await upstreamRes.text();
          res.writeHead(upstreamRes.status, {
            'Content-Type': upstreamRes.headers.get('content-type') || 'application/json',
            'x-prefix-doctor-hit-rate': String(liveDiag.summary.effective_hit_rate_pct),
            'x-prefix-doctor-healed': healInfo ? 'true' : 'false'
          });
          return res.end(text);
        }

        return sendJson(res, 200, {
          proxy_mode: 'dry_run_diagnostic',
          healed: healInfo,
          latest_turn: liveDiag.turns[liveDiag.turns.length - 1],
          session_summary: liveDiag.summary
        });
      }

      // Static Monochrome B&W Web UI
      const safePath = pathname === '/' ? '/index.html' : pathname;
      const fullPath = path.resolve(WEB_DIR, '.' + safePath);
      if (fullPath.startsWith(WEB_DIR) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(fullPath).pipe(res);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  };

  const server = http.createServer(handler);
  return { server, handler, liveTurns };
}
