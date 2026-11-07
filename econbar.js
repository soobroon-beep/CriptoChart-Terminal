/* Próximo evento importante del calendario económico, en la barra inferior del gráfico (solo escritorio).
   Muestra impacto, país, nombre, hora, cuenta atrás, previsión y, cuando sale, el resultado publicado.
   Los datos vienen de calendar-data.json (ForexFactory, lo actualiza un flujo de GitHub); este archivo solo los lee. Las funciones puras se prueban aparte. */
(function (root) {
  'use strict';
  const REL = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'ALL'], LIVE_MS = 30 * 6e4, KEEP_MS = 6 * 36e5;
  const COUNTRY = {USD: 'EE. UU.', EUR: 'Eurozona', GBP: 'Reino Unido', JPY: 'Japón', CNY: 'China', CAD: 'Canadá', AUD: 'Australia', CHF: 'Suiza', NZD: 'Nueva Zelanda', ALL: 'Global'};
  const imp = e => /high|alto/i.test(e.impact) ? 2 : /medium|medio/i.test(e.impact) ? 1 : 0;
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  const num = s => { if (!has(s)) return null; const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  function arrow(e) { // el dato publicado frente a la previsión: 1 por encima, -1 por debajo, 0 igual, null si no se puede comparar
    const a = num(e.actual), f = num(e.forecast); if (a == null || f == null) return null; return a > f ? 1 : a < f ? -1 : 0;
  }
  function shortName(title) { // «NFP · Non-Farm…» → solo la parte en español si existe
    const s = root.CCTAICore && root.CCTAICore.trCal ? root.CCTAICore.trCal(String(title || '')) : String(title || ''), i = s.indexOf(' · '); return i > 0 ? s.slice(0, i) : s;
  }
  function group(list) { // eventos a la misma hora (p. ej. IPC e IPC subyacente): uno principal + cuántos más
    if (!list.length) return null; const t = list[0].t, same = list.filter(e => e.t === t), main = same.find(e => has(e.forecast) || has(e.actual)) || same[0];
    return {main, extra: same.length - 1, all: same};
  }
  function pick(events, now) { // {mode: 'live'|'next', ev: grupo} o null si no hay nada importante cerca
    if (!Array.isArray(events)) return null;
    const hi = events.filter(e => e && Number.isFinite(e.t) && imp(e) === 2 && REL.includes(e.country));
    const live = hi.filter(e => e.t <= now && now - e.t < LIVE_MS).sort((a, b) => b.t - a.t), next = hi.filter(e => e.t > now).sort((a, b) => a.t - b.t);
    if (live.length) return {mode: 'live', ev: group(live)};
    if (next.length) return {mode: 'next', ev: group(next)};
    return null;
  }
  function lists(events, now) { // para la ventana: resultados recientes (últimas 24 h con dato) y próximos (72 h, impacto medio o alto)
    const ok = e => e && Number.isFinite(e.t) && imp(e) >= 1 && REL.includes(e.country);
    const recent = events.filter(e => ok(e) && e.t <= now && now - e.t < 24 * 36e5 && has(e.actual)).sort((a, b) => b.t - a.t).slice(0, 4);
    const upcoming = events.filter(e => ok(e) && e.t > now && e.t - now < 72 * 36e5).sort((a, b) => a.t - b.t || imp(b) - imp(a)).slice(0, 7);
    return {recent, upcoming};
  }
  function left(ms) { // «en 2 h 15 m», «en 12 m», «en 45 s»
    if (ms < 0) return 'ahora'; const s = Math.ceil(ms / 1000); if (s < 90) return 'en ' + s + ' s'; const m = Math.round(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    return 'en ' + (d >= 1 ? `${d} d ${h % 24} h` : h ? (m % 60 ? `${h} h ${m % 60} m` : `${h} h`) : `${m} m`);
  }
  const api = {imp, num, arrow, shortName, group, pick, lists, left, has, COUNTRY};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTEcon = api;
  if (typeof document === 'undefined') return;

  /* ───────── Interfaz ───────── */
  const $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const deskMQ = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : {matches: true, addEventListener() {}};
  let events = [], loadedAt = 0, pop = null, sig = '', busy = false, timer = 0, loadT = 0;
  const tzInfo = () => (window.CCT_tzInfo ? window.CCT_tzInfo() : {tz: 'auto', clock: '24'}), p2 = n => String(n).padStart(2, '0');
  function when(t, now) { // «hoy 07:30», «mañana 07:30», «vie 07:30» en la zona elegida
    const {tz, clock} = tzInfo(), P = root.CCTPrefs, q = P ? P.parts(t, tz) : {h: new Date(t).getHours(), mi: new Date(t).getMinutes(), d: new Date(t).getDate()}, n = P ? P.parts(now, tz) : {d: new Date(now).getDate()};
    const hm = clock === '12' ? `${q.h % 12 || 12}:${p2(q.mi)} ${q.h < 12 ? 'a. m.' : 'p. m.'}` : `${p2(q.h)}:${p2(q.mi)}`, tm = P ? P.parts(now + 864e5, tz).d : new Date(now + 864e5).getDate();
    let day; if (q.d === n.d) day = 'hoy'; else if (q.d === tm) day = 'mañana'; else { try { day = new Intl.DateTimeFormat('es', {weekday: 'short', timeZone: tz === 'auto' ? undefined : tz}).format(new Date(t)).replace('.', ''); } catch { day = ''; } }
    return `${day} ${hm}`.trim();
  }
  const bars = e => `<span class="ec-imp i${imp(e)}" aria-label="${imp(e) === 2 ? 'Impacto alto' : 'Impacto medio'}"><i></i><i></i><i></i></span>`;
  const arrowHtml = e => { const a = arrow(e); return a == null ? '' : `<span class="ec-ar" title="${a > 0 ? 'Por encima de la previsión' : a < 0 ? 'Por debajo de la previsión' : 'Igual a la previsión'}">${a > 0 ? '▲' : a < 0 ? '▼' : '='}</span>`; };
  const kv = (k, v) => has(v) ? `<span class="ec-kv"><em>${k}</em><b>${esc(v)}</b></span>` : '';
  function chipHtml(r, now) {
    const {main: e, extra} = r.ev, nm = esc(shortName(e.title)) + (extra ? `<small class="ec-more">+${extra}</small>` : '');
    if (r.mode === 'live') {
      const out = has(e.actual);
      return `<span class="ec-live${out ? ' got' : ''}" aria-hidden="true"></span>${bars(e)}<b class="ec-cc">${esc(e.country)}</b><span class="ec-nm">${nm}</span>`
        + (out ? `<span class="ec-res"><em>Real</em><b>${esc(e.actual)}</b>${arrowHtml(e)}</span>${kv('Prev', e.forecast)}${kv('Ant', e.previous)}` : `<span class="ec-wait">esperando dato…</span>${kv('Prev', e.forecast)}${kv('Ant', e.previous)}`);
    }
    const soon = e.t - now < 36e5;
    return `<span class="ec-dot${soon ? ' soon' : ''}" aria-hidden="true"></span>${bars(e)}<b class="ec-cc">${esc(e.country)}</b><span class="ec-nm">${nm}</span><span class="ec-when">${esc(when(e.t, now))}<em class="ec-cd">${esc(left(e.t - now))}</em></span>${kv('Prev', e.forecast)}${kv('Ant', e.previous)}`;
  }
  function row(e, now) {
    const done = has(e.actual);
    return `<div class="ec-row"><span class="ec-rt">${esc(when(e.t, now))}</span>${bars(e)}<span class="ec-rn"><b>${esc(e.country)}</b> ${esc(shortName(e.title))}</span><span class="ec-rv">${done ? `<span class="ec-res"><em>Real</em><b>${esc(e.actual)}</b>${arrowHtml(e)}</span>` : ''}${kv('Prev', e.forecast)}${kv('Ant', e.previous)}</span></div>`;
  }
  function popHtml(now) {
    const L = lists(events, now), sec = (t, a) => a.length ? `<div class="ec-sec">${t}</div>${a.map(e => row(e, now)).join('')}` : '';
    return sec('Resultados recientes', L.recent) + sec('Próximos eventos', L.upcoming) + (!L.recent.length && !L.upcoming.length ? '<p class="ec-empty">Sin eventos de impacto en las próximas 72 horas.</p>' : '')
      + `<div class="ec-foot"><button type="button" id="ecOpen">Abrir calendario completo</button><small>Hora: ${esc(tzInfo().tz === 'auto' ? 'tu dispositivo' : tzInfo().tz)} · datos de ForexFactory, se actualizan cada pocos minutos</small></div>`;
  }
  function paint(force) {
    const btn = $('#stEcon'); if (!btn) return; const now = Date.now(), r = pick(events, now);
    if (!r) { if (!btn.hidden) { btn.hidden = true; } sig = ''; if (pop) hide(); return; }
    const html = chipHtml(r, now), s = r.mode + '|' + html; if (btn.hidden) btn.hidden = false;
    btn.classList.toggle('live', r.mode === 'live'); btn.classList.toggle('soon', r.mode === 'next' && r.ev.main.t - now < 36e5);
    if (force || s !== sig) { sig = s; btn.innerHTML = html; btn.title = `${r.ev.main.title} · ${COUNTRY[r.ev.main.country] || r.ev.main.country}`; }
    if (pop) { pop.innerHTML = popHtml(now); place(); }
  }
  function place() { const b = $('#stEcon'); if (!pop || !b) return; const r = b.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px'; pop.style.bottom = (innerHeight - r.top + 8) + 'px'; }
  function show() { if (pop) return; pop = document.createElement('div'); pop.className = 'ec-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Próximos eventos económicos'); document.body.appendChild(pop); pop.innerHTML = popHtml(Date.now()); place(); const b = $('#stEcon'); if (b) b.setAttribute('aria-expanded', 'true'); }
  function hide() { if (pop) { pop.remove(); pop = null; const b = $('#stEcon'); if (b) b.setAttribute('aria-expanded', 'false'); } }
  async function load() {
    if (busy || !deskMQ.matches) return; busy = true;
    try { const r = await fetch('calendar-data.json?_=' + Math.floor(Date.now() / 6e4), {cache: 'no-store'}); if (r.ok) { const j = await r.json(); if (Array.isArray(j.events)) { events = j.events; loadedAt = Date.now(); } } } catch {}
    busy = false; paint(true);
  }
  function wantFresh(now) { // tras un evento importante sin dato, se vuelve a pedir cada minuto (el resultado aparece cuando el flujo lo publica)
    return events.some(e => imp(e) >= 1 && e.t <= now && now - e.t < 3 * 36e5 && !has(e.actual) && REL.includes(e.country));
  }
  function tick() {
    if (!deskMQ.matches || document.hidden) return; const now = Date.now();
    if (now - loadedAt > (wantFresh(now) ? 60e3 : 5 * 60e3)) load(); else paint(false);
  }
  function start() {
    const btn = $('#stEcon'); if (!btn) return;
    btn.addEventListener('click', e => { e.stopPropagation(); pop ? hide() : show(); });
    document.addEventListener('pointerdown', e => { if (pop && !e.target.closest('#stEcon, .ec-pop')) hide(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
    document.addEventListener('click', e => { if (!e.target.closest('#ecOpen')) return; hide(); const n = document.querySelector('[data-view="newsView"]'); if (n) { n.click(); setTimeout(() => { const c = document.querySelector('[data-nw-tab="cal"]'); if (c) c.click(); }, 120); } });
    window.addEventListener('resize', () => { place(); if (!deskMQ.matches) hide(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    load(); clearInterval(timer); timer = setInterval(tick, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof self !== 'undefined' ? self : this);
