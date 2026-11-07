# Instalar VORTEX

Abre https://soobroon-beep.github.io/CriptoChart-Terminal/ desde el navegador de tu celular.

1. En **Ajustes → Aplicación en tu celular**, elige el ícono. El predeterminado es el lazo naranja sobre blanco; también hay diez paletas individuales.
2. Si cambiaste la selección, toca **Preparar instalación**. La página recarga con el manifiesto correspondiente y vuelve a los ajustes.
3. **Android / Chrome:** toca **Instalar aplicación** cuando esté disponible o usa el menú ⋮ → Instalar aplicación / Añadir a pantalla de inicio.
4. **iPhone / iPad / Safari:** Compartir → Añadir a pantalla de inicio; activa Abrir como app si el sistema lo ofrece.

## Cambiar el ícono después de instalar

La selección cambia la vista previa, el favicon y los metadatos de instalación. No hay una API web universal que fuerce el cambio del ícono del sistema. El navegador puede ofrecer revisar la actualización. Si no cambia, vuelve a añadir la app desde el navegador después de elegir la variante.

Antes de quitar una instalación, exporta la configuración en Ajustes → Datos y seguimiento, o comprueba su sincronización. El sistema puede eliminar almacenamiento local al desinstalar. La elección del ícono es local a cada navegador/dispositivo y no modifica los gráficos ni las preferencias sincronizadas.

## Funcionamiento y mantenimiento

- Publicación estática en GitHub Pages; no necesita compilación ni dependencias nuevas.
- `pwa-icons.js` selecciona un manifiesto estático antes de la instalación. Las 21 variantes tienen el mismo `id` y `scope` para identificar una sola app.
- Cada variante incluye PNG de 180 (Apple), 192 y 512 píxeles, y una versión maskable de 512 con margen de seguridad.
- `pwa.js` integra los ajustes, la ayuda de instalación, el aviso sin conexión y el botón de actualización.
- `sw.js` usa red primero y conserva únicamente archivos locales de interfaz. No guarda respuestas de Binance, noticias/calendario JSON, Firebase, IA, cuentas ni operaciones. Sin internet no hay precios en vivo, noticias nuevas ni sincronización.
- Incrementa `CACHE` al cambiar archivos de la interfaz. Las actualizaciones del service worker se activan con el botón Actualizar aplicación; nunca se eliminan localStorage ni bases de datos del usuario.
- El alcance de la aplicación está limitado a `/CriptoChart-Terminal/`, no a otros sitios del mismo dominio.

## Validación

`node --test tests/*.test.js`

`node tests/e2e/pwa-dom.js` (requiere `jsdom`; comprueba integración DOM, no la instalación real del sistema).

La instalación y los avisos nativos deben comprobarse adicionalmente en Chrome Android y Safari iPhone.

Referencias: https://developer.chrome.com/blog/improvements-to-web-app-updates y https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html

## Reentrenamiento programado de bots (Nova Bot Lab)
Un flujo de GitHub Actions (`.github/workflows/botlab-retrain.yml`) corre cada día `scripts/botlab-retrain.js` para los bots con el «ciclo automático» activado (pestaña **Reentrenar** del bot). No depende de tener la app abierta. Hace validación walk-forward y **nunca cambia la versión principal**: solo deja resultados y, si hay mejora comprobada fuera de muestra, una versión *candidata* que tú apruebas.

Configuración (una sola vez):
1. **Reglas de Firestore**: el flujo «Publicar reglas de Firestore» (`deploy-firestore-rules.yml`) las publica solo desde `firestore.rules` en cuanto existe el secreto del paso 3 (la cuenta de servicio necesita el rol «Administrador de reglas de Firebase»). Si prefieres hacerlo a mano: Firebase Console → Firestore → Reglas → pega `firestore.rules` y publica.
2. **Firebase Console → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**. Se descarga un JSON.
3. **GitHub → Settings → Secrets and variables → Actions → New repository secret**: nombre `FIREBASE_SERVICE_ACCOUNT`, valor = el contenido completo del JSON. No lo subas al repositorio ni lo pegues en la app.
4. Para probar sin esperar: GitHub → Actions → «Reentrenar bots» → Run workflow (marca *force*).

Sin el secreto el flujo termina sin hacer nada (no falla). Los datos de velas se descargan de `data-api.binance.vision`.

## Paper trading
Se inicia desde la pestaña **Paper trading** de cada bot (solo versión de PC). Es una simulación hacia adelante con capital virtual: no envía órdenes reales. Se actualiza al abrir el laboratorio (se pone al día con las velas reales) y, con el secreto `FIREBASE_SERVICE_ACCOUNT` configurado, el flujo «Paper trading de bots» (`botlab-paper.yml`) lo avanza cada hora aunque no tengas la app abierta.

## Avisos con la app cerrada (notificaciones push)
En **Alertas → En tu celular → Avisos con la app cerrada**. El Worker de Cloudflare `vortex-push` (`worker/push-alerts.mjs`) revisa cada minuto tus **alertas de precio** y los **movimientos bruscos** del top 5, y manda una notificación Web Push aunque VORTEX esté cerrada. Las alertas con indicador siguen revisándose solo con la app abierta.

- Gratis: plan gratuito de Workers + KV (`vortex-push`). Solo escribe en el KV cuando algo cambia.
- Las claves VAPID se crean solas la primera vez y viven en el KV; no hay secretos que configurar en la app.
- Si la alerta se cumple con la app abierta y también en el servidor, la notificación lleva la misma etiqueta y no se duplica.
- Al abrir la app, las alertas que disparó el servidor se marcan como disparadas.

Publicación (una sola vez):
1. Cloudflare → My Profile → API Tokens → Create Token → plantilla **Edit Cloudflare Workers** → crear y copiar.
2. GitHub → Settings → Secrets and variables → Actions → New repository secret: `CLOUDFLARE_API_TOKEN` = el token.
3. GitHub → Actions → «Publicar servidor de avisos (vortex-push)» → Run workflow. Se vuelve a publicar solo cuando cambia `worker/push-alerts.mjs`.

Android: Chrome necesita permiso de notificaciones y conviene quitarle la optimización de batería. iPhone (iOS 16.4+): solo desde la app añadida a la pantalla de inicio.
