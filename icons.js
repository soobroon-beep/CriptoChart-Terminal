/* Iconos de la interfaz (SVG de trazo, heredan el color del texto). Sustituyen a los emojis en toda la app.
   CCTI.svg('bell', 16) → texto HTML con el icono · CCTI.sub(html) → cambia emojis sueltos por su icono · CCTI.strip(texto) → quita emojis de un texto plano. */
(function (root) {
  'use strict';
  const P = {
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 0 4.9 4.9l-9.3 9.3a2.1 2.1 0 0 1-3-3z"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.7-5.4 7-5.4s6.2 1.8 7 5.4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.8C3.6 8.7 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    clipboard: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3.5h6V5M9 11h6M9 15h6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.6 0 2.2-1.1 1.6-2.3-.6-1.1-.2-2.2 1-2.2H17a4 4 0 0 0 4-4C21 6.9 17 3 12 3z"/><circle cx="7.8" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="7.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.4" cy="8.4" r="1.1" fill="currentColor" stroke="none"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
    pin: '<path d="M12 21s6-5.6 6-10.5a6 6 0 0 0-12 0C6 15.400 12 21 12 21z"/><circle cx="12" cy="10.500" r="2.200"/>',
    layers: '<path d="m12 3.500 9 4.500-9 4.500L3 8z"/><path d="m3 12.500 9 4.500 9-4.500M3 16.500l9 4.500 9-4.500"/>',
    phone: '<rect x="7" y="2.500" width="10" height="19" rx="2.200"/><path d="M11 18.500h2"/>',
    cloud: '<path d="M7 18a4.500 4.500 0 0 1-.4-9A6 6 0 0 1 18 9.500a4.200 4.200 0 0 1-.5 8.500z"/>',
    trail: '<path d="M3 15c3-8 5 4 9-3s6-5 9-6"/><path d="M3 20c3-5 5 2 9-2s6-3 9-4" opacity=".55"/>',
    puzzle: '<path d="M10 4h4v3a2 2 0 1 1 0 4h-4v3H7a2 2 0 1 1 0-4H4V7h3a2 2 0 1 1 3-3z" transform="translate(2 3) scale(.85)"/>',
    bank: '<path d="M3 9.500 12 4l9 5.500M5 10v8M9.500 10v8M14.500 10v8M19 10v8M3 20h18"/>',
    calendar: '<rect x="4" y="5.500" width="16" height="14.500" rx="2"/><path d="M4 10h16M8.500 3.500v4M15.500 3.500v4"/>',
    download: '<path d="M12 4v11M7.500 11l4.500 4.500 4.500-4.500M5 20h14"/>',
    upload: '<path d="M12 16V5M7.500 9 12 4.500 16.500 9M5 20h14"/>',
    power: '<path d="M12 3.500v8"/><path d="M7 6.500a7.500 7.500 0 1 0 10 0"/>',
    pencil: '<path d="M4 20l1-4L16.500 4.500a2.100 2.100 0 0 1 3 3L8 19z"/><path d="m14.500 6.500 3 3"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    fit: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><path d="m9 15-5 5M15 9l5-5" opacity=".0"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    search: '<circle cx="11" cy="11" r="6.500"/><path d="m16 16 4.500 4.500"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.500" cy="6" r="1.100"/><circle cx="4.500" cy="12" r="1.100"/><circle cx="4.500" cy="18" r="1.100"/>',
    bars: '<path d="M6 20V10M12 20V4M18 20v-7"/>',
    news: '<path d="M5 5h11a1 1 0 0 1 1 1v13H6a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M8 9h6M8 13h6"/>',
    sparkle: '<path d="M11 3l1.900 5.300L18 10l-5.100 1.700L11 17l-1.900-5.300L4 10l5.100-1.700z"/><path d="M19 16l.8 2.200L22 19l-2.200.8L19 22l-.8-2.200L16 19l2.200-.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.500 4.500 4.500L19 7"/>',
    send: '<path d="M4 12 20 4l-4 16-4.500-6.500z"/><path d="M11.500 13.500 20 4"/>',
    cursor: '<path d="M12 3v18M3 12h18"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.500-5.800"/><path d="M4 4v4.500h4.500"/>',
    updown: '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13v1M15 13v1"/><circle cx="12" cy="3.500" r="1"/>',
    key: '<circle cx="8" cy="15" r="3.500"/><path d="M10.500 12.500 20 3M16 7l3 3M14 9l2 2"/>',
    shield: '<path d="M12 3 5 6v5.500C5 16 8 19.500 12 21c4-1.500 7-5 7-9.500V6z"/>',
    rocket: '<path d="M14 4c3 0 6 1 6 1s1 3 1 6-3 5-5 6l-3-3-3-3c1-2 2-6 4-7z"/><path d="M8 13l-3 1-1 4 4-1 1-3M15.500 8.500h.1"/>',
    flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
    dotg: '<circle cx="12" cy="12" r="6" fill="#20bf9f" stroke="none"/>',
    dotr: '<circle cx="12" cy="12" r="6" fill="#f06b79" stroke="none"/>',
    dotw: '<circle cx="12" cy="12" r="5.500" opacity=".6"/>',
    moon: '<path d="M20 14.500A8 8 0 0 1 9.500 4 8 8 0 1 0 20 14.500z"/>',
    theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    wave: '<path d="M4 13c2-4 3 3 5-1s3 3 5-1 3 2 6-2"/>',
    hourglass: '<path d="M7 3.500h10M7 20.500h10M8 3.500c0 5 8 5 8 8.500s-8 3.500-8 8.500M16 3.500c0 5-8 5-8 8.500"/>',
    up: '<path d="M5 15l5-5 3 3 6-7"/><path d="M15 6h4v4"/>',
    down: '<path d="M5 9l5 5 3-3 6 7"/><path d="M15 18h4v-4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-4M4 13a8 8 0 0 0 14 4"/><path d="M6 3v4h4M18 21v-4h-4"/>',
    // tipos de vela
    toTop: '<path d="M5 4h14M12 20V8M7 13l5-5 5 5"/>',
    toBottom: '<path d="M5 20h14M12 4v12M7 11l5 5 5-5"/>',
    dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
    c_candles:'<path d="M7 4v16M17 6v13"/><rect x="5" y="8" width="4" height="7" rx=".6" fill="currentColor"/><rect x="15" y="9" width="4" height="6" rx=".6"/>',
    c_hollow: '<path d="M7 4v16M17 6v13"/><rect x="5" y="8" width="4" height="7" rx=".6"/><rect x="15" y="9" width="4" height="6" rx=".6"/>',
    c_ha: '<path d="M7 4v16M17 6v13"/><rect x="5" y="8" width="4" height="9" rx=".6" fill="currentColor" opacity=".55"/><rect x="15" y="7" width="4" height="8" rx=".6"/>',
    c_bars: '<path d="M7 4v16M4 8h3M7 16h3M17 5v14M14 9h3M17 14h3"/>',
    c_hlc: '<path d="M7 4v16M7 15h3M17 5v14M17 10h3"/>',
    c_line: '<path d="M3 17l5-6 4 3 5-8 4 4"/>',
    c_area: '<path d="M3 18l5-6 4 3 5-8 4 4v7z" fill="currentColor" fill-opacity=".25"/><path d="M3 18l5-6 4 3 5-8 4 4"/>',
    c_step: '<path d="M3 16h5v-6h5v5h5V7h3"/>'
  };
  // emoji → nombre de icono (para convertir texto que aún traiga emojis)
  const EMO = {'🔔': 'bell', '⚙': 'gear', '⚠': 'warn', '📊': 'chart', '🔧': 'wrench', '👤': 'user', '🗑': 'trash', '👁': 'eye', '🙈': 'eyeoff', '🔒': 'lock', '🔓': 'unlock', '📋': 'clipboard',
    '🎨': 'palette', '🖼': 'image', '⚡': 'bolt', '⭐': 'star', '📍': 'pin', '🧱': 'layers', '📱': 'phone', '☁': 'cloud', '🧵': 'trail', '🧩': 'puzzle', '🏛': 'bank', '📅': 'calendar',
    '⬇': 'download', '⏻': 'power', '🕯': 'c_candles', '✅': 'check', '🟢': 'dotg', '🔴': 'dotr', '⚪': 'dotw', '🧠': 'brain', '🤖': 'bot', '🔑': 'key', '🛡': 'shield', '🚀': 'rocket', '🔄': 'refresh',
    '📈': 'up', '📉': 'down', '🌙': 'moon', '⏳': 'hourglass', '⌛': 'hourglass', '🔍': 'search', '🚨': 'bell', '💥': 'bolt', '👋': '', '🦄': ''};
  const RE = new RegExp('(' + Object.keys(EMO).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'g');
  const svg = (n, s = 16) => `<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
  // cualquier otro emoji que no tenga icono propio se quita (también los que escriba la IA o un script de Pine)
  const OTHER = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FA}\u{FE0F}\u{200D}]/gu;
  const KEEP = new Set(['✓', '✕', '✗', '★', '⬤', '✛', '⎯', '⌐', '⬡', '✦', '◎', '◆', '▲', '▼', '●', '⬆', '✔']);
  const clean = t => t.replace(OTHER, c => KEEP.has(c) ? c : '');
  const sub = html => clean(String(html).replace(RE, (m, ch) => EMO[ch] ? svg(EMO[ch]) : ''));
  const strip = t => clean(String(t).replace(RE, '')).replace(/[ \t]{2,}/g, ' ').replace(/^\s+/, '');
  root.CCTI = {P, EMO, svg, sub, strip};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CCTI;
})(typeof window !== 'undefined' ? window : globalThis);
