(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let currentProvider = 'anthropic_5m';
  let currentTurns = null;

  function renderDiagnosis(report) {
    const s = report.summary;
    $('kpi-grade').innerHTML = `<span class="dot dot-${esc(report.overall_color)}"></span>${esc(report.overall_grade)}`;
    $('kpi-breakeven').textContent = `Break-even hit rate: ${report.break_even_hit_rate_pct}% (${report.provider.writeMultiplier}x write)`;
    $('kpi-hitrate').textContent = `${s.effective_hit_rate_pct}%`;
    $('kpi-tokens').textContent = `${s.cached_read_tokens.toLocaleString()} read · ${s.cache_write_tokens.toLocaleString()} write tok`;
    $('kpi-cost').textContent = `$${s.actual_cost_usd.toFixed(4)}`;
    $('kpi-optimal').textContent = `Optimal: $${s.optimal_cost_usd.toFixed(4)} (no-cache: $${s.no_cache_cost_usd.toFixed(4)})`;
    $('kpi-waste').innerHTML = `<span class="dot dot-${s.wasted_usd > 0.001 ? 'red' : 'green'}"></span>$${s.wasted_usd.toFixed(4)}`;
    $('kpi-savings-pct').textContent = s.write_tax_penalty
      ? 'WRITE-TAX LOSS (worse than no cache!)'
      : `${s.potential_savings_pct}% recoverable`;

    const maxTok = Math.max(1, ...report.turns.map((t) => t.total_tokens));
    const barsHtml = report.turns
      .map((t) => {
        const readW = ((t.cached_read_tokens / maxTok) * 100).toFixed(1);
        const remTok = t.cache_write_tokens + t.uncached_tokens;
        const remW = ((remTok / maxTok) * 100).toFixed(1);
        const remClass = t.turn === 1 ? 'bar-warm' : t.color === 'red' ? 'bar-write' : 'bar-warm';

        const bustersHtml = t.busters
          .map(
            (b) => `
            <div class="buster-box">
              <div><span class="dot dot-red"></span><strong>${esc(b.code)}</strong> — ${esc(b.title)}</div>
              <div class="buster-ev">${esc(b.evidence)}</div>
              <div style="margin-top:3px;">Fix: ${esc(b.fix)}</div>
            </div>`
          )
          .join('');

        return `
          <div class="turn-row">
            <div class="turn-head">
              <div><span class="dot dot-${esc(t.color)}"></span><strong>Turn ${t.turn}</strong> [${esc(t.status)}] · ${esc(t.model)}</div>
              <div>hit <strong>${t.hit_rate_pct}%</strong> · read ${t.cached_read_tokens.toLocaleString()} / total ${t.total_tokens.toLocaleString()} tok · <strong>$${t.cost.total_usd.toFixed(4)}</strong></div>
            </div>
            <div class="bar-track">
              <div class="bar-read" style="width:${readW}%"></div>
              <div class="${remClass}" style="width:${remW}%"></div>
            </div>
            ${bustersHtml}
          </div>`;
      })
      .join('');

    $('turn-bars').innerHTML = barsHtml || '<div style="color:#525252;font-family:monospace;">No turns captured yet.</div>';
  }

  async function loadDemo(scenario) {
    $('heal-banner').classList.add('hidden');
    const res = await fetch('/api/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, turns: 8, provider: currentProvider })
    });
    const data = await res.json();
    currentTurns = data.turns;
    renderDiagnosis(data.report);
  }

  async function loadLive() {
    const res = await fetch(`/api/live-session?provider=${encodeURIComponent(currentProvider)}`);
    const report = await res.json();
    renderDiagnosis(report);
  }

  async function healCurrent() {
    const res = await fetch('/api/heal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turns: currentTurns, provider: currentProvider })
    });
    const data = await res.json();
    const d = data.delta;
    const banner = $('heal-banner');
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <div><span class="dot dot-green"></span><strong>SESSION HEALED (${esc(data.provider.name)})</strong></div>
      <div style="margin-top:6px;">
        KV Cache Hit Rate: <strong>${d.hit_rate_before_pct}%</strong> → <strong>${d.hit_rate_after_pct}%</strong> (+${d.hit_rate_lift_pts} pts) &nbsp;|&nbsp;
        Cost: <strong>$${d.cost_before_usd.toFixed(4)}</strong> → <strong>$${d.cost_after_usd.toFixed(4)}</strong> (<strong>-${d.cost_reduction_pct}%</strong>, saved $${d.dollars_saved_usd.toFixed(4)})
      </div>`;
    renderDiagnosis(data.after);
  }

  async function auditCode() {
    const code = $('code-input').value;
    const res = await fetch('/api/audit-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, file: 'agent.ts' })
    });
    const data = await res.json();
    const box = $('code-result');
    box.classList.remove('hidden');
    if (!data.findings.length) {
      box.innerHTML = '<div style="padding:8px;border:1px solid #16A34A;"><span class="dot dot-green"></span>Clean prompt builder — zero KV cache-busting anti-patterns detected.</div>';
      return;
    }
    box.innerHTML = data.findings
      .map(
        (f) => `
        <div class="buster-box">
          <div><span class="dot dot-${f.severity === 'critical' ? 'red' : 'yellow'}"></span><strong>[${esc(f.severity.toUpperCase())}] ${esc(f.id)}</strong> (line ${f.line}) — ${esc(f.title)}</div>
          <div class="buster-ev">${esc(f.evidence)}</div>
          <div style="margin-top:3px;">Fix: ${esc(f.fix)}</div>
        </div>`
      )
      .join('');
  }

  document.querySelectorAll('[data-demo]').forEach((btn) => {
    btn.addEventListener('click', () => loadDemo(btn.dataset.demo));
  });
  $('provider-select').addEventListener('change', (e) => {
    currentProvider = e.target.value;
    $('heal-banner').classList.add('hidden');
    if (currentTurns) {
      fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns: currentTurns, provider: currentProvider })
      })
        .then((r) => r.json())
        .then(renderDiagnosis);
    } else {
      loadLive();
    }
  });
  $('btn-heal').addEventListener('click', healCurrent);
  $('btn-audit-code').addEventListener('click', auditCode);

  loadDemo('timestamp_buster');
  auditCode();
})();
