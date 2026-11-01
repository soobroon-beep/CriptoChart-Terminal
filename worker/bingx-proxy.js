// Cloudflare Worker para Nexus Lens (BingX). Gratis y sin hibernación.
// ¿Para qué? BingX no deja que una página web (navegador / app instalada) le hable directo (bloquea CORS). La APK de Nexus Lens no lo necesita porque usa conexión nativa.
// Este Worker solo reenvía las consultas de LECTURA a open-api.bingx.com. Tu Secret Key NUNCA llega aquí: la firma se calcula en tu dispositivo.
// Pasos (3 minutos): dash.cloudflare.com → Workers y Pages → Crear → Crear Worker → Implementar → Editar código → pega este archivo → Implementar.
// Copia la URL que termina en .workers.dev y pégala una sola vez en Nexus Lens («Proxy URL»).
// Opcional: Ajustes → Variables → ALLOWED_ORIGIN = tu sitio (por defecto https://soobroon-beep.github.io; varios separados por coma).
const HOST = 'https://open-api.bingx.com', DEFAULT_ORIGIN = 'https://soobroon-beep.github.io';
export default {
  async fetch(req, env) {
    const allowed = String(env.ALLOWED_ORIGIN || DEFAULT_ORIGIN).split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('origin') || '', ok = allowed.includes(origin);
    const cors = {'access-control-allow-origin': ok ? origin : 'null', 'access-control-allow-headers': 'x-bx-apikey, content-type', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400', vary: 'origin'};
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (!ok) return new Response('Origen no permitido', {status: 403, headers: cors});
    if (req.method !== 'GET') return new Response('Solo lectura (GET)', {status: 405, headers: cors});
    const u = new URL(req.url);
    if (!u.pathname.startsWith('/openApi/')) return new Response('No encontrado', {status: 404, headers: cors});
    const r = await fetch(HOST + u.pathname + u.search, {headers: {'X-BX-APIKEY': req.headers.get('x-bx-apikey') || ''}});
    return new Response(r.body, {status: r.status, headers: {...cors, 'content-type': r.headers.get('content-type') || 'application/json'}});
  }
};
