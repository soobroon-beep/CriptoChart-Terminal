/* Interfaz de la pestaña IA: tres herramientas (Analizar gráfico · Briefing del día · Laboratorio de indicadores).
   Usa modelos abiertos y gratuitos a través de llm.js; si el modelo no responde, cae al analista local de reglas (ai.js).
   Solo esta sección es nueva: toca el resto de la app únicamente mediante window.CCT_ai (captura del gráfico y motor Pine) y CCT_getAIContext. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const AI = window.CCTAICore, LLM = window.CCTLLM; if (!AI || !LLM) return;
  const $ = (s, e) => (e || document).querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const st = {view: 'home', busy: false, calendar: null, calAt: 0, abort: null,
    chart: {hist: [], shot: null}, brief: {text: '', at: 0, by: '', sym: ''}, lab: {hist: [], code: '', name: '', sid: null, res: null, metrics: null, expl: ''}};
  let root;

  function md(t) { // Markdown mínimo y seguro
    const out = []; let list = false;
    for (const ln of String(t).split('\n')) {
      const h = esc(ln).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[\s(])_(.+?)_(?=[\s).,;:]|$)/g, '$1<i>$2</i>'), li = /^\s*(?:[-•*]|\d+[.)]) (.*)/.exec(h);
      if (li) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + li[1] + '</li>'); continue; }
      if (list) { out.push('</ul>'); list = false; }
      const hd = /^#{1,4} (.*)/.exec(h); if (hd) out.push('<h4>' + hd[1] + '</h4>'); else if (h.trim()) out.push('<p>' + h + '</p>');
    }
    if (list) out.push('</ul>'); return out.join('');
  }
  const ico = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    chart: ico('<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 5-6"/><circle cx="8" cy="15" r="1"/><circle cx="19" cy="7" r="1"/>'),
    brief: ico('<path d="M5 4h11a2 2 0 0 1 2 2v13a1 1 0 0 0 1 1H7a2 2 0 0 1-2-2z"/><path d="M18 9h2a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2"/><path d="M9 8h5M9 12h5M9 16h3"/>'),
    lab: ico('<path d="M9 3h6"/><path d="M10 3v6L5 19a1.5 1.5 0 0 0 1.4 2h11.2A1.5 1.5 0 0 0 19 19l-5-10V3"/><path d="M8 15h8"/>'),
    back: ico('<path d="M15 6l-6 6 6 6"/>'), gear: ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    send: ico('<path d="M5 12l14-7-5 14-2.5-5.5z"/>')
  };
  const unsup = r => ((r && r.warnings) || []).filter(w => w.level === 'unsupported'), good = r => !!(r && r.ok && !unsup(r).length); // un script con funciones no soportadas «corre» pero devuelve na: no cuenta como válido
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'hora local'; } catch { return 'hora local'; } };
  const hhmm = t => new Date(t).toLocaleString('es', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false});

  async function loadCalendar() {
    if (st.calendar && Date.now() - st.calAt < 600e3) return st.calendar;
    try { const r = await fetch('calendar-data.json?_=' + Math.floor(Date.now() / 6e4), {cache: 'no-store'}); if (r.ok) { const j = await r.json(); st.calendar = j.events || []; st.calAt = Date.now(); st.calUpdated = j.at || 0; } } catch {}
    return st.calendar;
  }
  async function gather(withMarket) {
    const ctx = window.CCT_getAIContext && window.CCT_getAIContext(), news = window.CCTNews && window.CCTNews.items ? window.CCTNews.items() : [], cal = await loadCalendar();
    let market = []; if (withMarket && window.CCT_getMarketSnapshot) { try { market = await window.CCT_getMarketSnapshot(); } catch {} }
    return {ctx, extra: {news, calendar: cal || [], market, now: Date.now()}};
  }

  /* ───────── Mensajes para el modelo ───────── */
  const SYS = AI.SYSTEM + `\nIDIOMA: responde SIEMPRE en español.\nHONESTIDAD: no inventes datos, horarios, noticias ni precios; si falta un dato, dilo. Distingue hechos confirmados, opiniones y rumores. Nunca prometas ganancias ni des órdenes de compra/venta: solo escenarios educativos.`;
  const SYS_CHART = SYS + `\nTAREA: eres el analista del gráfico abierto del usuario. Recibirás una CAPTURA del gráfico (si el modelo la admite) y los DATOS de SUS indicadores (JSON: indicadores activos, valores, zonas, perfil de volumen, scripts Pine con sus líneas/tablas y las últimas velas).
REGLA CLAVE: básate SOLO en los indicadores y niveles que el usuario realmente tiene en el gráfico (los que aparecen en los datos y en la captura). NO hables de EMA, RSI, MACD, medias móviles, Bollinger ni de ningún otro indicador que no esté en sus datos. Los números de los datos son los niveles reales; no inventes precios.
FORMATO (RESUMEN BREVE, máximo ~170 palabras, viñetas cortas): ### Niveles clave (soportes y resistencias con precio, los más importantes, máximo 3 de cada uno) ### Niveles a vigilar (1-3, con qué pasaría si se pierden/rompen) ### Qué dicen mis indicadores (una línea por indicador: qué marca ahora) ### Lectura rápida (1-2 frases: sesgo y qué esperar). En preguntas de seguimiento responde corto y directo.`;
  const SYS_BRIEF = SYS + `\nTAREA: genera un BRIEFING DEL DÍA en forma de RESUMEN CORTO (máximo ~300 palabras, viñetas de una línea; nada de párrafos largos ni listas exhaustivas). Usa SOLO los datos entregados. Secciones (### con título): Eventos importantes próximos (solo los 3-5 de impacto alto más cercanos: nombre, hora en la zona horaria indicada, y en una frase por qué importa para cripto; si no hay, dilo) · Noticias que mueven el mercado (máx. 4 viñetas, con fuente; distingue hecho, opinión o rumor) · Novedades de IA (máx. 3 viñetas sobre lo nuevo o futuro de la inteligencia artificial que aparezca en las noticias; si no hay, di que no hay novedades en las fuentes) · Criptos más populares hoy (3-4 monedas por volumen o variación en 24 h, y por qué se mueven SOLO si las noticias o los datos lo explican; si no, di solo el dato) · Tu gráfico (símbolo, precio, 2-3 niveles clave y qué marcan SUS indicadores; no menciones indicadores que no tenga) · Qué vigilar hoy (1-2 líneas de riesgo/cautela). Si no hay gráfico abierto, omite «Tu gráfico». Cierra con «Análisis educativo, no asesoría financiera.»`;
  const NOVA_RE = /nova|oscillator|screener/i;
  function userData(ctx) { // solo lo que el usuario realmente tiene en el gráfico (sin EMA/RSI/MACD calculados por la app)
    const c = ctx.candles, r = x => x == null ? null : +(+x).toPrecision(7), hi = Math.max(...c.slice(-120).map(k => k.h)), lo = Math.min(...c.slice(-120).map(k => k.l));
    const novaOn = (ctx.pine || []).some(p => NOVA_RE.test(p.name)) || (ctx.active || []).some(k => /^nn|nova/i.test(k));
    return JSON.stringify({activo: ctx.symbol, marco: ctx.interval, precio: r(c[c.length - 1].c), cambio24h_pct: ctx.change24h, maximo_120_velas: r(hi), minimo_120_velas: r(lo),
      indicadores_activos_del_usuario: ctx.active, valores_de_esos_indicadores: ctx.values, zonas_soporte_resistencia_dibujadas: ctx.zones, perfil_volumen: ctx.vp, scripts_pine_del_usuario: ctx.pine, nova_nexus: novaOn ? ctx.nova : undefined,
      ultimas_velas_OHLC: c.slice(-30).map(k => [r(k.o), r(k.h), r(k.l), r(k.c)])});
  }
  function dataBlock(ctx, extra) { return ctx ? userData(ctx) : JSON.stringify({sin_grafico: true}); }
  function briefExtras(extra) { // eventos y noticias con fecha/hora explícitas en la zona del usuario, para que el modelo no tenga que calcular horarios
    const now = extra.now, ev = (extra.calendar || []).filter(e => e.t > now - 3 * 36e5 && e.t < now + 72 * 36e5 && /high|medium|alto|medio/i.test(e.impact || '')).sort((a, b) => a.t - b.t).slice(0, 14);
    const evs = ev.map(e => `- ${hhmm(e.t)} (${tz()}) · ${e.country} · ${e.title} · impacto ${e.impact} · previsión ${e.forecast || '—'} · previo ${e.previous || '—'}${e.actual ? ' · REAL ' + e.actual : ''}`).join('\n') || '(sin eventos de impacto medio/alto en las próximas 72 h)';
    const nws = (extra.news || []).filter(n => n.t > now - 36 * 36e5).slice(0, 24).map(n => `- ${hhmm(n.t)} · ${n.src || 'fuente'} · ${n.title}`).join('\n') || '(sin noticias recientes cargadas)';
    const mk = (extra.market || []).slice(0, 12).map(m => `- ${m.symbol}: ${m.price} · 24 h ${m.chg24h >= 0 ? '+' : ''}${(+m.chg24h).toFixed(1)}% · volumen ${Math.round(m.volUsd / 1e6)} M USD`).join('\n') || '(sin datos de mercado)';
    return `AHORA: ${new Date(now).toLocaleString('es', {dateStyle: 'full', timeStyle: 'short'})} (${tz()})\nCALENDARIO ECONÓMICO (hora local ${tz()}):\n${evs}\nNOTICIAS RECIENTES (fuente y fecha):\n${nws}\nMONEDAS CON MÁS VOLUMEN (Binance Spot):\n${mk}`;
  }

  /* ───────── Llamada con transmisión a una burbuja ───────── */
  async function callLLM(messages, opts, bubble) {
    const o = Object.assign({}, opts, {onToken: t => { if (bubble) { bubble.innerHTML = md(t) + '<span class="aiv-cursor"></span>'; scroll(); } }, onProgress: p => { if (bubble && p && p.text) bubble.innerHTML = `<p class="aiv-dim">${esc(p.text)}</p>`; }});
    const r = await LLM.chat(messages, o); if (bubble) bubble.innerHTML = md(r.text); return r;
  }
  const scroll = () => { const l = $('#aivLog'); if (l) l.scrollTop = l.scrollHeight; };
  function bubble(role, html, cls) { const log = $('#aivLog'); const d = document.createElement('div'); d.className = 'aiv-msg ' + role + (cls ? ' ' + cls : ''); d.innerHTML = html; log.appendChild(d); scroll(); return d; }
  const setBusy = b => { st.busy = b; root.querySelectorAll('[data-busy-off]').forEach(x => { x.disabled = b; }); };
  const note = t => `<p class="aiv-dim">${esc(t)}</p>`;

  /* ───────── Pantalla de inicio ───────── */
  function head(title, sub) {
    const c = window.CCT_getAIContext && window.CCT_getAIContext();
    return `<div class="aiv-top">${st.view !== 'home' ? `<button class="aiv-ib" data-act="home" aria-label="Volver">${ICONS.back}</button>` : ''}<div class="aiv-title"><b>${esc(title)}</b><small>${esc(sub || (c ? c.symbol + ' · ' + c.interval : 'Sin gráfico cargado'))}</small></div><button class="aiv-ib" data-act="cfg" aria-label="Ajustes de la IA" title="Ajustes de la IA">${ICONS.gear}</button></div>`;
  }
  function home() {
    st.view = 'home';
    root.innerHTML = head('Asistente IA', LLM.providerLabel()) + `<div class="aiv-cards">
      <button class="aiv-card" data-act="chart">${ICONS.chart}<span><b>Analizar gráfico con IA</b><small>Toma una captura de tu gráfico (con indicadores y dibujos), marca soportes y resistencias, y puedes seguir preguntándole.</small></span></button>
      <button class="aiv-card" data-act="brief">${ICONS.brief}<span><b>Briefing del día</b><small>Calendario económico, noticias con fuente y fecha, y lectura de tu gráfico en 10 secciones.</small></span></button>
      <button class="aiv-card" data-act="lab">${ICONS.lab}<span><b>Laboratorio de indicadores IA</b><small>Describe un indicador con tus palabras; la IA lo programa, lo valida y lo prueba en tu gráfico.</small></span></button>
    </div><p class="aiv-foot">Análisis y briefing: modelos abiertos gratuitos · Laboratorio: modelo en tu navegador · sin clave de Claude. Análisis educativo, no asesoría financiera.</p>`;
  }

  /* ───────── 1 · Analizar gráfico ───────── */
  function chartView() {
    st.view = 'chart';
    root.innerHTML = head('Analizar gráfico') + `<div class="aiv-log" id="aivLog" aria-live="polite"></div>
      <div class="aiv-chips"><button data-act="reshot" data-busy-off>Nueva captura y análisis</button>${['¿Dónde están los soportes?', '¿Y las resistencias?', '¿Qué dicen mis indicadores?', 'Dame un plan con invalidación'].map(q => `<button data-q="${esc(q)}" data-busy-off>${esc(q)}</button>`).join('')}</div>
      <form class="aiv-form" id="aivForm"><input id="aivIn" placeholder="Pregunta sobre lo que ves en el gráfico…" autocomplete="off" maxlength="600"><button class="aiv-send" data-busy-off aria-label="Enviar">${ICONS.send}</button></form>`;
    if (!st.chart.hist.length) analyzeChart(); else { for (const m of st.chart.hist) if (!m.hidden) bubble(m.role === 'user' ? 'user' : 'bot', m.role === 'user' ? `<p>${esc(m.show || m.text)}</p>` : md(m.text)); }
  }
  async function analyzeChart() {
    if (st.busy) return; const g = await gather(false), ctx = g.ctx;
    if (!ctx) { bubble('bot', md('Aún no hay un gráfico con velas cargadas. Abre la pestaña **Gráfico**, espera a que cargue y vuelve aquí.')); return; }
    st.chart.hist = []; $('#aivLog').innerHTML = ''; setBusy(true);
    const cap = window.CCT_ai && window.CCT_ai.capture(1100); st.chart.shot = cap;
    if (cap) bubble('user', `<img class="aiv-shot" alt="Captura del gráfico" src="${cap.url}"><p>Analiza mi gráfico ${esc(cap.symbol)} · ${esc(cap.interval)}</p>`);
    else bubble('user', `<p>Analiza mi gráfico ${esc(ctx.symbol)} · ${esc(ctx.interval)}</p>`);
    const prompt = `Resume este gráfico de ${ctx.symbol} en ${ctx.interval} usando solo mis indicadores (captura y datos).\n\nDATOS DE MIS INDICADORES (JSON, actualizados ahora):\n${dataBlock(ctx, g.extra)}`;
    const msgs = [{role: 'system', content: SYS_CHART}, cap ? LLM.imageMessage(prompt, cap.url) : {role: 'user', content: prompt}];
    const b = bubble('bot', note('Analizando…'), 'typing');
    try {
      const r = await callLLM(msgs, {purpose: 'vision', needVision: !!cap, maxTokens: 700}, b); b.classList.remove('typing');
      b.insertAdjacentHTML('beforeend', note(cap ? (r.image ? 'La IA recibió la captura del gráfico junto con los datos.' : 'Este modelo no lee imágenes: analizó los datos numéricos de tus velas e indicadores (la captura no se pudo usar).') : 'No se pudo tomar la captura (abre la pestaña Gráfico primero): analizó solo los datos numéricos.') + note('Modelo: ' + r.model));
      st.chart.hist.push({role: 'user', content: msgs[1].content, text: prompt, hidden: true}, {role: 'assistant', content: r.text, text: r.text});
    } catch (e) { b.classList.remove('typing'); b.innerHTML = md('**No pude consultar el modelo de IA.** ' + LLM.friendly(e) + '\n\nTe dejo el análisis local por reglas:\n\n' + AI.answerLocal('Analiza el gráfico', ctx, g.extra)); }
    setBusy(false);
  }
  async function followUp(q) {
    q = String(q || '').trim(); if (!q || st.busy) return; if (!st.chart.hist.length) { await analyzeChart(); }
    const g = await gather(false), ctx = g.ctx; setBusy(true); bubble('user', `<p>${esc(q)}</p>`);
    if (!ctx) { bubble('bot', md('Abre un gráfico con velas para que pueda responderte con datos reales.')); setBusy(false); return; }
    const text = `${q}\n\nDATOS ACTUALES DE MIS INDICADORES (JSON):\n${dataBlock(ctx, g.extra)}`, hist = st.chart.hist.slice(-7);
    const msgs = [{role: 'system', content: SYS_CHART}, ...hist.map(m => ({role: m.role, content: m.content})), {role: 'user', content: text}], b = bubble('bot', note('Pensando…'), 'typing');
    try { const r = await callLLM(msgs, {needVision: LLM.hasImage(msgs), maxTokens: 600}, b); b.classList.remove('typing'); st.chart.hist.push({role: 'user', content: text, text: q, show: q, hidden: true}, {role: 'assistant', content: r.text, text: r.text}); }
    catch (e) { b.classList.remove('typing'); b.innerHTML = md('**El modelo no respondió.** ' + LLM.friendly(e) + '\n\nRespuesta local:\n\n' + AI.answerLocal(q, ctx, g.extra)); }
    setBusy(false);
  }

  /* ───────── 2 · Briefing del día ───────── */
  function briefView(auto) {
    st.view = 'brief';
    root.innerHTML = head('Briefing del día') + `<div class="aiv-log" id="aivLog"></div><div class="aiv-bar"><button class="aiv-btn" data-act="rebrief" data-busy-off>Actualizar briefing</button></div>`;
    if (st.brief.text) renderBrief(); else if (auto !== false) makeBrief();
  }
  function renderBrief() {
    const b = st.brief; $('#aivLog').innerHTML = `<div class="aiv-msg bot full">${md(b.text)}</div>` + note(`Datos al ${new Date(b.at).toLocaleString('es', {dateStyle: 'medium', timeStyle: 'short'})} (${tz()}) · ${b.by}`) + `<details class="aiv-det"><summary>Fuentes de los datos</summary><p class="aiv-dim">Calendario económico: snapshot de ForexFactory${st.calUpdated ? ' actualizado ' + new Date(st.calUpdated).toLocaleString('es', {dateStyle: 'short', timeStyle: 'short'}) : ''} · Noticias: fuentes que ya tienes en la pestaña Noticias · Precios: Binance Spot · Gráfico: el que tienes abierto. Lo que no aparece en estas fuentes, la IA no lo conoce.</p></details>`;
  }
  async function makeBrief() {
    if (st.busy) return; setBusy(true); const log = $('#aivLog'); log.innerHTML = `<div class="aiv-msg bot typing">${note('Reuniendo calendario, noticias, mercado y tu gráfico…')}</div>`;
    const g = await gather(true), b = log.firstChild, prompt = `Genera el briefing del día.\n\n${briefExtras(g.extra)}\n\nDATOS DEL GRÁFICO Y MERCADO (JSON):\n${dataBlock(g.ctx, g.extra)}`;
    try {
      const r = await callLLM([{role: 'system', content: SYS_BRIEF}, {role: 'user', content: prompt}], {maxTokens: 900, timeout: 120000}, b);
      st.brief = {text: r.text, at: Date.now(), by: 'Modelo: ' + r.model, sym: g.ctx ? g.ctx.symbol : ''};
    } catch (e) {
      st.brief = {text: `**No pude consultar el modelo de IA** (${LLM.friendly(e)}). Este es el briefing por reglas con tus datos reales:\n\n` + AI.briefLocal(g.ctx, g.extra), at: Date.now(), by: 'Analista local por reglas (sin modelo)', sym: ''};
    }
    renderBrief(); setBusy(false);
  }

  /* ───────── 3 · Laboratorio de indicadores ───────── */
  const LAB_EX = ['RSI con señales de compra al cruzar 30 hacia arriba y venta al cruzar 70 hacia abajo', 'Bandas de Bollinger que marquen cuando el precio cierra fuera de la banda y vuelve a entrar', 'Cruce de EMA 9 y EMA 21 con flechas y un fondo suave según la tendencia', 'ATR con un stop dinámico tipo Chandelier sobre el precio'];
  function labView() {
    st.view = 'lab'; const L = st.lab;
    root.innerHTML = head('Laboratorio de indicadores IA') + `<div class="aiv-lab" id="aivLog">
      <div class="aiv-msg bot full">${md('Cuéntame qué indicador quieres, con tus palabras. Lo diseño, lo programo para el motor de Pine de tu app, lo **valido** y lo puedes **probar en tu gráfico**.')}</div>
      <div id="labOut"></div></div>
      <div class="aiv-chips">${LAB_EX.map(q => `<button data-lab="${esc(q)}" data-busy-off>${esc(q.length > 44 ? q.slice(0, 42) + '…' : q)}</button>`).join('')}</div>
      <form class="aiv-form" id="labForm"><textarea id="labIn" rows="2" placeholder="${L.code ? 'Pide un cambio: «hazlo más sensible», «añade alerta»…' : 'Ej.: indicador que marque cruces de EMA 20/50 con flechas'}" maxlength="900"></textarea><button class="aiv-send" data-busy-off aria-label="Generar">${ICONS.send}</button></form>
      <div class="aiv-saved" id="labSaved"></div>`;
    renderLab(); renderSaved();
  }
  function metricsHtml(m) {
    if (!m || !m.signals.length) return '<p class="aiv-dim">Este indicador no dibuja señales de compra/venta (marcas bajo/sobre la vela), así que no hay estadística de señales que mostrar.</p>';
    const row = s => `<tr><td>${esc(s.title)}</td><td>${s.n}</td>${[5, 10, 20].map(H => { const x = s.h[H]; return `<td>${x ? x.hit + '% · ' + (x.avg > 0 ? '+' : '') + x.avg + '%' : '—'}</td>`; }).join('')}</tr>`;
    return `<div class="aiv-tbl"><table><thead><tr><th>Señal</th><th>N</th><th>+5 velas</th><th>+10</th><th>+20</th></tr></thead><tbody>${m.signals.map(row).join('')}</tbody></table></div><p class="aiv-dim">«Acierto · media» = % de señales tras las que el precio se movió a favor y movimiento medio. ${esc(m.note)}</p>`;
  }
  function renderLab() {
    const L = st.lab, out = $('#labOut'); if (!out) return;
    if (!L.code) { out.innerHTML = ''; return; }
    const val = L.res ? (good(L.res) ? '<div class="pine-box ok">✔ Código validado con el motor de tu app y ejecutado sobre las velas reales de este gráfico.</div>' + (L.res.warnings && L.res.warnings.length ? window.CCT_ai.msg(L.res, L.code) : '') : '<div class="pine-box err">No pude dejar el código libre de errores tras 3 intentos. Puedes pedirle un cambio con «Editar con IA».</div>' + window.CCT_ai.msg(L.res, L.code)) : '';
    out.innerHTML = `${L.expl ? `<div class="aiv-msg bot full">${md(L.expl)}</div>` : ''}${val}
      <div class="aiv-actions"><button class="aiv-btn" data-act="try" ${good(L.res) ? '' : 'disabled'}>Probar en gráfico</button><button class="aiv-btn" data-act="save" ${L.sid && good(L.res) ? '' : 'disabled'}>Guardar indicador</button><button class="aiv-btn ghost" data-act="edit">Editar con IA</button><button class="aiv-btn ghost danger" data-act="del" ${L.sid ? '' : 'disabled'}>Eliminar</button></div>
      <details class="aiv-det"><summary>Ver código Pine (${L.code.split('\n').length} líneas)</summary><pre class="aiv-code">${esc(L.code)}</pre></details>
      ${good(L.res) ? `<details class="aiv-det" open><summary>Señales sobre el historial cargado (descriptivo)</summary>${metricsHtml(L.metrics)}</details>` : ''}`;
  }
  function renderSaved() {
    const el = $('#labSaved'); if (!el) return; const list = window.CCT_ai ? window.CCT_ai.list().filter(x => !x.temp) : [];
    el.innerHTML = list.length ? `<h4>Mis indicadores IA</h4>` + list.map(x => `<div class="aiv-saved-row"><b>${esc(x.name)}</b><span><button class="aiv-mini" data-sv="tog" data-id="${x.id}">${x.on ? 'Quitar del gráfico' : 'Al gráfico'}</button><button class="aiv-mini" data-sv="edit" data-id="${x.id}">Editar con IA</button><button class="aiv-mini danger" data-sv="del" data-id="${x.id}">Eliminar</button></span></div>`).join('') : '';
  }
  async function labGenerate(req) {
    req = String(req || '').trim(); if (!req || st.busy) return; const L = st.lab; setBusy(true);
    const out = $('#labOut'); out.insertAdjacentHTML('afterbegin', ''); const log = $('#aivLog');
    const ub = document.createElement('div'); ub.className = 'aiv-msg user'; ub.innerHTML = `<p>${esc(req)}</p>`; log.insertBefore(ub, out);
    const bb = document.createElement('div'); bb.className = 'aiv-msg bot typing'; bb.innerHTML = note('Diseñando el indicador…'); log.insertBefore(bb, out); scroll();
    const msgs = [{role: 'system', content: LLM.PINE_GUIDE}, ...L.hist.slice(-4), {role: 'user', content: (L.code ? `Código actual:\n\`\`\`pine\n${L.code}\n\`\`\`\nCambio pedido: ` : 'Quiero este indicador: ') + req}];
    let code = '', expl = '', res = null, tries = 0, err = '';
    try {
      for (; tries < 3; tries++) {
        const r = await callLLM(msgs, {purpose: 'code', maxTokens: 2200, temperature: .2, timeout: 120000}, tries ? null : bb);
        code = LLM.extractCode(r.text); expl = LLM.stripCode(r.text) || expl;
        msgs.push({role: 'assistant', content: r.text});
        if (!code) { err = 'La respuesta no incluyó un bloque de código Pine.'; msgs.push({role: 'user', content: 'Falta el bloque ```pine con el código completo. Devuélvelo.'}); continue; }
        res = await window.CCT_ai.run(code, 'Indicador IA');
        if (good(res)) { err = ''; break; }
        err = (res && res.error && res.error.msg) || unsup(res).map(w => `línea ${w.line}: ${w.msg}`).join('; ') || 'Error desconocido'; bb.classList.add('typing'); bb.innerHTML = note(`Corrigiendo un error del código (intento ${tries + 1}/3)…`);
        msgs.push({role: 'user', content: `Tu código falló en el intérprete de Pine de la app: «${err}»${res && res.error && res.error.line ? ' (línea ' + res.error.line + ')' : ''}. Esas funciones no existen en el intérprete: reemplázalas por cálculos con ta.*, math.* u operaciones básicas. Corrige el código usando solo funciones soportadas y devuélvelo completo en un bloque \`\`\`pine.`});
      }
    } catch (e) { bb.classList.remove('typing'); bb.innerHTML = md('**No pude consultar el modelo de IA.** ' + LLM.friendly(e) + '\n\nPuedes cambiar de proveedor en ⚙ e intentarlo otra vez.'); setBusy(false); return; }
    bb.classList.remove('typing'); bb.innerHTML = md(expl || 'Listo.');
    if (code) {
      if (L.sid) { window.CCT_ai.remove(L.sid, true); L.sid = null; } // la prueba anterior sale del gráfico; la guardada se conserva si ya se guardó
      L.code = code; L.res = res; L.name = ''; L.expl = ''; L.metrics = good(res) ? LLM.signalMetrics(window.CCT_ai.candles(), res) : null;
      L.hist.push({role: 'user', content: req}, {role: 'assistant', content: 'He generado:\n```pine\n' + code + '\n```'}); if (L.hist.length > 8) L.hist.splice(0, 2);
      if (good(res)) L.sid = window.CCT_ai.tryOnChart(code, 'Indicador IA', res); // se ve de inmediato en el gráfico (sin guardar)
      bb.remove(); L.expl = expl;
    }
    renderLab(); setBusy(false); const o = $('#labOut'); if (o) o.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }

  /* ───────── Ajustes ───────── */
  function cfgView() {
    const c = LLM.load(), prev = st.view; st.cfgPrev = prev; st.view = 'cfg';
    root.innerHTML = head('Ajustes de la IA', 'Proveedor del modelo') + `<div class="aiv-cfg">
      <label>Proveedor<select id="cfProv"><option value="free">Gratis · modelos abiertos (sin clave)</option><option value="compat">Mi servidor / Ollama / servicio con clave gratuita</option><option value="webllm">En mi navegador (WebLLM, experimental)</option></select></label>
      <label>Proveedor del Laboratorio de indicadores (código)<select id="cfLab"><option value="webllm">En mi navegador (WebLLM) — recomendado</option><option value="free">Gratis · modelos abiertos (sin clave)</option><option value="compat">Mi servidor / Ollama</option></select></label>
      <div id="cfCompat"><label>URL compatible con OpenAI<input id="cfUrl" value="${esc(c.compat.url)}" autocomplete="off" spellcheck="false" placeholder="http://localhost:11434/v1"></label>
        <label>Modelo<input id="cfModel" value="${esc(c.compat.model)}" autocomplete="off" spellcheck="false" placeholder="qwen2.5vl:7b"></label>
        <label>Clave (opcional)<input id="cfKey" type="password" value="${esc(c.compat.key)}" autocomplete="off" placeholder="solo si el servicio la pide"></label>
        <label class="aiv-chk"><input id="cfVis" type="checkbox" ${c.compat.vision ? 'checked' : ''}> El modelo entiende imágenes (necesario para analizar la captura)</label>
        <p class="aiv-dim">Ejemplos gratuitos: <b>Ollama</b> en tu computadora (<code>http://localhost:11434/v1</code>, modelo <code>qwen2.5vl</code> o <code>llama3.2-vision</code>; para usarlo desde esta web ejecuta Ollama con <code>OLLAMA_ORIGINS=*</code>), <b>LM Studio</b>, o los planes gratuitos de Groq / OpenRouter con su clave.</p></div>
      <p class="aiv-dim" id="cfNote"></p>
      <div class="aiv-actions"><button class="aiv-btn" data-act="cfsave">Guardar</button><button class="aiv-btn ghost" data-act="cftest">Probar conexión</button></div><div id="cfOut"></div></div>`;
    $('#cfProv').value = c.provider; $('#cfLab').value = c.lab; const sync = () => { const p = $('#cfProv').value; $('#cfCompat').hidden = p !== 'compat' && $('#cfLab').value !== 'compat'; $('#cfNote').textContent = p === 'free' ? 'Privacidad: tu pregunta, los datos del gráfico y la captura viajan al servicio gratuito de terceros (Pollinations), que usa modelos abiertos. No incluyas nada que no quieras compartir. Es un servicio comunitario: puede ir lento o saturarse.' : p === 'webllm' ? 'El modelo se descarga una vez (cientos de MB) y corre en tu equipo con WebGPU: nada sale de tu navegador. Necesita Chrome/Edge de escritorio reciente y buena memoria gráfica. Es experimental.' : 'Los datos van solo a la URL que indiques (si es tu computadora, no salen de ella). La clave se guarda solo en este navegador.'; };
    $('#cfProv').onchange = sync; $('#cfLab').onchange = sync; sync();
  }
  function readCfg() { return {provider: $('#cfProv').value, lab: $('#cfLab').value, compat: {url: $('#cfUrl').value.trim(), key: $('#cfKey').value.trim(), model: $('#cfModel').value.trim(), vision: $('#cfVis').checked}}; }

  /* ───────── Eventos ───────── */
  function onClick(e) {
    const t = e.target.closest('[data-act],[data-q],[data-lab],[data-sv]'); if (!t) return;
    if (t.dataset.q) return followUp(t.dataset.q);
    if (t.dataset.lab) { const i = $('#labIn'); if (i) { i.value = t.dataset.lab; i.focus(); } return; }
    if (t.dataset.sv) { const L = st.lab, A = window.CCT_ai, id = t.dataset.id, x = A.list().find(y => y.id === id); if (!x) return;
      if (t.dataset.sv === 'tog') { A.toggle(id, !x.on); renderSaved(); } else if (t.dataset.sv === 'del') { if (confirm(`¿Eliminar el indicador «${x.name}»?`)) { A.remove(id); if (L.sid === id) { L.sid = null; L.code = ''; L.res = null; } renderLab(); renderSaved(); } }
      else { L.code = x.code; L.sid = id; L.res = null; L.expl = `Editando **${x.name}**. Dime qué quieres cambiar.`; L.hist = []; renderLab(); const i = $('#labIn'); if (i) i.focus(); } return; }
    const a = t.dataset.act, L = st.lab, A = window.CCT_ai;
    if (a === 'home') home(); else if (a === 'chart') chartView(); else if (a === 'brief') briefView(); else if (a === 'lab') labView(); else if (a === 'cfg') cfgView();
    else if (a === 'reshot') analyzeChart(); else if (a === 'rebrief') makeBrief();
    else if (a === 'try') { if (L.sid && A.list().some(x => x.id === L.sid)) { A.toggle(L.sid, true); } else if (good(L.res)) L.sid = A.tryOnChart(L.code, 'Indicador IA', L.res); renderLab(); }
    else if (a === 'save') { if (L.sid && A.keep(L.sid)) { L.expl = (L.expl || '') ; renderSaved(); const b = document.createElement('div'); b.className = 'pine-box ok'; b.textContent = 'Guardado en «Mis indicadores IA» y en tus scripts de Pine.'; $('#labOut').prepend(b); } }
    else if (a === 'edit') { const i = $('#labIn'); if (i) { i.focus(); i.placeholder = 'Dime qué cambiar: «hazlo más sensible», «añade una alerta»…'; } }
    else if (a === 'del') { if (L.sid && confirm('¿Quitar este indicador del gráfico y eliminarlo?')) { A.remove(L.sid); L.sid = null; L.code = ''; L.res = null; L.expl = ''; L.hist = []; renderLab(); renderSaved(); } }
    else if (a === 'cfsave') { LLM.save(readCfg()); home(); }
    else if (a === 'cftest') { const out = $('#cfOut'); out.innerHTML = note('Probando…'); LLM.chat([{role: 'user', content: 'Responde solo: OK'}], {cfg: readCfg(), maxTokens: 20, timeout: 45000}).then(r => { out.innerHTML = `<div class="pine-box ok">✔ Conectado. Modelo: ${esc(r.model)}</div>`; }).catch(er => { out.innerHTML = `<div class="pine-box err">${esc(LLM.friendly(er))}</div>`; }); }
  }
  function init() {
    root = document.getElementById('aiRoot'); if (!root) return; root.classList.add('aiv');
    root.addEventListener('click', onClick);
    root.addEventListener('submit', e => {
      e.preventDefault();
      if (e.target.id === 'aivForm') { const i = $('#aivIn'), v = i.value; i.value = ''; followUp(v); }
      else if (e.target.id === 'labForm') { const i = $('#labIn'), v = i.value; i.value = ''; labGenerate(v); }
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'labIn') { e.preventDefault(); const i = e.target, v = i.value; i.value = ''; labGenerate(v); } });
    home();
    document.addEventListener('click', e => { if (e.target.closest('[data-side="aiView"],[data-view="aiView"]') && st.view === 'home') setTimeout(home, 60); });
  }
  window.CCTAIUI = Object.assign(window.CCTAIUI || {}, {md});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
