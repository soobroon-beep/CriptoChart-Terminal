/* Noticias de mercado (cripto + bolsa) en español y calendario económico.
   - Lee feeds RSS públicos en español directamente desde el navegador (sin servidor propio). Como la mayoría no permite CORS, cada fuente se
     pide por una cadena de rutas: directa → proxys públicos → rss2json; se recuerda la que funcionó.
   - Solo se muestran noticias en español y que tocan cripto, bolsa o macroeconomía; la más reciente siempre arriba.
   - Se actualiza al abrir la sección, cada 2 minutos mientras está visible y al volver a la pestaña.
   La parte de lógica (parseo, idioma, clasificación, mezcla) no toca el DOM y se prueba con tests/news.test.js. */
(function (root) {
  'use strict';

  /* ───────── Fuentes (todas en español) ───────── */
  // cat: categoría por defecto de la fuente. null = fuente general: solo entran las notas que coinciden con palabras clave de mercado.
  const SOURCES = [
    {id: 'criptonoticias', name: 'CriptoNoticias', url: 'https://www.criptonoticias.com/feed/', cat: 'cripto'},
    {id: 'cointelegraph', name: 'Cointelegraph', url: 'https://es.cointelegraph.com/rss', cat: 'cripto'},
    {id: 'beincrypto', name: 'BeInCrypto', url: 'https://es.beincrypto.com/feed/', cat: 'cripto'},
    {id: 'investing', name: 'Investing.com', url: 'https://es.investing.com/rss/news_25.rss', cat: 'bolsa'},
    {id: 'bloomberglinea', name: 'Bloomberg Línea', url: 'https://www.bloomberglinea.com/arc/outboundfeeds/rss/?outputType=xml', cat: null},
    {id: 'expansion', name: 'Expansión', url: 'https://expansion.mx/rss', cat: null},
    {id: 'infobae', name: 'Infobae', url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/economia/', cat: null}
  ];
  const MAX_AGE_MS = 72 * 3600e3, MAX_ITEMS = 160, REFRESH_MS = 120e3, FETCH_TIMEOUT = 9000;

  /* ───────── Parseo de RSS/Atom (por expresiones regulares: tolera feeds cortados o mal formados) ───────── */
  const ENT = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', iexcl: '¡', iquest: '¿', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', euro: '€'};
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return Number.isFinite(n) ? String.fromCodePoint(n) : m; } catch { return m; } }
      return Object.prototype.hasOwnProperty.call(ENT, e) ? ENT[e] : m;
    });
  }
  const cdata = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  function clean(s) { // texto plano: sin CDATA, sin etiquetas, con entidades resueltas y espacios normalizados
    s = cdata(String(s || '')); s = decodeEntities(s); s = s.replace(/<[^>]*>/g, ' '); s = decodeEntities(s);
    return s.replace(/\s+/g, ' ').trim();
  }
  function tagText(block, name) {
    const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i').exec(block); return m ? m[1] : '';
  }
  function parseDate(s, assumeUtc) {
    s = clean(s); if (!s) return NaN;
    if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/.test(s) && assumeUtc) s = s.replace(' ', 'T') + 'Z';
    return Date.parse(s);
  }
  function parseFeed(text) {
    const out = []; if (typeof text !== 'string' || !text) return out;
    const re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi; let m;
    while ((m = re.exec(text))) {
      const b = m[2], title = clean(tagText(b, 'title'));
      let link = clean(tagText(b, 'link')); if (!link) { const h = /<link[^>]*\shref=["']([^"']+)["']/i.exec(b); link = h ? decodeEntities(h[1]) : ''; }
      if (!link) link = clean(tagText(b, 'guid'));
      const t = parseDate(tagText(b, 'pubDate') || tagText(b, 'published') || tagText(b, 'updated') || tagText(b, 'dc:date'));
      const desc = clean(tagText(b, 'description') || tagText(b, 'summary') || tagText(b, 'content:encoded')).slice(0, 320);
      if (title && Number.isFinite(t)) out.push({title, link: /^https?:\/\//i.test(link) ? link : '', t, desc});
    }
    return out;
  }
  function parseRss2json(j) { // respuesta de api.rss2json.com (las fechas vienen en UTC sin zona)
    if (!j || j.status !== 'ok' || !Array.isArray(j.items)) return [];
    return j.items.map(it => ({title: clean(it.title), link: /^https?:\/\//i.test(it.link || '') ? it.link : '', t: parseDate(it.pubDate, true), desc: clean(it.description || it.content).slice(0, 320)})).filter(x => x.title && Number.isFinite(x.t));
  }

  /* ───────── Idioma: solo español ───────── */
  const ES_W = new Set('de la el en y que los las un una por con para se del al es su sus lo como más pero sobre entre este esta esto ese esa fue han ha hay son ser sin ya tras hasta desde cuando donde también muy año años nuevo nueva primer mercado'.split(' '));
  const EN_W = new Set('the and of to in for is on with that this from are was were has have as by at an it its be will after new says said over into more than not but how why what who'.split(' '));
  function looksSpanish(text) {
    const w = String(text || '').toLowerCase().replace(/[^a-záéíóúñü\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (w.length < 4) return true; // demasiado corto para decidir: se deja pasar
    let es = 0, en = 0; for (const x of w) { if (ES_W.has(x)) es++; if (EN_W.has(x)) en++; }
    if (/[áéíóúñ¿¡]/i.test(text)) es += 2;
    return !(en >= 2 && en > es);
  }

  /* ───────── Clasificación: categoría e impacto ───────── */
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const CAT_RE = {
    cripto: /\b(bitcoin\w*|btc|ethereum|ether|eth|cripto\w*|blockchain|stablecoin\w*|binance|coinbase|solana|xrp|ripple|tether|usdt|usdc|dogecoin|altcoin\w*|halving|defi|nft|tokens?|tokenizaci\w*|satoshi|mineros?|minera de bitcoin|etf (de )?(bitcoin|ethereum|spot)|exchanges? de cripto\w*|monedas? digitales?|cbdc|memecoin\w*)\b/,
    bolsa: /\b(bolsas?|bursatil\w*|acciones?|wall street|nasdaq|s&p ?500|s&p|dow jones|ipc de la bmv|bmv|ibex|dax|nikkei|indices?|mercados? (de valores|financier\w*|bursatil\w*|accionario\w*)|cotiza\w*|rally|bonos?|renta (fija|variable)|resultados trimestrales|ganancias trimestrales|ipo|dividendos?|petroleo|crudo|brent|wti|oro|plata|dolar|peso mexicano|tipo de cambio|euro|divisas?|forex|inversionistas?|fondos? de inversion|etfs?)\b/,
    macro: /\b(fed|reserva federal|banxico|bce|banco central|tasas? de interes|inflacion|ipc|pib|empleo|nominas?|desempleo|aranceles?|recesion|deficit|deuda|powell|lagarde|trump|opep|sanciones?|fmi|banco mundial|politica monetaria|recorte de tasas|economia|economico\w*|gasto publico|presupuesto|reforma fiscal|impuestos?)\b/
  };
  const HIGH_RE = /\b(fed|reserva federal|tasas? de interes|inflacion|aranceles?|sec|etf\w*|hackeo\w*|hackean\w*|hackeado|robo|estafa|quiebra|bancarrota|recorte\w*|colapso|desplom\w*|se dispara\w*|dispara\w*|record|maximo historico|minimo historico|prohib\w*|regulaci\w*|demanda|guerra|crisis|liquidaci\w*|halving|powell|lagarde|banxico|aprob\w*|nominas?|desempleo|pib|recesion|sanciones?|cae|se hunde|se desploma|sube|se dispara|salta|colapsa)\b/;
  const CAT_ORDER = ['cripto', 'bolsa', 'macro'];
  function classify(title, desc, source) {
    const t = norm(title), full = t + ' ' + norm(desc), cats = [];
    for (const c of CAT_ORDER) if (CAT_RE[c].test(full)) cats.push(c);
    const base = source && source.cat;
    if (base && !cats.includes(base)) cats.unshift(base);
    if (!cats.length) return null; // no toca el mercado: se descarta
    // impacto: el título pesa más que el resumen
    const hiT = HIGH_RE.test(t), hiD = HIGH_RE.test(norm(desc));
    const impact = hiT ? 'alto' : (hiD && cats.length) ? 'medio' : 'medio';
    const cat = cats.sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b))[0];
    return {cat, cats, impact: hiT ? 'alto' : impact, score: (hiT ? 2 : 0) + (hiD ? 1 : 0) + cats.length * .1};
  }

  /* ───────── Mezcla: dedupe, ventana de tiempo, orden por fecha ───────── */
  const keyOf = it => norm(it.title).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);
  function buildItems(raw, source, now) {
    const out = [];
    for (const it of raw) {
      if (it.t > now + 10 * 60e3 || now - it.t > MAX_AGE_MS) continue; // futuras (reloj mal puesto) o demasiado viejas
      if (!looksSpanish(it.title + ' ' + it.desc)) continue;
      const c = classify(it.title, it.desc, source); if (!c) continue;
      out.push({id: keyOf(it), title: it.title, link: it.link, t: Math.min(it.t, now), desc: it.desc, src: source.name, ...c});
    }
    return out;
  }
  function mergeItems(lists, now) {
    const seen = new Map();
    for (const l of lists) for (const it of l) {
      const prev = seen.get(it.id); if (!prev || it.t > prev.t || (it.t === prev.t && it.desc.length > prev.desc.length)) seen.set(it.id, it);
    }
    return [...seen.values()].filter(it => now - it.t <= MAX_AGE_MS).sort((a, b) => b.t - a.t).slice(0, MAX_ITEMS); // más nuevas primero
  }
  function relTime(t, now) {
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 45) return 'hace un momento'; const m = Math.round(s / 60); if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24); if (d === 1) return 'ayer'; if (d < 7) return `hace ${d} días`;
    return new Date(t).toLocaleDateString('es', {day: 'numeric', month: 'short'});
  }

  const api = {SOURCES, parseFeed, parseRss2json, looksSpanish, classify, buildItems, mergeItems, relTime, clean, decodeEntities};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTNewsCore = api;
  if (typeof document === 'undefined') return;

  /* ───────── Red: cadena de rutas por fuente ───────── */
  const bust = u => u + (u.includes('?') ? '&' : '?') + '_=' + Math.floor(Date.now() / 6e4); // cambia cada minuto: evita copias viejas en proxys
  const ROUTES = {
    direct: u => ({url: bust(u), json: false}),
    allorigins: u => ({url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(bust(u)), json: false}),
    codetabs: u => ({url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(bust(u)), json: false}),
    corsproxy: u => ({url: 'https://corsproxy.io/?url=' + encodeURIComponent(bust(u)), json: false}),
    rss2json: u => ({url: 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u), json: true}),
    alloriginsjson: u => ({url: 'https://api.allorigins.win/get?url=' + encodeURIComponent(bust(u)), json: false, wrap: 'contents'}),
    thingproxy: u => ({url: 'https://thingproxy.freeboard.io/fetch/' + bust(u), json: false}),
    codetabs2: u => ({url: 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u), json: false})
  };
  const ROUTE_ORDER = ['rss2json', 'direct', 'codetabs', 'allorigins', 'alloriginsjson', 'corsproxy', 'thingproxy', 'codetabs2'];
  const ls = {get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }};
  let goodRoute = {}; try { goodRoute = JSON.parse(ls.get('cct_news_route') || '{}') || {}; } catch {}
  async function fetchWithTimeout(url, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = setTimeout(() => ctl && ctl.abort(), ms);
    try { const r = await fetch(url, {signal: ctl ? ctl.signal : undefined, cache: 'no-store'}); if (!r.ok) throw new Error('HTTP ' + r.status); return r; } finally { clearTimeout(to); }
  }
  // Las rutas se lanzan escalonadas (la que funcionó antes va primero) y gana la primera que devuelva ítems: así un proxy caído o lento no frena a los demás.
  function loadSource(src) {
    const order = goodRoute[src.id] ? [goodRoute[src.id], ...ROUTE_ORDER.filter(r => r !== goodRoute[src.id])] : ROUTE_ORDER;
    return new Promise(resolve => {
      let pending = order.length, won = false; const timers = [];
      const fail = () => { if (--pending === 0 && !won) resolve(null); };
      order.forEach((name, i) => timers.push(setTimeout(async () => {
        if (won) return fail();
        try {
          const rt = ROUTES[name](src.url), r = await fetchWithTimeout(rt.url, FETCH_TIMEOUT); let items;
          if (rt.json) items = parseRss2json(await r.json());
          else if (rt.wrap) { const j = await r.json(); items = parseFeed(j && j[rt.wrap]); }
          else items = parseFeed(await r.text());
          if (!items.length) throw new Error('sin ítems');
          if (!won) { won = true; timers.forEach(clearTimeout); if (goodRoute[src.id] !== name) { goodRoute[src.id] = name; ls.set('cct_news_route', JSON.stringify(goodRoute)); } resolve(items); }
        } catch { fail(); }
      }, i * 1200)));
      // los temporizadores cancelados nunca llaman a fail(); por eso al ganar ya se resuelve y no se espera al resto
    });
  }

  /* ───────── Interfaz ───────── */
  const $ = (s, el) => (el || document).querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const CAT_LABEL = {cripto: 'Cripto', bolsa: 'Bolsa', macro: 'Macro'}, SHOW_STEP = 40;
  const st = {items: [], per: {}, filter: ls.get('cct_news_filter') || 'todas', hi: ls.get('cct_news_hi') === '1', tab: ls.get('cct_news_tab') === 'cal' ? 'cal' : 'news', shown: SHOW_STEP, loading: false, updated: 0, lastSeen: Number(ls.get('cct_news_seen')) || 0, ok: 0, timer: 0, calMade: '', fails: 0};
  let rootEl = null;

  function loadCache() {
    try { const c = JSON.parse(ls.get('cct_news_v1') || 'null'); if (c && Array.isArray(c.items)) { st.items = c.items.filter(i => i && i.title && Number.isFinite(i.t)); st.updated = c.at || 0; } } catch {}
  }
  const saveCache = () => ls.set('cct_news_v1', JSON.stringify({at: st.updated, items: st.items.slice(0, 120).map(({id, title, link, t, desc, src, cat, cats, impact}) => ({id, title, link, t, desc: (desc || '').slice(0, 200), src, cat, cats, impact}))}));

  function shell() {
    rootEl.innerHTML = `
      <div class="nw-tabs" role="tablist"><button role="tab" data-nw-tab="news">Noticias</button><button role="tab" data-nw-tab="cal">📅 Calendario económico</button></div>
      <div id="nwNews">
        <div class="nw-bar"><div class="nw-chips" id="nwChips"></div></div>
        <div class="nw-tools"><label class="nw-hi"><input type="checkbox" id="nwHi"> Solo alto impacto</label><span class="nw-sp"></span><button class="nw-ref" id="nwRefresh" aria-label="Actualizar noticias" title="Actualizar ahora">↻ Actualizar</button></div>
        <div class="nw-status" id="nwStatus"></div>
        <div class="nw-list" id="nwList"></div>
      </div>
      <div id="nwCal" hidden>
        <p class="nw-calnote">Eventos económicos de todo el mundo: pasados (con el dato publicado), de hoy y próximos. Cambia el rango y filtra por país o importancia dentro del calendario.</p>
        <div class="nw-calbox" id="nwCalBox"></div>
        <div class="nw-calfoot"><a href="https://es.tradingview.com/economic-calendar/" target="_blank" rel="noopener noreferrer">Abrir calendario completo ↗</a><a href="https://es.investing.com/economic-calendar/" target="_blank" rel="noopener noreferrer">Calendario de Investing.com ↗</a></div>
      </div>`;
  }
  function renderChips() {
    const n = {todas: st.items.length, cripto: 0, bolsa: 0, macro: 0}; for (const i of st.items) for (const c of i.cats || [i.cat]) if (n[c] !== undefined) n[c]++;
    $('#nwChips').innerHTML = [['todas', 'Todas'], ['cripto', 'Cripto'], ['bolsa', 'Bolsa'], ['macro', 'Macro']].map(([k, l]) => `<button data-nw-f="${k}" class="${st.filter === k ? 'on' : ''}">${l}<i>${n[k]}</i></button>`).join('');
    $('#nwHi').checked = st.hi;
  }
  function renderStatus(now) {
    const el = $('#nwStatus'); if (!el) return; let msg;
    if (st.loading && !st.items.length) msg = 'Cargando noticias…';
    else if (!st.items.length && !st.loading) msg = st.updated || st.fails ? 'No se pudieron cargar noticias ahora. Revisa tu conexión y toca «Actualizar».' : 'Sin noticias por ahora.';
    else msg = (st.loading ? 'Actualizando… · ' : '') + (st.updated ? 'Actualizado ' + relTime(st.updated, now).replace('hace un momento', 'hace un momento') + (st.ok ? ` · ${st.ok} fuentes` : ' (guardado)') : '') + ' · se actualiza sola cada 2 min';
    el.textContent = msg; el.classList.toggle('warn', !st.items.length && !st.loading);
  }
  function renderList() {
    const now = Date.now(), list = st.items.filter(i => (st.filter === 'todas' || (i.cats || [i.cat]).includes(st.filter)) && (!st.hi || i.impact === 'alto'));
    const box = $('#nwList'); if (!box) return;
    if (!list.length) { box.innerHTML = st.items.length ? '<div class="nw-empty">No hay noticias con este filtro.</div>' : ''; renderStatus(now); return; }
    box.innerHTML = list.slice(0, st.shown).map(i => {
      const isNew = st.lastSeen && i.t > st.lastSeen;
      return `<article class="nw-item ${i.impact === 'alto' ? 'hi' : ''}"><div class="nw-meta"><span class="nw-chip c-${i.cat}">${CAT_LABEL[i.cat] || i.cat}</span>${i.impact === 'alto' ? '<span class="nw-imp" title="Alto impacto en el mercado">● Alto impacto</span>' : ''}${isNew ? '<span class="nw-new">NUEVA</span>' : ''}<span class="nw-time" data-t="${i.t}">${relTime(i.t, now)}</span></div>
        <h3>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>` : esc(i.title)}</h3>
        ${i.desc ? `<p>${esc(i.desc)}</p>` : ''}<div class="nw-src">${esc(i.src)}</div></article>`;
    }).join('') + (list.length > st.shown ? `<button class="nw-more" id="nwMore">Ver más (${list.length - st.shown})</button>` : '');
    renderStatus(now);
  }
  function renderAll() { if (!rootEl) return; renderChips(); renderList(); }
  function tickTimes() { const now = Date.now(); document.querySelectorAll('#nwList .nw-time').forEach(el => { el.textContent = relTime(+el.dataset.t, now); }); renderStatus(now); }

  async function refresh(force) {
    if (st.loading) return; const now0 = Date.now();
    if (!force && st.updated && now0 - st.updated < 45e3) return; // recién actualizado
    st.loading = true; st.ok = 0; renderStatus(now0);
    const lists = {}; let done = 0;
    // 1) Archivo generado por el servidor (mismo origen, sin CORS) → casi siempre funciona.
    const stat = (async () => { try { const r = await fetchWithTimeout('news-data.json?_=' + Math.floor(Date.now() / 6e4), FETCH_TIMEOUT), j = await r.json(), n = Date.now();
      const its = (j.items || []).filter(i => i && i.title && Number.isFinite(i.t) && n - i.t <= MAX_AGE_MS && looksSpanish(i.title)); if (its.length) { lists.static = its; st.ok++; st.staticAt = j.at || 0; st.per = Object.assign({}, st.per, lists); st.items = mergeItems(Object.values(lists), Date.now()); renderAll(); } } catch {} })();
    await Promise.all([stat, ...SOURCES.map(async src => {
      const raw = await loadSource(src); done++;
      if (raw) { st.ok++; lists[src.id] = buildItems(raw, src, Date.now()); } else if (st.per[src.id]) lists[src.id] = st.per[src.id]; // si una fuente falla se conserva lo último que dio
      const all = Object.values(lists); if (all.length) { st.per = Object.assign({}, st.per, lists); st.items = mergeItems(all, Date.now()); renderAll(); } // se pinta a medida que llega cada fuente
    })]);
    st.loading = false; st.per = Object.assign({}, st.per, lists); if (Object.keys(lists).length) st.items = mergeItems(Object.values(lists), Date.now());
    if (st.ok) { st.updated = Date.now(); st.fails = 0; saveCache(); } else st.fails++;
    renderAll();
  }
  const viewVisible = () => { const v = document.getElementById('newsView'); return !!v && v.offsetParent !== null; };
  function schedule() { clearInterval(st.timer); st.timer = setInterval(() => { if (document.visibilityState === 'visible' && viewVisible() && st.tab === 'news') refresh(true); else tickTimes(); }, REFRESH_MS); }

  /* ───────── Calendario económico (widget gratuito en español) ───────── */
  const isLight = () => document.body.classList.contains('light');
  function buildCalendar() {
    const box = $('#nwCalBox'); if (!box) return; const key = isLight() ? 'light' : 'dark'; if (st.calMade === key && box.querySelector('iframe')) return;
    st.calMade = key; box.innerHTML = '<div class="nw-calload" id="nwCalLoad">Cargando calendario…</div>';
    const wrap = document.createElement('div'); wrap.className = 'tradingview-widget-container'; wrap.style.cssText = 'width:100%;height:600px';
    const inner = document.createElement('div'); inner.className = 'tradingview-widget-container__widget'; inner.style.cssText = 'width:100%;height:600px'; wrap.appendChild(inner);
    const sc = document.createElement('script'); sc.type = 'text/javascript'; sc.async = true; sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
    sc.text = JSON.stringify({colorTheme: key, isTransparent: false, width: '100%', height: '600', locale: 'es', importanceFilter: '-1,0,1', countryFilter: 'ar,au,br,ca,cn,fr,de,in,id,it,jp,kr,mx,ru,sa,za,tr,gb,us,eu'});
    sc.onerror = () => calFallback();
    wrap.appendChild(sc); box.appendChild(wrap);
    const mo = new MutationObserver(() => { if (box.querySelector('iframe')) { const l = $('#nwCalLoad'); if (l) l.remove(); mo.disconnect(); } }); mo.observe(box, {childList: true, subtree: true});
    clearTimeout(st.calTo); st.calTo = setTimeout(() => { if (!box.querySelector('iframe')) calFallback(); }, 10000);
  }
  function calFallback() {
    const box = $('#nwCalBox'); if (!box || box.querySelector('iframe')) return; st.calMade = '';
    box.innerHTML = '<div class="nw-calload warn">No se pudo cargar el calendario aquí (¿sin conexión o bloqueado por un bloqueador de anuncios?).<br>Ábrelo con los enlaces de abajo: están en español e incluyen eventos pasados, de hoy y próximos.</div>';
  }

  function setTab(t) {
    st.tab = t === 'cal' ? 'cal' : 'news'; ls.set('cct_news_tab', st.tab);
    rootEl.querySelectorAll('[data-nw-tab]').forEach(b => { const on = b.dataset.nwTab === st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('#nwNews').hidden = st.tab !== 'news'; $('#nwCal').hidden = st.tab !== 'cal';
    if (st.tab === 'cal') buildCalendar(); else refresh(false);
  }

  function init() {
    rootEl = document.getElementById('newsRoot'); if (!rootEl) return;
    loadCache(); shell(); renderAll();
    rootEl.addEventListener('click', e => {
      const t = e.target.closest('[data-nw-tab]'); if (t) { setTab(t.dataset.nwTab); return; }
      const f = e.target.closest('[data-nw-f]'); if (f) { st.filter = f.dataset.nwF; st.shown = SHOW_STEP; ls.set('cct_news_filter', st.filter); renderAll(); return; }
      if (e.target.closest('#nwRefresh')) { refresh(true); return; }
      if (e.target.closest('#nwMore')) { st.shown += SHOW_STEP; renderList(); }
    });
    rootEl.addEventListener('change', e => { if (e.target.id === 'nwHi') { st.hi = e.target.checked; ls.set('cct_news_hi', st.hi ? '1' : '0'); st.shown = SHOW_STEP; renderList(); } });
    // al abrir la sección (pestaña lateral en PC, botón inferior en móvil) se actualiza si hace falta
    document.addEventListener('click', e => { if (e.target.closest('[data-side="newsView"],[data-view="newsView"]')) setTimeout(() => { if (st.tab === 'news') refresh(false); else buildCalendar(); }, 60); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && viewVisible()) { if (st.tab === 'news') refresh(false); } });
    new MutationObserver(() => { if (st.tab === 'cal') buildCalendar(); }).observe(document.body, {attributes: true, attributeFilter: ['class']}); // cambia el tema → se vuelve a pintar el calendario
    window.addEventListener('pagehide', () => { const mx = st.items.reduce((m, i) => Math.max(m, i.t), 0); if (mx) ls.set('cct_news_seen', String(mx)); }); // lo visto hasta aquí; lo siguiente saldrá como NUEVA
    setTab(st.tab); schedule(); refresh(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  root.CCTNews = {refresh, setTab};
})(typeof self !== 'undefined' ? self : this);
