// Cloudflare Worker (opcional): deja que TODOS los usuarios usen el modo Claude sin pedir su propia clave.
// 1) Crea un Worker, pega este archivo. 2) Ajustes → Variables: ANTHROPIC_KEY (secreta) y ALLOWED_ORIGIN (p. ej. https://soobroon-beep.github.io).
// 3) En la app: IA → ⚙ → «Servidor propio» = la URL del Worker. Solo acepta el modelo y el tamaño indicados abajo, para controlar el gasto.
const MODEL = 'claude-sonnet-5-5', MAX_TOKENS = 1400, MAX_BODY = 60000;
export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin') || '', ok = origin === env.ALLOWED_ORIGIN;
    const cors = {'access-control-allow-origin': ok ? origin : 'null', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin'};
    if (req.method === 'OPTIONS') return new Response(null, {headers: cors});
    if (req.method !== 'POST' || !ok) return new Response('Prohibido', {status: 403, headers: cors});
    const raw = await req.text(); if (raw.length > MAX_BODY) return new Response('Demasiado grande', {status: 413, headers: cors});
    let b; try { b = JSON.parse(raw); } catch { return new Response('JSON inválido', {status: 400, headers: cors}); }
    const body = {model: MODEL, max_tokens: Math.min(+b.max_tokens || MAX_TOKENS, MAX_TOKENS), system: String(b.system || '').slice(0, 4000), messages: Array.isArray(b.messages) ? b.messages.slice(-10) : []};
    const r = await fetch('https://api.anthropic.com/v1/messages', {method: 'POST', headers: {'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01'}, body: JSON.stringify(body)});
    return new Response(r.body, {status: r.status, headers: {...cors, 'content-type': 'application/json'}});
  }
};
