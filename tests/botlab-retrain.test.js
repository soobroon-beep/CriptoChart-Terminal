const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../botlab-engine.js'), R = require('../scripts/botlab-retrain.js');
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function walk(n, seed = 1) { const r = rng(seed), out = []; let p = 100; const t0 = Date.UTC(2025, 0, 1); for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (r() - .5) * .02 + Math.sin(i / 25) * .004); out.push({t: t0 + i * 3600e3, o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * .998, c, v: 1000 + r() * 500}); p = c; } return out; }
const mkBot = (o = {}) => { const s = B.defaultSpec(); s.entry.long = [{a: {k: 'ema', n: 10}, op: 'crossUp', b: {k: 'ema', n: 30}}]; s.exit.long = [{a: {k: 'ema', n: 10}, op: 'crossDown', b: {k: 'ema', n: 30}}]; return Object.assign({id: 'b1', status: 'tested', mainV: 1, cycle: {enabled: true, everyHours: 24}, versions: [{v: 1, spec: s}]}, o); };
test('retrainBot: resultado completo, sin cambiar el bot ni su versión principal', async () => {
  const bot = mkBot(), before = JSON.stringify(bot), r = await R.retrainBot(bot, [], async () => walk(3000, 3), Date.UTC(2026, 10, 7));
  assert.equal(r.status, 'ok'); assert.ok(['propuesta', 'sin_mejora', 'no_aplica'].includes(r.decision)); assert.ok(r.monitor && r.folds.length >= 3); assert.equal(JSON.stringify(bot), before);
  assert.ok(r.decision !== 'propuesta' || r.candidate);
});
test('retrainBot: errores claros (poca data, indicador propio inexistente)', async () => {
  assert.match((await R.retrainBot(mkBot(), [], async () => walk(100), 1)).reason, /Pocas velas/);
  const b = mkBot(); b.versions[0].spec.entry.long = [{a: {k: 'user', sid: 'zz', src: 'al:x', sname: 'Mi Signals'}, op: 'is'}]; const r = await R.retrainBot(b, [], async () => walk(2000), 1);
  assert.equal(r.status, 'error'); assert.match(r.reason, /Mi Signals/);
});
test('due(): respeta activación, pausa y frecuencia', () => {
  const now = Date.now(); assert.equal(R.due(mkBot(), null, now), true); assert.equal(R.due(mkBot({cycle: {enabled: false}}), null, now), false); assert.equal(R.due(mkBot({status: 'paused'}), null, now), false);
  assert.equal(R.due(mkBot(), {at: now - 3600e3}, now), false); assert.equal(R.due(mkBot(), {at: now - 25 * 3600e3}, now), true); assert.equal(R.due(mkBot(), {at: now - 3600e3}, now, true), true);
});
test('sin FIREBASE_SERVICE_ACCOUNT sale sin error y sin tocar nada', () => {
  const r = require('child_process').spawnSync('node', ['scripts/botlab-retrain.js'], {env: Object.assign({}, process.env, {FIREBASE_SERVICE_ACCOUNT: ''}), encoding: 'utf8', cwd: require('path').join(__dirname, '..')});
  assert.equal(r.status, 0); assert.match(r.stdout, /no está configurado/);
});

test('paperBot: avanza sesiones activas del servidor con el mismo libro que la app (cadena de hashes continúa)', async () => {
  const P = require('../botlab-paper.js'), C = walk(2600, 8), T = i => Date.UTC(2025, 0, 1) + i * 3600e3, bot = mkBot(), sess = P.newSession({id: 's1', v: 1, spec: bot.versions[0].spec, capital: 10000, startT: T(1000)}); bot.paper = [sess];
  await P.step(sess, async (s, i, n) => C.slice(0, 1800).slice(-n), null, T(1800)); const before = sess.ledger.length, firstH = sess.ledger.map(t => t.h);
  const out = await R.paperBot(bot, [], async (s, i, n) => C.slice(-n), T(2600)); assert.equal(out.length, 1); assert.ok(sess.ledger.length >= before); assert.deepEqual(sess.ledger.slice(0, before).map(t => t.h), firstH); assert.ok(P.verify(sess)); assert.equal(sess.by, 'servidor');
  const solo = P.newSession({id: 's2', v: 1, spec: bot.versions[0].spec, capital: 10000, startT: T(1000)}); await P.step(solo, async (s, i, n) => C.slice(-n), null, T(2600)); assert.deepEqual(solo.ledger.map(t => t.h), sess.ledger.map(t => t.h)); // mismo resultado que de una vez
  bot.paper[0].status = 'paused'; assert.equal((await R.paperBot(bot, [], async () => C, T(2600))).length, 0);
});
