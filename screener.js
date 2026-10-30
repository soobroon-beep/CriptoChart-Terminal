/* Screener Nova Nexus — las 50 criptos con más volumen de Binance Spot, con las señales LONG / SHORT / RANGO de tu indicador.
   Usa la misma lógica de señales de Nova Nexus (IA Signals) sobre las velas de cada moneda en la temporalidad elegida.
   Una señal se mantiene visible 5 velas (la de la vela donde sale cuenta como la 1) y la lista va de la más reciente a la más vieja. Al tocar una moneda se abre su gráfico con Nova Nexus activo. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const H = () => window.CCT_host, $ = (s, e) => (e || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const SIG_BARS = 5, TOP_N = 50, TFS = ['5m', '15m', '1h', '4h', '1d'];
  const ICON = {
    scan: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M7 15l3-4 3 2 4-5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 5l8 12H4z"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 19L4 7h16z"/></svg>'
  };
  const st = {tf: null, filter: 'sig', rows: [], busy: false, at: 0, gen: 0, done: 0, total: 0};

  /* Señal activa de una moneda: la última señal de Nova Nexus (sin enfriamiento, como el Pine del screener) si tiene como máximo SIG_BARS velas (edad 1 = la vela actual o recién cerrada, … edad 5 = hace 4 velas). */
  function signalOf(cs) {
    if (!cs || cs.length < 60 || !window.NovaNexus) return null;
    const r = window.NovaNexus.compute(cs, {cooldown: 0, minScore: 1}), sg = r.last; if (!sg) return null;
    const ago = cs.length - 1 - sg.i; if (ago >= SIG_BARS) return null;
    return {side: sg.side, range: !!sg.range, div: !!sg.div, score: sg.score, ago, age: ago + 1, left: SIG_BARS - ago, price: sg.price};
  }
  const kindOf = s => !s ? 'none' : s.range ? 'rng' : s.side === 'buy' ? 'long' : 'short';
  const LABEL = {long: 'LONG', short: 'SHORT', rng: 'RANGO', none: 'Sin señal'};

  async function scan() {
    const h = H(); if (!h) return; const gen = ++st.gen; st.busy = true; st.rows = []; st.done = 0; paint();
    let top = []; try { top = await h.top(TOP_N); } catch {}
    st.total = top.length; paint();
    let k = 0;
    const worker = async () => {
      while (k < top.length && gen === st.gen) {
        const t = top[k++]; let sig = null, ok = true;
        try { sig = signalOf(await h.klines(t.symbol, st.tf)); } catch { ok = false; }
        if (gen !== st.gen) return;
        st.rows.push({symbol: t.symbol, price: t.price, chg: t.chg, sig, ok, idx: k}); st.done++; if (st.done % 5 === 0 || st.done === top.length) paint();
      }
    };
    await Promise.all(Array.from({length: 6}, worker));
    if (gen === st.gen) { st.busy = false; st.at = Date.now(); paint(); }
  }

  /* Orden: primero las que tienen señal, de la más reciente a la más vieja (edad 1, 2, 3, 4, 5); a igual edad, mayor puntaje primero y, si empatan, la de más volumen. */
  const sortRows = rows => rows.sort((a, b) => (!!b.sig - !!a.sig) || ((a.sig ? a.sig.ago : 99) - (b.sig ? b.sig.ago : 99)) || ((b.sig ? b.sig.score : 0) - (a.sig ? a.sig.score : 0)) || ((a.idx || 0) - (b.idx || 0)));
  function visibleRows() {
    const f = st.filter;
    return sortRows(st.rows.filter(r => f === 'all' ? true : f === 'sig' ? !!r.sig : kindOfFilter(r, f)));
  }
  const kindOfFilter = (r, f) => kindOf(r.sig) === f;

  function rowHtml(r) {
    const k = kindOf(r.sig), s = r.sig, b = r.symbol.replace(/USDT$/, ''), chgC = r.chg >= 0 ? 'positive' : 'negative';
    const badge = s ? `<span class="scr-badge ${k}">${s.side === 'buy' ? ICON.up : ICON.down}<b>${LABEL[k]}</b><i title="Vela ${s.age} de ${SIG_BARS} desde que salió la señal">${s.age}/${SIG_BARS}</i></span>` : `<span class="scr-none">${r.ok ? 'Sin señal' : 'Sin datos'}</span>`;
    const extra = s ? `<small>${s.side === 'buy' ? 'Compra' : 'Venta'} · puntaje ${s.score}/5${s.div ? ' · divergencia' : ''} · ${s.ago === 0 ? 'en esta vela (recién salida)' : 'hace ' + s.ago + (s.ago === 1 ? ' vela' : ' velas')}</small>` : `<small>${r.price ? '$' + r.price.toLocaleString('en-US', {maximumFractionDigits: r.price < 1 ? 5 : 2}) : ''}</small>`;
    return `<button class="scr-row" data-scr-open="${esc(r.symbol)}"><div class="scr-coin"><b>${esc(b)}</b>${extra}</div><div class="scr-px"><span class="${chgC}">${r.chg >= 0 ? '+' : ''}${(+r.chg || 0).toFixed(2)}%</span>${badge}</div><span class="scr-go">${ICON.chev}</span></button>`;
  }

  function paint() {
    const el = $('#scrBody'); if (!el) return;
    const n = {long: 0, short: 0, rng: 0}; for (const r of st.rows) { const k = kindOf(r.sig); if (n[k] != null) n[k]++; }
    const chips = [['sig', 'Con señal', n.long + n.short + n.rng], ['long', 'Long', n.long], ['short', 'Short', n.short], ['rng', 'Rango', n.rng], ['all', 'Todas', st.rows.length]];
    const prog = st.busy ? `<div class="scr-prog"><i style="width:${st.total ? Math.round(st.done / st.total * 100) : 5}%"></i></div><small class="scr-note">Analizando ${st.done}/${st.total || TOP_N}…</small>` : '';
    const list = visibleRows();
    el.innerHTML = `<div class="scr-tfs">${TFS.map(t => `<button data-scr-tf="${t}" class="${t === st.tf ? 'on' : ''}">${t}</button>`).join('')}<button class="scr-refresh" data-scr-refresh="1" aria-label="Actualizar" ${st.busy ? 'disabled' : ''}>${ICON.refresh}</button></div>
      <div class="scr-chips">${chips.map(([k, l, c]) => `<button data-scr-f="${k}" class="${st.filter === k ? 'on' : ''}">${l}<i>${c}</i></button>`).join('')}</div>${prog}
      <div class="scr-list">${list.length ? list.map(rowHtml).join('') : `<div class="scr-empty">${st.busy ? '' : 'Ninguna de las ' + TOP_N + ' monedas tiene señal ahora en ' + st.tf + '. Prueba otra temporalidad.'}</div>`}</div>
      <small class="scr-note">Top ${TOP_N} por volumen en Binance Spot · señales de Nova Nexus (visibles ${SIG_BARS} velas) · ${st.at ? 'actualizado ' + new Date(st.at).toLocaleTimeString('es', {hour: '2-digit', minute: '2-digit'}) : 'calculando…'}. Es una herramienta de análisis, no asesoría financiera.</small>`;
  }

  function open() {
    const h = H(); if (!h) return; if (!st.tf) st.tf = TFS.includes(h.interval()) ? h.interval() : '1h';
    const el = document.createElement('div'); el.className = 'cfg-overlay scr-overlay'; el.id = 'scrOverlay';
    el.innerHTML = `<div class="cfg-dlg scr-dlg" role="dialog" aria-modal="true" aria-label="Screener"><div class="cfg-head"><strong>Screener Nova Nexus</strong><button class="cfg-x" aria-label="Cerrar">✕</button></div><div class="cfg-body" id="scrBody"></div></div>`;
    document.body.appendChild(el);
    const close = () => { st.gen++; st.busy = false; el.remove(); };
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('.cfg-x')) { close(); return; }
      const tf = e.target.closest('[data-scr-tf]'); if (tf) { st.tf = tf.dataset.scrTf; scan(); return; }
      const f = e.target.closest('[data-scr-f]'); if (f) { st.filter = f.dataset.scrF; paint(); return; }
      if (e.target.closest('[data-scr-refresh]')) { scan(); return; }
      const o = e.target.closest('[data-scr-open]'); if (o) { const sym = o.dataset.scrOpen; close(); h.openSignal(sym, st.tf); }
    });
    paint(); if (!st.rows.length || Date.now() - st.at > 120e3 || st.tfDone !== st.tf) { st.tfDone = st.tf; scan(); }
  }
  document.addEventListener('click', e => { if (e.target.closest('#scrOpen')) open(); });
  window.CCTScreener = {signalOf, kindOf, open, sortRows, SIG_BARS};
})();
