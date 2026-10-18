'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../pine.js'), I = require('../indicators.js');
const near = (a, b, eps = 1e-9) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const closes = arr => arr.map((c, i) => ({t: i * 36e5, o: c, h: c + 1, l: c - 1, c, v: 10}));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const walkC = (n) => { let p = 100; return Array.from({length: n}, (_, i) => { const o = p, c = o + (rnd() - .5) * 4, h = Math.max(o, c) + rnd() * 2, l = Math.min(o, c) - rnd() * 2; p = c; return {t: i * 36e5, o, h, l, c, v: 50 + rnd() * 50}; }); };
const hdr = '//@version=5\nindicator("t", overlay=true)\n';
const vals = (code, cs, opts) => { const r = P.run(hdr + code, cs, opts); assert.ok(r.ok, JSON.stringify(r.error)); return r; };

test('SMA/EMA/RMA con valores derivados a mano', () => {
  const r = vals('plot(ta.sma(close,3))\nplot(ta.ema(close,3))\nplot(ta.rma(close,3))', closes([1, 2, 3, 4, 5]));
  assert.deepEqual(r.plots[0].values, [null, null, 2, 3, 4]);
  [1, 1.5, 2.25, 3.125, 4.0625].forEach((x, i) => near(r.plots[1].values[i], x));
  assert.equal(r.plots[2].values[1], null); near(r.plots[2].values[2], 2); near(r.plots[2].values[3], 8 / 3); near(r.plots[2].values[4], 31 / 9);
});
test('RSI de Wilder contra referencia independiente', () => {
  const cs = walkC(80), r = vals('plot(ta.rsi(close,14))', cs), c = cs.map(x => x.c);
  let up = 0, dn = 0; const ref = [];
  for (let i = 1; i < c.length; i++) { const ch = c[i] - c[i - 1], u = Math.max(ch, 0), d = Math.max(-ch, 0); if (i <= 14) { up += u; dn += d; if (i === 14) { up /= 14; dn /= 14; } } else { up = (up * 13 + u) / 14; dn = (dn * 13 + d) / 14; } ref[i] = i >= 14 ? 100 - 100 / (1 + up / dn) : null; }
  for (let i = 14; i < c.length; i++) near(r.plots[0].values[i], ref[i], 1e-9);
  assert.equal(r.plots[0].values[13], null);
});
test('ATR (rma de TR, primera barra high-low) y MACD con semilla de la fuente', () => {
  const cs = walkC(60), r = vals('plot(ta.atr(10))\n[m, s, h] = ta.macd(close, 3, 5, 2)\nplot(m)\nplot(s)\nplot(h)', cs);
  const tr = cs.map((k, i) => i ? Math.max(k.h - k.l, Math.abs(k.h - cs[i - 1].c), Math.abs(k.l - cs[i - 1].c)) : k.h - k.l);
  let a = tr.slice(0, 10).reduce((x, y) => x + y) / 10; near(r.plots[0].values[9], a);
  for (let i = 10; i < 60; i++) { a = (a * 9 + tr[i]) / 10; near(r.plots[0].values[i], a); }
  const ema = (src, n) => { const o = [], k = 2 / (n + 1); src.forEach((v, i) => o.push(i ? k * v + (1 - k) * o[i - 1] : v)); return o; };
  const c = cs.map(x => x.c), e3 = ema(c, 3), e5 = ema(c, 5), m = e3.map((v, i) => v - e5[i]), sg = ema(m, 2);
  for (let i = 0; i < 60; i++) { near(r.plots[1].values[i], m[i]); near(r.plots[2].values[i], sg[i]); near(r.plots[3].values[i], m[i] - sg[i]); }
});
test('Supertrend de Pine coincide con la implementación de indicators.js', () => {
  const cs = walkC(120), r = vals('[st, d] = ta.supertrend(3, 10)\nplot(st)\nplot(d)', cs);
  const ref = I.supertrend(cs, 10, 3);
  let cmp = 0; for (let i = 0; i < cs.length; i++) { const v = r.plots[0].values[i]; if (v === null) continue; const up = ref.up ? ref.up[i] : null, dn = ref.dn ? ref.dn[i] : null, want = r.plots[1].values[i] === -1 ? up : dn; if (want != null) { near(v, want, 1e-7); cmp++; } }
  assert.ok(cmp > 80, 'compara suficientes barras: ' + cmp);
});
test('variables var, historial [], funciones de usuario, for y ternario', () => {
  const r = vals(['f(x, k = 2) =>', '    y = x * k', '    y + 1', 'var cnt = 0', 'cnt := cnt + 1', 'a = f(close)', 'b = a[1]', 's = 0.0', 'for i = 1 to 3', '    s += i', 'w = close > 2 ? 1 : 0', 'plot(cnt)', 'plot(a)', 'plot(b)', 'plot(s)', 'plot(w)', 'plot(f(close, k=3))'].join('\n'), closes([1, 2, 3, 4]));
  assert.deepEqual(r.plots[0].values, [1, 2, 3, 4]); assert.deepEqual(r.plots[1].values, [3, 5, 7, 9]);
  assert.deepEqual(r.plots[2].values, [null, 3, 5, 7]); assert.deepEqual(r.plots[3].values, [6, 6, 6, 6]); assert.deepEqual(r.plots[4].values, [0, 0, 1, 1]);
  assert.deepEqual(r.plots[5].values, [4, 7, 10, 13]);
});
test('if como expresión, switch, while/break y continuación de línea', () => {
  const r = vals(['x = if close > 2', '    10', 'else', '    20', 'y = switch', '    close == 1 => 100', '    close == 2 => 200', '    => 300', 'n = 0', 'while true', '    n += 1', '    if n >= 5', '        break', 'z = close +', '     1', 'plot(x)', 'plot(y)', 'plot(n)', 'plot(z)'].join('\n'), closes([1, 2, 3]));
  assert.deepEqual(r.plots[0].values, [20, 20, 10]); assert.deepEqual(r.plots[1].values, [100, 200, 300]); assert.deepEqual(r.plots[2].values, [5, 5, 5]); assert.deepEqual(r.plots[3].values, [2, 3, 4]);
});
test('pivothigh/lowest/highest/crossover/barssince', () => {
  const r = vals('plot(ta.pivothigh(high, 1, 1))\nplot(ta.highest(close, 3))\nplot(ta.crossover(close, 3) ? 1 : 0)\nplot(ta.barssince(close > 3))', closes([1, 3, 2, 4, 5, 2]));
  assert.deepEqual(r.plots[0].values, [null, null, 4, null, null, 6]); // pivote en la vela 1 (high 4), confirmado una vela después
  assert.deepEqual(r.plots[1].values, [null, null, 3, 4, 5, 5]);
  assert.deepEqual(r.plots[2].values, [0, 0, 0, 1, 0, 0]);
  assert.deepEqual(r.plots[3].values, [null, null, null, 0, 0, 1]);
});
test('colores, plotshape, bgcolor, hline, fill, inputs editables', () => {
  const code = 'len = input.int(2, "Largo", minval=1)\nm = ta.sma(close, len)\np1 = plot(m, color=color.new(color.red, 50))\np2 = plot(close, color=#00FF0080)\nfill(p1, p2, color=color.from_gradient(close, 1, 3, color.red, color.green))\nhline(2, "dos")\nbgcolor(close > 2 ? color.new(color.blue, 80) : na)\nplotshape(close > 2, style=shape.triangleup, location=location.belowbar, color=color.lime, text="up")';
  const r = vals(code, closes([1, 2, 3]));
  assert.equal(r.inputs.length, 1); assert.equal(r.inputs[0].value, 2); assert.equal(r.inputs[0].min, 1);
  assert.equal(r.palette[r.plots[0].cc], 'rgba(242,54,69,0.500)'); assert.equal(r.palette[r.plots[1].cc].startsWith('rgba(0,255,0,0.50'), true);
  assert.equal(r.fills.length, 1); assert.ok(r.fills[0].ci && r.fills[0].ci.every(x => x !== null));
  assert.equal(r.hlines[0].price, 2); assert.equal(r.bgcolors[0].pts.length, 1); assert.equal(r.shapes[0].pts.length, 1); assert.equal(r.shapes[0].style, 'triangleup');
  const r2 = vals(code, closes([1, 2, 3]), {inputs: {0: 3}}); assert.deepEqual(r2.plots[0].values, [null, null, 2]); assert.equal(r2.inputs[0].value, 3);
});
test('label.new / line.new / box.new con límite y delete', () => {
  const r = vals('var lb = array.new<label>(0)\nif close > 1\n    label.new(bar_index, high, "x" + str.tostring(close))\nline.new(bar_index, close, bar_index + 1, close)\nbox.new(bar_index, high, bar_index + 1, low)', closes([1, 2, 3]));
  assert.equal(r.labels.length, 2); assert.equal(r.labels[0].text, 'x2'); assert.equal(r.lines.length, 3); assert.equal(r.boxes.length, 3);
  const r2 = vals('indicator("t", max_labels_count=2)\nlabel.new(bar_index, high, "a")', closes([1, 2, 3, 4]));
  assert.equal(r2.labels.length, 2); assert.equal(r2.labels[0].x, 2);
});
test('lo no soportado se avisa con su línea y marca el resultado como incompleto', () => {
  const r = vals('t = table.new(position.top_right, 2, 2)\nx = ta.foo(close, 3)\nplot(x)\nstrategy.entry("L", strategy.long)', closes([1, 2, 3]));
  assert.equal(r.complete, false);
  const un = r.warnings.filter(w => w.level === 'unsupported').map(w => w.msg);
  assert.ok(un.some(m => m.includes('table.new')) && un.some(m => m.includes('ta.foo')) && un.some(m => m.includes('strategy')), un.join(' | '));
  assert.ok(r.warnings.find(w => w.msg.includes('table.new')).line === 3);
  assert.equal(r.plots[0].values[2], null);
  const ok = vals('plot(ta.sma(close,2))', closes([1, 2, 3])); assert.equal(ok.complete, true);
});
test('request.security solo con el símbolo/temporalidad del gráfico; si no, avisa y da na', () => {
  const r = vals('a = request.security(syminfo.tickerid, timeframe.period, close)\nb = request.security("BINANCE:ETHUSDT", "D", close)\nplot(a)\nplot(b)', closes([5, 6]), {symbol: 'BTCUSDT', interval: '1h'});
  assert.deepEqual(r.plots[0].values, [5, 6]); assert.deepEqual(r.plots[1].values, [null, null]); assert.equal(r.complete, false);
});
test('errores de sintaxis y de ejecución dan línea; tipos y bibliotecas no soportados fallan claro', () => {
  let r = P.run(hdr + 'x = (1 + ', closes([1])); assert.equal(r.ok, false);
  r = P.run(hdr + 'plot(1)\nx = $', closes([1])); assert.equal(r.ok, false); assert.equal(r.error.line, 4);
  r = P.run(hdr + 'plot(noexiste)', closes([1])); assert.equal(r.ok, false); assert.match(r.error.msg, /noexiste/);
  r = P.run(hdr + 'type Foo\n    float x', closes([1])); assert.equal(r.ok, false); assert.match(r.error.msg, /type/);
  r = P.run(hdr + 'import a/b/1 as c', closes([1])); assert.equal(r.ok, false);
});
test('seguridad: sin acceso a JavaScript ni al prototipo; bucle infinito se corta por tiempo', () => {
  for (const nm of ['constructor', 'process', 'globalThis', 'require', '__proto__', 'toString']) { const r = P.run(hdr + `plot(${nm})`, closes([1])); assert.equal(r.ok, false, nm); }
  let r = P.run(hdr + 'x = ta.constructor(1)\ny = math.constructor(2)\nplot(1)', closes([1])); assert.ok(r.ok); assert.equal(r.complete, false);
  const t0 = Date.now(); r = P.run(hdr + 'while true\n    x = 1', closes([1, 2]), {timeLimitMs: 300}); assert.equal(r.ok, false); assert.match(r.error.msg, /tiempo/); assert.ok(Date.now() - t0 < 3000);
  r = P.run(hdr + 'a = array.new_float(100000000)\nplot(1)', closes([1])); assert.equal(r.ok, false);
});
test('versión antigua: study() y sma() sin prefijo con aviso informativo', () => {
  const r = P.run('//@version=4\nstudy("x")\nplot(sma(close, 2))', closes([1, 2, 3])); assert.ok(r.ok, JSON.stringify(r.error)); assert.deepEqual(r.plots[0].values, [null, 1.5, 2.5]);
  assert.ok(r.warnings.some(w => w.level === 'info' && /versión 4/.test(w.msg)));
});
test('arrays, strings y math', () => {
  const r = vals('a = array.new_float(0)\narray.push(a, close)\na.push(close * 2)\nplot(a.size())\nplot(array.sum(a))\nplot(math.round(2.5))\nplot(math.max(1, 5, 3))\nplot(str.length(str.tostring(close, "#.##")))\nplot(math.round(-2.5))\nplot(nz(na, 7))', closes([1.234]));
  assert.deepEqual(r.plots.map(p => p.values[0]), [2, 3.702, 3, 5, 4, -3, 7]);
});
