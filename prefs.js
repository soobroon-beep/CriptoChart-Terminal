/* Preferencias de VORTEX (zona horaria, hora, fecha, decimales, separadores, sonido y avisos). Funciones puras: se usan igual en la app y en las pruebas. */
(function (root) {
  'use strict';
  const DEF = {tz: 'auto', clock: '24', date: 'dmy', dec: 'auto', sep: 'en', sym: '', sound: 'on', tone: 'beep', n: {price: true, ind: true, discord: true}};
  const TZ = [['auto', 'Automática (la de tu dispositivo)'], ['UTC', 'UTC'], ['America/Mexico_City', 'Ciudad de México'], ['America/New_York', 'Nueva York'], ['America/Bogota', 'Bogotá'], ['America/Argentina/Buenos_Aires', 'Buenos Aires'],
    ['America/Sao_Paulo', 'São Paulo'], ['Europe/London', 'Londres'], ['Europe/Madrid', 'Madrid'], ['Asia/Dubai', 'Dubái'], ['Asia/Singapore', 'Singapur'], ['Asia/Tokyo', 'Tokio'], ['Australia/Sydney', 'Sídney']];
  const TONES = [['beep', 'Pitido'], ['chime', 'Campana'], ['pulse', 'Pulso'], ['alarm', 'Alarma']];
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const okTz = z => { if (z === 'auto') return true; try { new Intl.DateTimeFormat('en', {timeZone: z}); return TZ.some(x => x[0] === z); } catch { return false; } };
  function sanitize(p) {
    const q = p && typeof p === 'object' && !Array.isArray(p) ? p : {}, o = JSON.parse(JSON.stringify(DEF));
    if (typeof q.tz === 'string' && okTz(q.tz)) o.tz = q.tz;
    if (['24', '12'].includes(String(q.clock))) o.clock = String(q.clock);
    if (['dmy', 'mdy', 'iso'].includes(q.date)) o.date = q.date;
    if (q.dec === 'auto' || [0, 1, 2, 3, 4, 5, 6, 8].includes(+q.dec) && q.dec !== '' && q.dec !== null) o.dec = q.dec === 'auto' ? 'auto' : +q.dec;
    if (['en', 'es', 'sp', 'none'].includes(q.sep)) o.sep = q.sep;
    if (['', '$', 'US$'].includes(q.sym)) o.sym = q.sym;
    if (['on', 'off'].includes(q.sound)) o.sound = q.sound;
    if (TONES.some(t => t[0] === q.tone)) o.tone = q.tone;
    if (q.n && typeof q.n === 'object') for (const k of Object.keys(o.n)) if (typeof q.n[k] === 'boolean') o.n[k] = q.n[k];
    return o;
  }
  const SEP = {en: [',', '.'], es: ['.', ','], sp: [' ', ','], none: ['', '.']};
  function formatPrice(n, p) {
    if (!Number.isFinite(n)) return '—';
    p = p || DEF; const a = Math.abs(n);
    const d = p.dec === 'auto' ? (a >= 1 ? 2 : a < .01 ? 8 : 4) : p.dec;
    const [th, dc] = SEP[p.sep] || SEP.en, [i, f] = a.toFixed(d).split('.');
    const int = th && a >= 1000 ? i.replace(/\B(?=(\d{3})+(?!\d))/g, th) : i;
    return (n < 0 ? '-' : '') + (p.sym || '') + int + (f ? dc + f : '');
  }
  const cache = {};
  function parts(t, tz) { // año, mes, día, hora, minuto en la zona elegida
    if (!tz || tz === 'auto') { const d = new Date(t); return {y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes()}; }
    const f = cache[tz] || (cache[tz] = new Intl.DateTimeFormat('en-GB', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'}));
    const o = {}; for (const x of f.formatToParts(new Date(t))) o[x.type] = +x.value;
    return {y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute};
  }
  const p2 = n => String(n).padStart(2, '0');
  const clock = (q, p) => p.clock === '12' ? `${q.h % 12 || 12}:${p2(q.mi)} ${q.h < 12 ? 'a. m.' : 'p. m.'}` : `${p2(q.h)}:${p2(q.mi)}`;
  const day = (q, p) => p.date === 'mdy' ? `${q.mo}/${q.d}` : p.date === 'iso' ? `${p2(q.mo)}-${p2(q.d)}` : `${q.d}/${q.mo}`;
  function axisLabel(t, prevT, interval, p) { // etiqueta del eje de tiempo
    const q = parts(t, p.tz);
    if (interval === '1M') return `${MES[q.mo - 1]} ${String(q.y).slice(2)}`;
    if (interval === '1d' || interval === '1w') return day(q, p);
    if (prevT != null && parts(prevT, p.tz).d !== q.d) return day(q, p);
    return clock(q, p);
  }
  function full(t, p) { // fecha y hora completas (cursor del gráfico)
    const q = parts(t, p.tz);
    const dd = p.date === 'iso' ? `${q.y}-${p2(q.mo)}-${p2(q.d)}` : p.date === 'mdy' ? `${MES[q.mo - 1]} ${q.d}` : `${q.d} ${MES[q.mo - 1]}`;
    return `${dd} ${clock(q, p)}`;
  }
  const api = {DEF, TZ, TONES, sanitize, formatPrice, parts, axisLabel, full};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CCTPrefs = api;
})(typeof self !== 'undefined' ? self : this);
