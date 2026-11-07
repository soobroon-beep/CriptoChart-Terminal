// Pruebas del Worker de notificaciones push (worker/push-alerts.mjs): cifrado Web Push, firma VAPID, lógica de alertas y ronda programada.
const test = require('node:test'), assert = require('node:assert');
const {subtle} = globalThis.crypto;
const W = () => import('../worker/push-alerts.mjs');

async function fakeBrowserSub(b64u) { // lo que genera el navegador al suscribirse: par ECDH P-256 + secreto de 16 bytes
  const kp = await subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return {kp, auth, sub: {endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: {p256dh: b64u(await subtle.exportKey('raw', kp.publicKey)), auth: b64u(auth)}}};
}
async function hk(salt, ikm, info, len) { const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info}, k, len * 8)); }
async function decrypt(body, kp, auth) { // descifrado del lado del navegador (RFC 8291), escrito aparte para comprobar el cifrado
  const e = new TextEncoder(), salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  assert.strictEqual(rs, 4096); assert.strictEqual(idlen, 65);
  const uaPub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  const asKey = await subtle.importKey('raw', asPub, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({name: 'ECDH', public: asKey}, kp.privateKey, 256));
  const info = new Uint8Array([...e.encode('WebPush: info\0'), ...uaPub, ...asPub]);
  const ikm = await hk(auth, shared, info, 32), cek = await hk(salt, ikm, e.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hk(salt, ikm, e.encode('Content-Encoding: nonce\0'), 12);
  const pt = new Uint8Array(await subtle.decrypt({name: 'AES-GCM', iv: nonce}, await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  assert.strictEqual(pt[pt.length - 1], 2, 'delimitador del último registro');
  return new TextDecoder().decode(pt.slice(0, -1));
}
function memKV() { const m = new Map(); return {m, get: async (k, t) => { const v = m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); }}; }

test('cifra el aviso de forma que el navegador lo puede descifrar (aes128gcm)', async () => {
  const w = await W(), f = await fakeBrowserSub(w.b64u), msg = JSON.stringify({title: 'VORTEX · Alerta', body: 'BTC subió a $100,000.00 ñ ✅'});
  const body = await w.encryptPayload(f.sub, msg);
  assert.strictEqual(await decrypt(body, f.kp, f.auth), msg);
});

test('la cabecera VAPID es un JWT ES256 válido para el servicio push', async () => {
  const w = await W(), kp = await subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const v = {pub: w.b64u(await subtle.exportKey('raw', kp.publicKey)), jwk: await subtle.exportKey('jwk', kp.privateKey)};
  const h = await w.vapidHeader('https://fcm.googleapis.com/fcm/send/abc', v, 1700000000000);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h); assert.ok(m, h); assert.strictEqual(m[4], v.pub);
  const claims = JSON.parse(new TextDecoder().decode(w.unb64u(m[2])));
  assert.strictEqual(claims.aud, 'https://fcm.googleapis.com'); assert.strictEqual(claims.exp, 1700000000 + 43200); assert.match(claims.sub, /^https:\/\//);
  const ok = await subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, kp.publicKey, w.unb64u(m[3]), new TextEncoder().encode(m[1] + '.' + m[2]));
  assert.ok(ok, 'firma verificable con la clave pública');
});

test('alertas: misma lógica que la app (una vez, cada vez, cruce ascendente, vencimiento y Discord)', async () => {
  const w = await W(), now = 1e12;
  const A = [
    {id: 'a1', symbol: 'BTCUSDT', on: true, price: 100, dir: 'up'},
    {id: 'a2', symbol: 'ETHUSDT', on: true, price: 50, dir: 'down', repeat: 'every'},
    {id: 'a3', symbol: 'SOLUSDT', on: true, price: 10, dir: 'up', cond: 'up', repeat: 'every'},
    {id: 'a4', symbol: 'XRPUSDT', on: true, price: 1, dir: 'up', exp: now - 1},
    {id: 'a5', symbol: 'BNBUSDT', on: true, price: 5, dir: 'up', notify: 'discord'},
    {id: 'a6', symbol: 'ADAUSDT', on: true, price: 5, dir: 'up'}
  ].map(w.sanAlert);
  const r = w.evalAlerts(A, {BTCUSDT: 101, ETHUSDT: 49, SOLUSDT: 11, XRPUSDT: 2, BNBUSDT: 6, ADAUSDT: 4}, now);
  assert.deepStrictEqual(r.fired.map(x => x.tag), ['al-a1', 'al-a2', 'al-a3']);
  assert.match(r.fired[0].body, /^BTC subió a \$100\.00 \(ahora \$101\.00\)/);
  assert.strictEqual(A[0].on, false); assert.strictEqual(A[0].firedAt, now); assert.strictEqual(A[0].firedPrice, 101);
  assert.strictEqual(A[1].on, true); assert.strictEqual(A[1].dir, 'up'); // cruce normal «cada vez»: ahora vigila el sentido contrario
  assert.strictEqual(A[2].wait, true); // ascendente «cada vez»: espera a que el precio regrese
  assert.strictEqual(A[3].on, false); assert.strictEqual(A[3].expired, true);
  assert.strictEqual(A[4].on, false); // se cumple pero el aviso va solo a Discord
  assert.strictEqual(A[5].on, true);
  const r2 = w.evalAlerts(A, {SOLUSDT: 11}, now + 1); assert.strictEqual(r2.fired.length, 0); // sigue arriba: no repite
  w.evalAlerts(A, {SOLUSDT: 9}, now + 2); assert.ok(!A[2].wait);
  assert.strictEqual(w.evalAlerts(A, {SOLUSDT: 12}, now + 3).fired.length, 1);
  assert.strictEqual(w.evalAlerts([w.sanAlert({id: 'z', symbol: 'BTCUSDT', price: 1, dir: 'up'})], {BTCUSDT: 2}, now, false).fired.length, 0); // avisos de precio apagados
});

test('rechaza alertas de indicador y datos inválidos', async () => {
  const w = await W();
  assert.strictEqual(w.sanAlert({id: 'x', symbol: 'BTCUSDT', kind: 'ind', price: 1, dir: 'up'}), null);
  assert.strictEqual(w.sanAlert({id: 'x', symbol: 'btc', price: 1, dir: 'up'}), null);
  assert.strictEqual(w.sanAlert({id: 'x', symbol: 'BTCUSDT', price: -1, dir: 'up'}), null);
});

test('movimientos bruscos: 5 min y 1 h, con enfriamiento de 15 min', async () => {
  const w = await W(), last = {}, now = 1e12;
  const flat = Array(61).fill(100);
  assert.strictEqual(w.moveCheck('BTCUSDT', flat, 2, last, now).length, 0);
  const pump = [...Array(56).fill(100), 100, 100, 101, 102, 103]; // +3 % en 5 min
  const m = w.moveCheck('BTCUSDT', pump, 2, last, now); assert.strictEqual(m.length, 1); assert.match(m[0].body, /^BTC sube 3\.0% en 5 min/); assert.strictEqual(m[0].tag, 'mv-BTCUSDT-up');
  assert.strictEqual(w.moveCheck('BTCUSDT', pump, 2, last, now + 60000).length, 0, 'enfriamiento');
  assert.strictEqual(w.moveCheck('BTCUSDT', pump, 2, last, now + 16 * 60000).length, 1);
  const slow = Array.from({length: 61}, (_, i) => 100 - i * 0.1); // −6 % en 1 h, poco en 5 min
  const s = w.moveCheck('ETHUSDT', slow, 2, {}, now); assert.strictEqual(s.length, 1); assert.match(s[0].body, /cae 6\.0% en 1 h/);
});

test('sincronizar: la app gana salvo que el servidor haya disparado después de la última sincronización', async () => {
  const w = await W();
  const server = [{id: 'a', firedAt: 500, on: false}, {id: 'b', firedAt: 100, on: false}];
  const r = w.mergeAlerts([{id: 'a', firedAt: 0, on: true}, {id: 'b', firedAt: 0, on: true}], server, 200);
  assert.deepStrictEqual(r.alerts.map(a => a.on), [false, true]); // «a» la disparó el servidor después; «b» la reactivaste tú
  assert.deepStrictEqual(r.back.map(a => a.id), ['a']);
});

test('ronda programada: avisa una vez, guarda el estado y borra suscripciones vencidas', async () => {
  const w = await W(), KV = memKV(), env = {KV}, f = await fakeBrowserSub(w.b64u), g = await fakeBrowserSub(w.b64u);
  const ID = 'dev_aaaaaaaaaaaaaaaaaaaa', ID2 = 'dev_bbbbbbbbbbbbbbbbbbbb';
  const call = (path, body, origin = 'https://soobroon-beep.github.io') => w.default.fetch(new Request('https://x.workers.dev' + path, {method: 'POST', headers: {origin}, body: JSON.stringify(body)}), env).then(r => r.json().then(j => ({status: r.status, j})));
  assert.strictEqual((await call('/sync', {id: ID, sub: f.sub}, 'https://evil.example')).status, 403);
  assert.strictEqual((await call('/sync', {id: ID, sub: f.sub, alerts: [{id: 'a1', symbol: 'BTCUSDT', on: true, price: 100, dir: 'up'}], move: {on: false}})).status, 200);
  await call('/sync', {id: ID2, sub: {...g.sub, endpoint: 'https://fcm.googleapis.com/fcm/send/gone'}, alerts: [{id: 'b1', symbol: 'BTCUSDT', on: true, price: 100, dir: 'up'}], move: {on: false}});
  const pushes = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    url = String(url);
    if (url.includes('/api/v3/ticker/price')) return new Response(JSON.stringify([{symbol: 'BTCUSDT', price: '105'}]));
    if (url.includes('fcm.googleapis.com')) { pushes.push({url, init}); return new Response('', {status: url.endsWith('gone') ? 410 : 201}); }
    throw new Error('fetch inesperado ' + url);
  };
  try {
    const r = await w.tick(env, 1e12);
    assert.deepStrictEqual(r, {devices: 2, sent: 2, gone: 1});
    const p = pushes.find(x => x.url.endsWith('/abc'));
    assert.strictEqual(p.init.headers['content-encoding'], 'aes128gcm'); assert.match(p.init.headers.authorization, /^vapid t=/);
    const msg = JSON.parse(await decrypt(new Uint8Array(p.init.body), f.kp, f.auth));
    assert.strictEqual(msg.tag, 'al-a1'); assert.match(msg.body, /BTC subió a \$100\.00/);
    assert.strictEqual(JSON.parse(KV.m.get('dev:' + ID)).alerts[0].on, false);
    assert.ok(!KV.m.has('dev:' + ID2)); assert.deepStrictEqual(JSON.parse(KV.m.get('devs')), [ID]);
    pushes.length = 0; assert.strictEqual((await w.tick(env, 1e12 + 60000)).sent, 0); // ya no repite
    const pull = await call('/sync', {id: ID, alerts: [{id: 'a1', symbol: 'BTCUSDT', on: true, price: 100, dir: 'up'}], since: 0});
    assert.strictEqual(pull.j.back[0].on, false); assert.ok(pull.j.now > 0); // la app se entera de que ya se disparó
  } finally { globalThis.fetch = realFetch; }
});
