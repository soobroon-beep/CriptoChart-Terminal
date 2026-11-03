/* Formato de los mensajes de Discord de VORTEX — funciones puras: las usan el navegador (discord.js) y el envío programado (scripts/discord-screener.js). */
(function (root) {
  'use strict';
  const COL = {up: 0x20bf9f, down: 0xf23645, info: 0x5865f2, long: 0x11cf77, short: 0xd11645, rng: 0x9b59b6};
  const fmt = n => { n = +n; if (!Number.isFinite(n)) return '—'; const a = Math.abs(n); return n.toLocaleString('en-US', {maximumFractionDigits: a >= 1000 ? 2 : a >= 1 ? 4 : 8}); };
  const baseOf = s => String(s).replace(/(USDT|USDC|FDUSD|BUSD)$/, '');
  /* rows: [{symbol, price, sg: {side:'buy'|'sell', range, div, score 1-5, age 1-5}}] → lista de embeds (LONG, SHORT, RANGO) */
  function signalEmbeds(tf, rows, analyzed) {
    const line = r => `**${baseOf(r.symbol)}** · ${fmt(r.price)} · ${'★'.repeat(r.sg.score)}${'☆'.repeat(Math.max(0, 5 - r.sg.score))}${r.sg.div ? ' · divergencia' : ''} · vela ${r.sg.age}/5`;
    const group = (title, arr, color) => arr.length ? {title: `${title} (${arr.length})`, description: arr.map(line).join('\n').slice(0, 3000), color} : null;
    const L = rows.filter(r => !r.sg.range && r.sg.side === 'buy'), S = rows.filter(r => !r.sg.range && r.sg.side !== 'buy'), R = rows.filter(r => r.sg.range);
    const em = [group('🟢 LONG', L, COL.long), group('🔴 SHORT', S, COL.short), group('🟣 RANGO', R, COL.rng)].filter(Boolean);
    const withSig = new Set(rows.map(r => r.symbol)), rest = (analyzed || []).filter(s => !withSig.has(s)).map(baseOf);
    if (rest.length) em.push({title: `⚪ Sin señal (${rest.length})`, description: rest.join(' · ').slice(0, 1500), color: 0x40405c});
    if (!rows.length) em.unshift({title: `Screener ${tf} · sin señales activas`, description: 'Ninguna de las criptos analizadas tiene señal de Nova Nexus en las últimas 5 velas.', color: COL.info});
    em[0].author = {name: `Screener Nova Nexus · ${tf}`};
    const n = (analyzed || []).length || rows.length;
    em[em.length - 1].footer = {text: `VORTEX · ${rows.length} con señal de ${n} analizadas · Top por volumen · Binance Spot`}; em[em.length - 1].timestamp = new Date().toISOString();
    return em;
  }
  const api = {COL, fmt, baseOf, signalEmbeds};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CCTDiscordFmt = api;
})(typeof self !== 'undefined' ? self : this);
