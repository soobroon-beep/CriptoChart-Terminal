/* Sesiones de las bolsas (Nueva York, Londres, Tokio…): qué mercado está abierto ahora y cuándo abre o cierra, con horario de verano de cada país.
   Horarios regulares de cada bolsa; no incluye feriados. Funciones puras: se usan en la app y en las pruebas. */
(function (root) {
  'use strict';
  const MARKETS = [
    {id: 'ny', name: 'Nueva York', short: 'NY', tz: 'America/New_York', color: '#20bf9f', days: [1, 2, 3, 4, 5], parts: [[9, 30, 16, 0]]},
    {id: 'lon', name: 'Londres', short: 'LON', tz: 'Europe/London', color: '#4cc2ff', days: [1, 2, 3, 4, 5], parts: [[8, 0, 16, 30]]},
    {id: 'fra', name: 'Fráncfort', short: 'FRA', tz: 'Europe/Berlin', color: '#e9c36e', days: [1, 2, 3, 4, 5], parts: [[9, 0, 17, 30]]},
    {id: 'tyo', name: 'Tokio', short: 'TYO', tz: 'Asia/Tokyo', color: '#ff9f43', days: [1, 2, 3, 4, 5], parts: [[9, 0, 11, 30], [12, 30, 15, 30]]},
    {id: 'hkg', name: 'Hong Kong', short: 'HKG', tz: 'Asia/Hong_Kong', color: '#f06b79', days: [1, 2, 3, 4, 5], parts: [[9, 30, 12, 0], [13, 0, 16, 0]]},
    {id: 'syd', name: 'Sídney', short: 'SYD', tz: 'Australia/Sydney', color: '#b48cff', days: [1, 2, 3, 4, 5], parts: [[10, 0, 16, 0]]},
    {id: 'cme', name: 'CME Globex', short: 'CME', tz: 'America/Chicago', color: '#dfe6f2', days: [0, 1, 2, 3, 4], parts: [[17, 0, 16, 0, 1]]} // de domingo 17:00 a viernes 16:00 (hora de Chicago), con pausa diaria de 16:00 a 17:00
  ];
  const fmts = {};
  const fmtOf = tz => fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat('en-GB', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'}));
  function fields(t, tz) { const o = {}; for (const x of fmtOf(tz).formatToParts(new Date(t))) if (x.type !== 'literal') o[x.type] = +x.value; return {y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second}; }
  const offsetMs = (t, tz) => { const f = fields(t, tz); return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) - Math.floor(t / 1000) * 1000; };
  function zonedToUtc(y, mo, d, h, mi, tz) { // fecha y hora de pared en esa zona → milisegundos UTC (con horario de verano)
    const guess = Date.UTC(y, mo - 1, d, h, mi); let t = guess - offsetMs(guess, tz); t = guess - offsetMs(t, tz); return t;
  }
  function intervals(m, now) { // tramos abiertos [inicio, fin, parte] alrededor de «ahora» (ayer a pasado mañana, en la zona de la bolsa)
    const f = fields(now, m.tz), out = [];
    for (let k = -2; k <= 2; k++) {
      const D = new Date(Date.UTC(f.y, f.mo - 1, f.d + k)), wd = D.getUTCDay(); if (!m.days.includes(wd)) continue;
      const y = D.getUTCFullYear(), mo = D.getUTCMonth() + 1, d = D.getUTCDate();
      m.parts.forEach((p, i) => { const E = new Date(Date.UTC(y, mo - 1, d + (p[4] || 0))); out.push([zonedToUtc(y, mo, d, p[0], p[1], m.tz), zonedToUtc(E.getUTCFullYear(), E.getUTCMonth() + 1, E.getUTCDate(), p[2], p[3], m.tz), i]); });
    }
    return out.sort((a, b) => a[0] - b[0]);
  }
  function status(m, now) { // {open, until: cuándo cambia, next: próxima apertura}
    const iv = intervals(m, now), cur = iv.find(x => now >= x[0] && now < x[1]);
    if (cur) return {open: true, until: cur[1], from: cur[0]};
    const nx = iv.find(x => x[0] > now); return {open: false, until: nx ? nx[0] : null, from: null};
  }
  function all(now) { return MARKETS.map(m => ({m, ...status(m, now)})); }
  function headline(now) { // el mercado abierto que cierra primero; si no hay ninguno, el que abre primero
    const s = all(now), open = s.filter(x => x.open).sort((a, b) => a.until - b.until);
    if (open.length) return {kind: 'close', ...open[0], openCount: open.length};
    const nx = s.filter(x => x.until).sort((a, b) => a.until - b.until)[0]; return nx ? {kind: 'open', ...nx, openCount: 0} : null;
  }
  function dur(ms) { const m = Math.max(0, Math.round(ms / 6e4)), h = Math.floor(m / 60), mm = m % 60, d = Math.floor(h / 24); return d >= 1 ? `${d} d ${h % 24} h` : h ? (mm && h < 10 ? `${h} h ${mm} m` : `${h} h`) : `${mm} m`; }
  const api = {MARKETS, zonedToUtc, intervals, status, all, headline, dur, fields};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CCTSessions = api;
})(typeof self !== 'undefined' ? self : this);
