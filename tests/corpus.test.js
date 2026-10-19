'use strict';
// Corpus de indicadores de uso general (escritos en el estilo de scripts públicos de TradingView, no los de una persona en particular).
// Cada uno debe interpretarse sin error; si se pegan con formatos de archivo distintos (CRLF, BOM, tabuladores) el resultado debe ser el mismo.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const P = require('../pine.js');
const dir = path.join(__dirname, 'corpus');
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const mk = (n, ms) => { const a = []; let p = 100; const t0 = Date.UTC(2024, 0, 1); for (let i = 0; i < n; i++) { const o = p, c = o + (rnd() - .5) * 4, h = Math.max(o, c) + rnd() * 2, l = Math.min(o, c) - rnd() * 2; a.push({t: t0 + i * ms, o, h, l, c, v: 50 + rnd() * 100}); p = c; } return a; };
const cs = mk(600, 36e5), MS = {'1d': 864e5, '1w': 6048e5, '1M': 2592e6, '4h': 144e5, '15m': 9e5, '5m': 3e5, '1m': 6e4};
const run = code => { let r = P.run(code, cs, {interval: '1h', symbol: 'BTCUSDT', timeLimitMs: 8000}); if (r.ok && r.needs.length) { const sec = {}; for (const n of r.needs) sec[n.symbol + '|' + n.interval] = mk(200, MS[n.interval] || 864e5); r = P.run(code, cs, {interval: '1h', symbol: 'BTCUSDT', timeLimitMs: 8000, sec}); } return r; };
const files = fs.readdirSync(dir).filter(f => f.endsWith('.pine'));
for (const f of files) {
  const code = fs.readFileSync(path.join(dir, f), 'utf8');
  test(`corpus: ${f}`, () => {
    const r = run(code); assert.ok(r.ok, r.error && `${r.error.line}: ${r.error.msg}`);
    const un = r.warnings.filter(w => w.level === 'unsupported' && !/strategy/.test(w.msg));
    assert.equal(un.length, 0, un.map(w => w.msg).join(' | '));
    const empty = r.plots.filter(q => !q.values.some(v => v !== null)).map(q => q.title); assert.equal(empty.length, 0, 'plots sin ningún valor: ' + empty.join(', '));
    const sig = x => JSON.stringify([x.plots.map(p => p.values.filter(v => v !== null).length), x.shapes.length, x.labels.length, x.lines.length, x.boxes.length]);
    for (const [nm, v] of [['CRLF', code.replace(/\n/g, '\r\n')], ['BOM', '﻿' + code], ['tabs', code.replace(/^( {4})+/gm, m => '\t'.repeat(m.length / 4))], ['sin salto final', code.trimEnd()]]) {
      const r2 = run(v); assert.ok(r2.ok, `${nm}: ` + (r2.error && `${r2.error.line}: ${r2.error.msg}`)); assert.equal(sig(r2), sig(r), nm);
    }
  });
}
