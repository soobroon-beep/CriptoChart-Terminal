// VORTEX · Notificaciones push con la app CERRADA (Cloudflare Worker gratuito).
// Cada minuto (cron) revisa tus alertas de precio y los movimientos bruscos del top 5 con precios de Binance
// y, si alguna se cumple, manda una notificación Web Push a tu celular aunque VORTEX no esté abierta.
// · La app le manda tus alertas y la suscripción de tu celular a /sync (solo alertas de PRECIO; las de indicador siguen en la app).
// · Las claves VAPID se crean solas la primera vez y se guardan en el KV: no hay secretos que configurar.
// · Solo escribe en el KV cuando algo cambia (el plan gratis permite 1000 escrituras al día).
// Se publica solo con .github/workflows/deploy-push-worker.yml (configuración en worker/wrangler-push.toml).

const DEFAULT_ORIGINS = 'https://soobroon-beep.github.io';
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
const MOVE_TOP = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT'];
const MOVE_WIN = [[5, '5 min', 1], [60, '1 h', 2.5]], MOVE_COOL = 15 * 60000;
const MAX_ALERTS = 50, MAX_DEVICES = 20, APP_URL = 'https://soobroon-beep.github.io/CriptoChart-Terminal/';

/* ───────── utilidades ───────── */
const enc = new TextEncoder();
export const b64u = buf => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64u = str => { const s = String(str).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - s.length % 4) % 4)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const concat = (...arrs) => { const n = arrs.reduce((a, x) => a + x.length, 0), out = new Uint8Array(n); let o = 0; for (const x of arrs) { out.set(x, o); o += x.length; } return out; };
const baseOf = s => String(s).replace(/(USDT|USDC|FDUSD|BUSD|BTC|ETH|EUR|TRY|BRL)$/, '') || s;
export function fmt(p) { // mismo estilo que la app: más decimales en precios pequeños
  if (!Number.isFinite(p)) return '—'; const a = Math.abs(p), d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 6 : 8;
  return '$' + p.toLocaleString('en-US', {minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d});
}

/* ───────── limpieza de lo que manda la app ───────── */
export function sanAlert(a) {
  if (!a || typeof a.id !== 'string' || a.id.length > 40 || a.kind === 'ind' || !/^[A-Z0-9]{3,20}$/.test(a.symbol)) return null;
  if (!(+a.price > 0) || (a.dir !== 'up' && a.dir !== 'down')) return null;
  const o = {id: a.id, symbol: a.symbol, on: a.on !== false, price: +a.price, dir: a.dir, note: String(a.note || '').slice(0, 140), firedAt: +a.firedAt || 0, firedPrice: Number.isFinite(+a.firedPrice) && a.firedPrice !== null ? +a.firedPrice : null};
  if (a.cond === 'up' || a.cond === 'down') o.cond = a.cond;
  if (a.repeat === 'every') o.repeat = 'every'; if (a.wait === true) o.wait = true;
  if (+a.exp > 0) o.exp = Math.round(+a.exp); if (a.expired === true) o.expired = true;
  if (['app', 'discord', 'both'].includes(a.notify)) o.notify = a.notify;
  return o;
}
export function sanMove(m) { const q = m && typeof m === 'object' ? m : {}; return {on: q.on !== false, pct: Math.max(0.5, Math.min(25, +q.pct || 2))}; }
function sanSub(s) {
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) return null;
  const k = s.keys || {}; if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 60) return null;
  return {endpoint: s.endpoint, keys: {p256dh: k.p256dh, auth: k.auth}};
}
/* Une lo que manda la app con lo que el servidor ya sabe. since = hora (del servidor) de la última sincronización que recibió la app.
   Si el servidor disparó una alerta DESPUÉS de eso, la app aún no lo sabe: se queda la versión del servidor y se le devuelve para que se actualice.
   Si no, manda la app (por ejemplo, la reactivaste o la editaste). */
export function mergeAlerts(incoming, server, since = 0) {
  const byId = new Map((server || []).map(a => [a.id, a])), out = [], back = [];
  for (const a of incoming) { const s = byId.get(a.id); if (s && s.firedAt > (+since || 0) && s.firedAt > a.firedAt) { out.push(s); back.push(s); } else out.push(a); }
  return {alerts: out.slice(0, MAX_ALERTS), back};
}

/* ───────── lógica de alertas (idéntica a checkAlerts/fireAlert de app.js) ───────── */
export function evalAlerts(alerts, prices, now = Date.now(), priceOn = true) {
  const fired = []; let changed = false;
  for (const a of alerts) {
    if (!a.on) continue; const price = prices[a.symbol]; if (!Number.isFinite(price)) continue;
    if (a.exp && now > a.exp) { a.on = false; a.expired = true; changed = true; continue; }
    const past = a.dir === 'up' ? price >= a.price : price <= a.price;
    if (a.wait) { if (!past) { a.wait = false; changed = true; } continue; }
    if (!past) continue;
    const dir0 = a.dir; a.firedAt = now; a.firedPrice = price; changed = true;
    if (a.repeat === 'every') { if (a.cond) a.wait = true; else a.dir = a.dir === 'up' ? 'down' : 'up'; } else a.on = false;
    if (priceOn && a.notify !== 'discord') fired.push({title: 'VORTEX · Alerta', body: `${baseOf(a.symbol)} ${dir0 === 'up' ? 'subió a' : 'bajó a'} ${fmt(a.price)} (ahora ${fmt(price)})${a.note ? ' · ' + a.note : ''}`, tag: 'al-' + a.id, url: APP_URL + '#alerts'});
  }
  return {fired, changed};
}
// closes: precios de cierre de velas de 1 minuto (la última es la actual). Devuelve los avisos y actualiza last (enfriamiento por moneda y sentido)
export function moveCheck(sym, closes, pct, last, now = Date.now()) {
  const out = [], price = closes[closes.length - 1]; if (!Number.isFinite(price)) return out;
  for (const [mins, lbl, mult] of MOVE_WIN) {
    const start = closes[closes.length - 1 - mins]; if (!Number.isFinite(start) || !(start > 0)) continue;
    const ch = (price / start - 1) * 100; if (Math.abs(ch) < pct * mult) continue;
    const dir = ch > 0 ? 'up' : 'down', k = sym + '|' + dir; if (now - (last[k] || 0) < MOVE_COOL) continue;
    last[k] = now; out.push({title: 'VORTEX · Movimiento brusco', body: `${baseOf(sym)} ${dir === 'up' ? 'sube' : 'cae'} ${Math.abs(ch).toFixed(1)}% en ${lbl} · ${fmt(price)}`, tag: 'mv-' + sym + '-' + dir, url: APP_URL + '#alerts'});
    break;
  }
  return out;
}

/* ───────── Web Push: VAPID (RFC 8292) + cifrado aes128gcm (RFC 8291) ───────── */
async function vapidKeys(env) {
  let v = await env.KV.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
    v = {pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey)};
    await env.KV.put('vapid', JSON.stringify(v));
  }
  return v;
}
export async function vapidHeader(endpoint, v, now = Date.now()) {
  const key = await crypto.subtle.importKey('jwk', v.jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const body = b64u(enc.encode(JSON.stringify({aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: APP_URL})));
  const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, enc.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info}, k, len * 8));
}
export async function encryptPayload(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: uaKey}, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, key, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
export async function sendPush(sub, msg, v) {
  const body = await encryptPayload(sub, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, {method: 'POST', headers: {'content-type': 'application/octet-stream', 'content-encoding': 'aes128gcm', ttl: '3600', urgency: 'high', topic: String(msg.tag || 'vortex').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32), authorization: await vapidHeader(sub.endpoint, v)}, body});
  return r.status;
}

/* ───────── precios ───────── */
async function getJSON(path) {
  let err; for (const h of HOSTS) { try { const r = await fetch(h + path, {headers: {'user-agent': 'VORTEX-Push/1.0'}}); if (r.ok) return await r.json(); err = new Error(h + ' HTTP ' + r.status); } catch (e) { err = e; } }
  throw err;
}
async function allPrices() { const d = await getJSON('/api/v3/ticker/price'), o = {}; for (const t of d) o[t.symbol] = +t.price; return o; }
async function closes1m(sym) { const d = await getJSON(`/api/v3/klines?symbol=${sym}&interval=1m&limit=61`); return d.map(k => +k[4]); }

/* ───────── ronda programada ───────── */
async function tick(env, now = Date.now()) {
  const ids = (await env.KV.get('devs', 'json')) || []; if (!ids.length) return {devices: 0};
  const devs = (await Promise.all(ids.map(id => env.KV.get('dev:' + id, 'json').then(d => d && d.sub ? [id, d] : null)))).filter(Boolean);
  if (!devs.length) return {devices: 0};
  const needPrices = devs.some(([, d]) => (d.alerts || []).some(a => a.on)), needMoves = devs.some(([, d]) => d.move && d.move.on);
  const prices = needPrices ? await allPrices().catch(() => ({})) : {};
  const moves = {}; if (needMoves) await Promise.all(MOVE_TOP.map(s => closes1m(s).then(c => { moves[s] = c; }).catch(() => {})));
  let v = null, sent = 0, gone = [];
  for (const [id, d] of devs) {
    const msgs = [], r = evalAlerts(d.alerts || [], prices, now, d.priceOn !== false); msgs.push(...r.fired); let changed = r.changed;
    if (d.move && d.move.on) { d.moveLast = d.moveLast || {}; for (const s of MOVE_TOP) if (moves[s]) { const m = moveCheck(s, moves[s], d.move.pct, d.moveLast, now); if (m.length) { msgs.push(...m); changed = true; } } }
    for (const m of msgs.slice(0, 8)) {
      v = v || await vapidKeys(env);
      try { const st = await sendPush(d.sub, m, v); sent++; if (st === 404 || st === 410) { gone.push(id); break; } } catch (e) { console.warn('push', e.message); }
    }
    if (changed) { d.updated = now; await env.KV.put('dev:' + id, JSON.stringify(d)); }
  }
  if (gone.length) { // suscripción vencida (se desinstaló la app o se quitó el permiso)
    for (const id of gone) await env.KV.delete('dev:' + id);
    await env.KV.put('devs', JSON.stringify(ids.filter(x => !gone.includes(x))));
  }
  return {devices: devs.length, sent, gone: gone.length};
}

/* ───────── HTTP ───────── */
export default {
  async fetch(req, env) {
    const allowed = String(env.ALLOWED_ORIGIN || DEFAULT_ORIGINS).split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('origin') || '', ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {'access-control-allow-origin': ok ? origin : 'null', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400', vary: 'origin'};
    const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {...cors, 'content-type': 'application/json'}});
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    const path = new URL(req.url).pathname;
    if (req.method === 'GET' && path === '/') return json({ok: true, app: 'VORTEX push', note: 'Notificaciones de alertas con la app cerrada'});
    if (!ok) return json({error: 'Origen no permitido'}, 403);
    if (req.method === 'GET' && path === '/vapid') return json({key: (await vapidKeys(env)).pub});
    if (req.method !== 'POST') return json({error: 'Método no permitido'}, 405);
    const raw = await req.text(); if (raw.length > 60000) return json({error: 'Demasiado grande'}, 413);
    let b; try { b = JSON.parse(raw); } catch { return json({error: 'JSON inválido'}, 400); }
    const id = String(b.id || ''); if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return json({error: 'id inválido'}, 400); // id aleatorio del dispositivo (hace de contraseña)
    const ids = (await env.KV.get('devs', 'json')) || [];
    if (path === '/sync') {
      if (b.off) { await env.KV.delete('dev:' + id); if (ids.includes(id)) await env.KV.put('devs', JSON.stringify(ids.filter(x => x !== id))); return json({ok: true, off: true}); }
      const cur = (await env.KV.get('dev:' + id, 'json')) || {};
      const sub = sanSub(b.sub) || cur.sub; if (!sub) return json({error: 'Falta la suscripción push'}, 400);
      const incoming = (Array.isArray(b.alerts) ? b.alerts : []).map(sanAlert).filter(Boolean).slice(0, MAX_ALERTS);
      const m = mergeAlerts(incoming, cur.alerts, b.since);
      const d = {sub, alerts: m.alerts, move: sanMove(b.move), priceOn: b.priceOn !== false, moveLast: cur.moveLast || {}, updated: Date.now()};
      await env.KV.put('dev:' + id, JSON.stringify(d));
      if (!ids.includes(id)) { if (ids.length >= MAX_DEVICES) return json({error: 'Demasiados dispositivos'}, 429); await env.KV.put('devs', JSON.stringify([...ids, id])); }
      return json({ok: true, back: m.back, now: Date.now()});
    }
    if (path === '/pull') { const cur = await env.KV.get('dev:' + id, 'json'); return json({ok: true, active: !!cur, alerts: cur ? cur.alerts : [], now: Date.now()}); }
    if (path === '/test') {
      const cur = await env.KV.get('dev:' + id, 'json'); if (!cur || !cur.sub) return json({error: 'Este dispositivo no está registrado'}, 404);
      const st = await sendPush(cur.sub, {title: 'VORTEX · Prueba', body: 'Las notificaciones con la app cerrada funcionan ✅', tag: 'test', url: APP_URL + '#alerts'}, await vapidKeys(env));
      return json({ok: st >= 200 && st < 300, status: st});
    }
    return json({error: 'No encontrado'}, 404);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(tick(env, event.scheduledTime || Date.now()).then(r => console.log('ronda', JSON.stringify(r)))); }
};
export {tick};
