const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../llm.js');
const mkRes = (body, ok = true, status = 200, ct = 'application/json') => ({ok, status, headers: {get: () => ct}, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body)});
const reply = t => ({choices: [{message: {content: t}}]});
function mockFetch0(){}
function mockFetch(fn) { const calls = []; L.resetCache(); global.fetch = async (url, o) => { calls.push({url, body: o && o.body ? JSON.parse(o.body) : null, o}); return fn(url, o, calls.length); }; return calls; }

test('pickFree prioriza modelos abiertos y visión cuando hay imagen', () => {
  const list = [{name: 'openai-fast'}, {name: 'mistral', vision: true}, {name: 'llama'}, {name: 'qwen-coder'}, {name: 'unity'}];
  assert.equal(L.pickFree(list, {needVision: true})[0], 'mistral');
  assert.equal(L.pickFree(list, {code: true})[0], 'qwen-coder');
  assert.ok(!L.pickFree(list, {}).includes('openai-fast'));
  assert.deepEqual(L.pickFree([], {}).length > 0, true);
});
test('extractCode saca el bloque Pine, incluso sin cerrar', () => {
  assert.equal(L.extractCode('Hola\n```pine\n//@version=5\nindicator("A")\nplot(close)\n```\nfin'), '//@version=5\nindicator("A")\nplot(close)');
  assert.match(L.extractCode('x\n```pinescript\n//@version=5\nindicator("B")\nplot(1)'), /indicator\("B"\)/);
  assert.equal(L.extractCode('solo texto'), '');
  assert.equal(L.stripCode('Explico\n```pine\ncode\n```'), 'Explico');
});
test('chat gratuito: usa modelos abiertos y reintenta con otro si el primero falla', async () => {
  const calls = mockFetch((url, o, n) => /models/.test(url) ? mkRes([{name: 'mistral'}, {name: 'llama'}]) : n === 2 ? mkRes({error: {message: 'boom'}}, false, 500) : mkRes(reply('hola')));
  const r = await L.chat([{role: 'user', content: 'hi'}], {cfg: {provider: 'free', compat: {}}});
  assert.equal(r.text, 'hola'); assert.equal(calls.filter(c => c.body).length, 2); assert.notEqual(calls[1].body.model, calls[2].body.model);
});
test('sin visión el servicio recibe texto y se avisa que la captura no se envió', async () => {
  const calls = mockFetch((url) => /models/.test(url) ? mkRes([{name: 'llama', vision: false}]) : mkRes(reply('ok')));
  const r = await L.chat([L.imageMessage('analiza', 'data:image/jpeg;base64,AAA')], {cfg: {provider: 'free', compat: {}}});
  const sent = calls.find(c => c.body).body.messages[0].content; assert.equal(typeof sent, 'string'); assert.match(sent, /captura/); assert.equal(r.image, false);
});
test('con visión la imagen viaja tal cual', async () => {
  const calls = mockFetch((url) => /models/.test(url) ? mkRes([{name: 'mistral', vision: true}]) : mkRes(reply('ok')));
  const r = await L.chat([L.imageMessage('analiza', 'data:image/jpeg;base64,AAA')], {cfg: {provider: 'free', compat: {}}});
  assert.ok(calls.find(c => c.body).body.messages[0].content.some(p => p.type === 'image_url')); assert.equal(r.image, true);
});
test('servidor compatible: URL, clave y modelo configurados; quita <think>', async () => {
  const calls = mockFetch(() => mkRes(reply('<think>x</think>Respuesta')));
  const r = await L.chat([{role: 'user', content: 'q'}], {cfg: {provider: 'compat', compat: {url: 'http://localhost:11434/v1/', key: 'k', model: 'qwen', vision: false}}});
  assert.equal(r.text, 'Respuesta'); assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions'); assert.equal(calls[0].o.headers.authorization, 'Bearer k'); assert.equal(calls[0].body.model, 'qwen');
});
test('errores: límite, red y mensajes en español', async () => {
  mockFetch(() => mkRes({error: 'x'}, false, 429));
  await assert.rejects(L.chat([{role: 'user', content: 'q'}], {cfg: {provider: 'compat', compat: {url: 'http://x/v1', model: 'm'}}}), e => e.kind === 'rate' && /saturado/.test(e.message));
  global.fetch = async () => { throw new TypeError('fail'); };
  await assert.rejects(L.chat([{role: 'user', content: 'q'}], {cfg: {provider: 'compat', compat: {url: 'http://x/v1', model: 'm'}}}), e => e.kind === 'network' && /conexión/.test(e.message));
});
test('transmisión SSE acumula tokens', async () => {
  const enc = new TextEncoder(), chunks = ['data: {"choices":[{"delta":{"content":"Ho"}}]}\n', 'data: {"choices":[{"delta":{"content":"la"}}]}\ndata: [DONE]\n'];
  let i = 0; global.fetch = async () => ({ok: true, status: 200, headers: {get: () => 'text/event-stream'}, body: {getReader: () => ({read: async () => i < chunks.length ? {done: false, value: enc.encode(chunks[i++])} : {done: true}})}});
  const seen = []; const r = await L.chat([{role: 'user', content: 'q'}], {cfg: {provider: 'compat', compat: {url: 'http://x/v1', model: 'm'}}, onToken: t => seen.push(t)});
  assert.equal(r.text, 'Hola'); assert.deepEqual(seen, ['Ho', 'Hola']);
});
test('signalMetrics mide el movimiento posterior a cada señal', () => {
  const c = Array.from({length: 40}, (_, i) => ({c: 100 + i})), res = {shapes: [{title: 'Compra', loc: 'belowbar', pts: [[2], [10]]}, {title: 'Venta', loc: 'abovebar', pts: [[5]]}, {title: 'x', loc: 'absolute', pts: [[1]]}]};
  const m = L.signalMetrics(c, res); assert.equal(m.signals.length, 2);
  assert.equal(m.signals[0].h[5].hit, 100); assert.equal(m.signals[1].h[5].hit, 0); assert.match(m.note, /no es un resultado real/);
});
test('carga y guarda ajustes con valores por defecto seguros', () => {
  const store = {}; global.localStorage = {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => delete store[k]};
  assert.equal(L.load().provider, 'free'); L.save({provider: 'compat', compat: {url: 'http://a/v1', key: '', model: 'm', vision: false}});
  assert.equal(L.load().provider, 'compat'); assert.equal(L.load().compat.vision, false);
  store.cct_llm_v1 = '{"provider":"hack"}'; assert.equal(L.load().provider, 'free');
  store.cct_llm_v1 = '{"provider":"webllm"}'; const m = L.load(); assert.equal(m.provider, 'free'); assert.equal(m.lab, 'webllm'); // migración: general gratis, Laboratorio en el navegador
  store.cct_llm_v1 = '{"provider":"free","lab":"free"}'; assert.equal(L.load().lab, 'free');
});

test('el Laboratorio usa su propio proveedor y cae al general si no hay WebGPU', async () => {
  const calls = mockFetch(() => mkRes(reply('ok')));
  const cfg = {provider: 'compat', lab: 'webllm', compat: {url: 'http://x/v1', model: 'm'}};
  await L.chat([{role: 'user', content: 'q'}], {cfg, purpose: 'code'}); // en node no hay navigator.gpu -> compat
  assert.equal(calls[0].url, 'http://x/v1/chat/completions');
});

test('applyPatch cambia solo lo pedido (exacto, con sangría distinta y bloques fallidos)', () => {
  const code = '//@version=5\nindicator("A")\nf = ta.ema(close, 9)\n    s = ta.ema(close, 21)\nplot(f)\nplot(s)';
  let r = L.applyPatch(code, 'Cambio.\n<<<<<<< SEARCH\nf = ta.ema(close, 9)\n=======\nf = ta.ema(close, 12)\n>>>>>>> REPLACE');
  assert.equal(r.applied, 1); assert.match(r.code, /close, 12/); assert.match(r.code, /plot\(s\)/); assert.equal(r.code.split('\n').length, 6);
  r = L.applyPatch(code, '<<<<<<< SEARCH\ns = ta.ema(close, 21)\n=======\ns = ta.ema(close, 30)\n>>>>>>> REPLACE'); // ignora diferencias de sangría
  assert.equal(r.applied, 1); assert.match(r.code, /close, 30/);
  r = L.applyPatch(code, '<<<<<<< SEARCH\nplot(f)\n=======\nplot(f)\nplot(close)\n>>>>>>> REPLACE'); assert.match(r.code, /plot\(f\)\nplot\(close\)/); // añadir
  r = L.applyPatch(code, '<<<<<<< SEARCH\nlinea inexistente\n=======\nx\n>>>>>>> REPLACE'); assert.equal(r.applied, 0); assert.equal(r.failed.length, 1); assert.equal(r.changed, false);
  assert.equal(L.applyPatch(code, 'sin bloques').found, 0);
});
