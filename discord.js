/* Discord para VORTEX — envía a un canal de tu servidor (p. ej. #vortex de «Nova Nexus») los avisos de la app:
   movimientos bruscos, alertas de precio, alertas con indicador y las señales del Screener (cada hora y cada 4 horas).
   Funciona con un webhook del canal (sin servidor propio): la app le hace POST directamente. El webhook se guarda en tu cuenta (solo tú lo lees).
   Límites: los envíos programados del Screener salen mientras la app esté abierta en algún dispositivo; no hay servidor que corra por ti. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const $ = (s, e) => (e || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const store = () => window.CCT_discordStore, get = () => (store() && store().get()) || {url: '', invite: '', on: {}, sent: {}};
  const HOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
  const COL = {up: 0x20bf9f, down: 0xf23645, info: 0x5865f2, long: 0x11cf77, short: 0xd11645, rng: 0x9b59b6};
  const LOGO = 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z';
  let status = {t: '', cls: ''}, q = Promise.resolve();

  /* Envío con cola: de uno en uno y respetando el «retry_after» de Discord cuando hay límite de ritmo */
  async function post(embeds, content) {
    const url = get().url; if (!url) return {ok: false, why: 'Sin webhook'};
    const body = JSON.stringify({username: 'VORTEX', content: content || undefined, embeds: embeds.slice(0, 10), allowed_mentions: {parse: []}});
    for (let k = 0; k < 3; k++) {
      let r; try { r = await fetch(url + '?wait=false', {method: 'POST', headers: {'content-type': 'application/json'}, body}); } catch (e) { return {ok: false, why: 'Sin conexión con Discord'}; }
      if (r.status === 429) { let w = 1500; try { w = Math.min(15000, Math.ceil(((await r.json()).retry_after || 1.5) * 1000)); } catch {} await new Promise(f => setTimeout(f, w)); continue; }
      if (r.ok) return {ok: true};
      return {ok: false, why: r.status === 404 || r.status === 401 ? 'El webhook ya no existe (¿lo borraste?)' : 'Discord respondió ' + r.status};
    }
    return {ok: false, why: 'Discord limitó el ritmo, intenta de nuevo'};
  }
  const send = (embeds, content) => (q = q.then(() => post(embeds, content)).then(r => { status = r.ok ? {t: 'Enviado · ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}), cls: 'ok'} : {t: r.why, cls: 'err'}; paint(); return r; }));
  const fmt = n => { n = +n; if (!Number.isFinite(n)) return '—'; const a = Math.abs(n); return n.toLocaleString('en-US', {maximumFractionDigits: a >= 1000 ? 2 : a >= 1 ? 4 : 8}); };

  /* Avisos de la app (movimientos bruscos, precio, indicador) */
  function alert(kind, o) {
    const D = get(); if (!D.url || !(D.on || {})[kind]) return;
    let e;
    if (kind === 'move') e = {title: `${o.dir === 'up' ? '🚀 Sube' : '🔻 Cae'} ${Math.abs(o.pct).toFixed(1)}% en ${o.win} · ${o.symbol}`, description: `Precio: **${fmt(o.price)}**`, color: o.dir === 'up' ? COL.up : COL.down, footer: {text: 'VORTEX · Movimiento brusco'}};
    else if (kind === 'price') e = {title: `🔔 ${o.symbol} ${o.dir === 'up' ? 'subió a' : 'bajó a'} ${fmt(o.level)}`, description: `Ahora: **${fmt(o.price)}**${o.note ? '\n' + String(o.note).slice(0, 200) : ''}`, color: o.dir === 'up' ? COL.up : COL.down, footer: {text: 'VORTEX · Alerta de precio'}};
    else e = {title: `📈 ${o.symbol} · ${o.interval} · ${String(o.label || 'Indicador').slice(0, 120)}`, description: [o.info, o.note].filter(Boolean).map(x => String(x).slice(0, 300)).join('\n') || undefined, color: COL.info, footer: {text: 'VORTEX · Alerta con indicador'}};
    e.timestamp = new Date().toISOString(); send([e]);
  }

  /* Screener: las monedas con señal activa (edad 1-5 velas) de las 50 con más volumen */
  async function scanSignals(tf) {
    const h = window.CCT_host, S = window.CCTScreener; if (!h || !S) return null;
    const top = await h.top(50), out = []; let k = 0;
    const worker = async () => { while (k < top.length) { const t = top[k++]; try { const sg = S.signalOf(await h.klines(t.symbol, tf)); if (sg) out.push({symbol: t.symbol, price: t.price, sg}); } catch {} } };
    await Promise.all(Array.from({length: 6}, worker));
    return out.sort((a, b) => (a.sg.ago - b.sg.ago) || (b.sg.score - a.sg.score));
  }
  const baseOf = s => String(s).replace(/(USDT|USDC|FDUSD|BUSD)$/, '');
  function signalEmbeds(tf, rows) {
    const line = r => `**${baseOf(r.symbol)}** · ${fmt(r.price)} · ${'★'.repeat(r.sg.score)}${'☆'.repeat(Math.max(0, 5 - r.sg.score))}${r.sg.div ? ' · divergencia' : ''} · vela ${r.sg.age}/5`;
    const group = (title, arr, color) => arr.length ? {title: `${title} (${arr.length})`, description: arr.map(line).join('\n').slice(0, 4000), color} : null;
    const L = rows.filter(r => !r.sg.range && r.sg.side === 'buy'), Sh = rows.filter(r => !r.sg.range && r.sg.side !== 'buy'), R = rows.filter(r => r.sg.range);
    const em = [group('🟢 LONG', L, COL.long), group('🔴 SHORT', Sh, COL.short), group('🟣 RANGO', R, COL.rng)].filter(Boolean);
    if (!em.length) em.push({title: `Screener ${tf} · sin señales activas`, description: 'Ninguna de las 50 criptos con más volumen tiene señal de Nova Nexus en las últimas 5 velas.', color: COL.info});
    em[0].author = {name: `Screener Nova Nexus · ${tf}`}; em[em.length - 1].footer = {text: `VORTEX · ${rows.length} señal${rows.length === 1 ? '' : 'es'} · Top 50 por volumen · Binance Spot`}; em[em.length - 1].timestamp = new Date().toISOString();
    return em;
  }
  async function sendSignals(tf) {
    const rows = await scanSignals(tf); if (!rows) return {ok: false, why: 'El Screener aún no está listo'};
    return send(signalEmbeds(tf, rows));
  }

  /* Programación: a cada hora cerrada (1h) y a cada 4 horas UTC (4h), mientras la app esté abierta. Un dispositivo a la vez: la marca «enviado» se sincroniza con la cuenta. */
  const SLOTS = [['s1h', '1h', 3600e3, 15 * 60e3], ['s4h', '4h', 4 * 3600e3, 30 * 60e3]];
  let busy = false;
  async function tick() {
    const D = get(); if (busy || !D.url || document.hidden && false) return;
    const now = Date.now();
    for (const [key, tf, ms, grace] of SLOTS) {
      if (!(D.on || {})[key]) continue;
      const slot = Math.floor(now / ms) * ms; if (now - slot < 20e3) continue; // la vela acaba de cerrar: espera unos segundos a que Binance la publique
      if ((D.sent || {})[key] >= slot) continue;
      if (now - slot > grace) { store().set({sent: {[key]: slot}}); continue; } // la app estaba cerrada: no se manda algo viejo
      busy = true; await new Promise(f => setTimeout(f, Math.random() * 8000)); // por si hay otro dispositivo abierto: el primero marca y el otro ve la marca
      if ((get().sent || {})[key] >= slot) { busy = false; return; }
      store().set({sent: {[key]: slot}});
      try { await sendSignals(tf); } finally { busy = false; }
      return;
    }
  }

  /* Panel */
  const SW = [['move', 'Movimientos bruscos', 'Cuando una moneda sube o cae fuerte en minutos'], ['price', 'Alertas de precio', 'Cuando una alerta que creaste llega a su precio'], ['ind', 'Alertas con indicador', 'Cuando se cumple una alerta con indicador'], ['s1h', 'Screener cada hora', 'Cada hora en punto: monedas con señal en 1h'], ['s4h', 'Screener cada 4 horas', 'Cada 4 h (00, 04, 08, 12, 16, 20 UTC): monedas con señal en 4h']];
  function paint() {
    const box = $('#discordBox'); if (!box) return; const D = get(), has = !!D.url; if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { const st = $('.dc-st', box); if (st) { st.textContent = status.t; st.className = 'dc-st ' + status.cls; } return; }
    box.innerHTML = `
      <div class="dc-card"><h3>1 · Únete al servidor</h3><p>Pega el enlace de invitación de tu servidor <b>Nova Nexus</b> para tenerlo a un toque.</p>
        <input class="dc-input" id="dcInv" placeholder="https://discord.gg/tu-invitación" value="${esc(D.invite || '')}" autocomplete="off" spellcheck="false">
        <div class="dc-row">${D.invite ? `<a class="dc-btn pri" href="${esc(D.invite)}" target="_blank" rel="noopener">Unirme a Nova Nexus</a>` : ''}<a class="dc-btn" href="https://discord.com/login" target="_blank" rel="noopener">Iniciar sesión en Discord</a></div></div>
      <div class="dc-card"><h3>2 · Conecta el canal #vortex</h3>
        <ol><li>En tu servidor crea un canal de texto llamado <b>#vortex</b>.</li><li>Ajustes del canal → <b>Integraciones</b> → <b>Webhooks</b> → <b>Nuevo webhook</b> → <b>Copiar URL del webhook</b>.</li><li>Pégala aquí:</li></ol>
        <input class="dc-input" id="dcHook" type="password" placeholder="https://discord.com/api/webhooks/…" value="${esc(D.url || '')}" autocomplete="off" spellcheck="false">
        <div class="dc-row"><button class="dc-btn pri" id="dcSave" type="button">Guardar</button><button class="dc-btn" id="dcTest" type="button" ${has ? '' : 'disabled'}>Enviar prueba</button>${has ? '<button class="dc-btn" id="dcDel" type="button">Desconectar</button>' : ''}</div>
        <div class="dc-st ${status.cls}">${esc(status.t || (has ? 'Conectado' : 'Sin conectar'))}</div>
        <small>La URL es como una llave del canal: quien la tenga puede escribir ahí. Se guarda solo en tu cuenta y en este dispositivo; no la compartas ni subas tu exportación JSON.</small></div>
      <div class="dc-card"><h3>3 · Qué enviar</h3>${SW.map(([k, n, d]) => `<div class="dc-sw"><div><b>${n}</b><small>${d}</small></div><button class="toggle ${(D.on || {})[k] !== false ? 'on' : ''}" data-dc="${k}" type="button" role="switch" aria-checked="${(D.on || {})[k] !== false}" aria-label="${n}"></button></div>`).join('')}
        <div class="dc-row"><button class="dc-btn" id="dcNow1" type="button" ${has ? '' : 'disabled'}>Enviar señales 1h ahora</button><button class="dc-btn" id="dcNow4" type="button" ${has ? '' : 'disabled'}>Enviar señales 4h ahora</button></div>
        <small>Los envíos del Screener salen mientras VORTEX esté abierta en algún dispositivo (PC o celular). Si la cierras, se saltan esas horas en vez de mandar señales viejas.</small></div>`;
  }
  const flash = (t, cls) => { status = {t, cls}; paint(); };
  document.addEventListener('click', async e => {
    const id = (e.target.closest('button') || {}).id;
    if (id === 'dcSave') {
      const url = ($('#dcHook') || {}).value.trim(), inv = ($('#dcInv') || {}).value.trim();
      if (url && !HOOK.test(url)) { flash('Esa URL no parece un webhook de Discord (debe empezar con https://discord.com/api/webhooks/…)', 'err'); return; }
      if (inv && !/^https:\/\/(discord\.gg\/|(www\.)?discord\.com\/invite\/)[\w-]{2,40}$/.test(inv)) { flash('La invitación debe ser como https://discord.gg/abcdef', 'err'); return; }
      store().set({url, invite: inv}); flash(url ? 'Guardado · usa «Enviar prueba»' : 'Guardado', 'ok');
    } else if (id === 'dcTest') { flash('Enviando…', ''); const r = await send([{title: '✅ VORTEX conectado', description: 'Aquí llegarán tus movimientos bruscos, alertas y señales del Screener.', color: COL.info, timestamp: new Date().toISOString(), footer: {text: 'Nova Nexus · VORTEX'}}]); if (r.ok) flash('Prueba enviada: revisa #vortex', 'ok'); }
    else if (id === 'dcDel') { store().set({url: ''}); flash('Desconectado', ''); }
    else if (id === 'dcNow1' || id === 'dcNow4') { const tf = id === 'dcNow1' ? '1h' : '4h'; flash(`Calculando señales ${tf}… (unos segundos)`, ''); const r = await sendSignals(tf); if (r && r.ok) flash(`Señales ${tf} enviadas`, 'ok'); }
    else if (e.target.closest('#dcOpenFromAlerts')) { if (window.CCT_switchView) CCT_switchView('discordView'); paint(); }
  });
  document.addEventListener('click', e => { const t = e.target.closest('[data-dc]'); if (!t || !store()) return; const k = t.dataset.dc, on = !t.classList.contains('on'); store().set({on: {[k]: on}}); t.classList.toggle('on', on); t.setAttribute('aria-checked', on); });
  document.addEventListener('click', e => { if (e.target.closest('#rrDiscord, [data-view=discordView]')) setTimeout(paint, 0); });
  window.CCTDiscord = {alert, sendSignals, send, paint, tick, signalEmbeds, HOOK};
  const boot = () => { paint(); setInterval(tick, 30000); setTimeout(tick, 8000); const b = $('#rrDiscord'); if (b) setInterval(() => b.classList.toggle('dc-on', !!get().url), 4000); };
  if (document.readyState === 'complete') boot(); else addEventListener('load', boot);
})();
