(() => {
  'use strict';
  if (window.top !== window.self) return;
  const icons = window.CCTAppIcons, root = document.getElementById('appInstall');
  if (!icons || !root) return;
  let promptEvent = null, waitingWorker = null, reloadForUpdate = false;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  root.innerHTML = `
    <div class="section-label">APLICACIÓN EN TU CELULAR</div>
    <div class="pwa-card">
      <div class="pwa-preview"><img data-app-icon width="64" height="64" alt="Ícono seleccionado"><div><b>CryptoChart Terminal</b><small id="appIconName"></small></div></div>
      <p class="small-note">Elige el ícono antes de instalar. Tu selección se guarda en este navegador.</p>
      <div class="pwa-icons" role="group" aria-label="Ícono de la aplicación"></div>
      <button class="primary" id="installApp" type="button">Instalar aplicación</button>
      <p id="installStatus" class="small-note" role="status" aria-live="polite"></p>
      <details id="installHelp"><summary>Cómo instalar o cambiar el ícono</summary>
        <p><b>Android:</b> abre esta página en Chrome, elige un ícono y toca Instalar aplicación. Si no aparece el aviso, usa el menú ⋮ → Instalar aplicación o Añadir a pantalla de inicio.</p>
        <p><b>iPhone / iPad:</b> abre esta página en Safari, elige un ícono y usa Compartir → Añadir a pantalla de inicio. Activa «Abrir como app» si aparece.</p>
        <p><b>Si ya está instalada:</b> el ícono de inicio no cambia inmediatamente desde estos ajustes. El navegador puede ofrecer una actualización; si conserva el anterior, vuelve a añadir la aplicación con el ícono elegido.</p>
        <p>Antes de eliminar una instalación, exporta tu configuración desde Datos y seguimiento o confirma que esté guardada en tu cuenta. El sistema puede borrar datos locales al eliminar la app.</p>
        <p>Los precios, noticias, IA y sincronización necesitan conexión a internet.</p>
      </details>
      <button id="updateApp" class="small-button" type="button" hidden>Actualizar aplicación</button>
    </div>`;
  const grid = root.querySelector('.pwa-icons'), button = root.querySelector('#installApp'), status = root.querySelector('#installStatus');
  for (const [id, name] of icons.variants) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pwa-icon-option'; b.dataset.icon = id;
    b.setAttribute('aria-label', name); b.innerHTML = `<img src="icons/${id}-192.png" width="56" height="56" alt=""><span>${name}</span>`;
    b.addEventListener('click', () => {
      if (id === icons.selected) return;
      promptEvent = null; icons.apply(id);
      const url = new URL(location.href); url.searchParams.set('appIcon', id); history.replaceState(null, '', url);
      render();
      status.textContent = 'Ícono elegido. Toca Preparar instalación para continuar con esta opción. Si ya está instalada, consulta las instrucciones.';
    }); grid.appendChild(b);
  }
  function render() {
    icons.apply(icons.selected);
    grid.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.icon === icons.selected)));
    root.querySelector('#appIconName').textContent = icons.variants.find(v => v[0] === icons.selected)[1];
    button.textContent = icons.selected !== icons.initial ? 'Preparar instalación' : standalone() ? 'Ver instrucciones de instalación' : promptEvent ? 'Instalar aplicación' : ios ? 'Ver pasos para iPhone / iPad' : 'Ver cómo instalar';
  }
  render();
  status.textContent = standalone() ? 'Abierta como aplicación instalada.' : ios ? 'Instala desde el menú Compartir de Safari.' : 'Si tu navegador permite la instalación, podrás iniciarla aquí o desde su menú.';
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); if (icons.selected === icons.initial) promptEvent = e; render(); });
  window.addEventListener('appinstalled', () => { promptEvent = null; status.textContent = 'Instalación solicitada al sistema. Busca CryptoChart en tu pantalla de inicio.'; render(); });
  button.addEventListener('click', async () => {
    if (icons.selected !== icons.initial) {
      const url = new URL(location.href); url.searchParams.set('appIcon', icons.selected); url.searchParams.set('install', '1');
      location.assign(url.href); return;
    }
    if (promptEvent && !standalone()) {
      const event = promptEvent; promptEvent = null; button.disabled = true;
      try { await event.prompt(); const choice = await event.userChoice; status.textContent = choice.outcome === 'accepted' ? 'Instalación aceptada. El sistema añadirá la aplicación.' : 'Instalación cancelada. Puedes intentarlo desde el menú del navegador.'; }
      catch { status.textContent = 'Abre el menú del navegador y elige Instalar aplicación o Añadir a pantalla de inicio.'; }
      finally { button.disabled = false; render(); }
    } else { root.querySelector('#installHelp').open = true; status.textContent = standalone() ? 'Ya estás usando la aplicación. Consulta cómo aplicar otro ícono abajo.' : 'Sigue los pasos para tu celular que aparecen abajo.'; }
  });
  if (new URLSearchParams(location.search).get('install') === '1') {
    document.getElementById('settingsBtn').click();
    root.scrollIntoView({block: 'start'});
    const url = new URL(location.href); url.searchParams.delete('install'); history.replaceState(null, '', url);
  }
  const offline = document.createElement('div'); offline.id = 'pwaOffline'; offline.setAttribute('role', 'status');
  offline.textContent = 'Sin conexión · los precios y noticias no se están actualizando.';
  document.getElementById('app').prepend(offline);
  const network = () => { offline.hidden = navigator.onLine; }; network();
  window.addEventListener('online', network); window.addEventListener('offline', network);
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloadForUpdate) location.reload(); });
    const showUpdate = worker => { waitingWorker = worker; root.querySelector('#updateApp').hidden = false; };
    root.querySelector('#updateApp').addEventListener('click', () => { if (waitingWorker) { reloadForUpdate = true; waitingWorker.postMessage({type: 'ACTIVATE_UPDATE'}); } });
    navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'}).then(reg => {
      if (reg.waiting) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker); });
      });
    }).catch(() => { status.textContent += ' No se pudo preparar el modo sin conexión; vuelve a cargar con internet.'; });
  }
})();
