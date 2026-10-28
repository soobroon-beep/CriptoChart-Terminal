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
- `pwa-icons.js` selecciona un manifiesto estático antes de la instalación. Las once variantes tienen el mismo `id` y `scope` para identificar una sola app.
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
