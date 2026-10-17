# CryptoChart Terminal — versión móvil

## Inicio
Abre `index.html` desde un servidor estático HTTPS (por ejemplo, GitHub Pages). No hay compilación ni dependencias: solo `index.html`, `style.css` y `app.js`.
`app-original.html` conserva el acceso directo a la app publicada que antes era `index.html`.

## Pestañas
1. **Seguimiento**: tu lista de criptomonedas (precio y variación 24 h de Binance Spot), con búsqueda, añadir, editar (subir/quitar) y destello al cambiar el precio.
2. **Gráfico**: velas a pantalla casi completa, temporalidades 1m–1M, datos en vivo por WebSocket, pellizco para zoom, arrastre para desplazar, mantener pulsado para retícula con OHLC, doble toque para ajustar y modo expandido.
3. **Indicadores**: EMA 20/50, SMA 200, Bollinger, RSI 14 y Volumen (también desde el botón del gráfico).
4. **Ajustes**: tema, exportar/importar configuración JSON.

## Dibujos
Línea de tendencia, horizontal, rectángulo y Fibonacci. Arrastra o toca dos puntos; toca un dibujo para seleccionarlo, mueve sus puntos o bórralo; deshacer. Se guardan por activo en este dispositivo y siguen en su sitio al cambiar de temporalidad.

## Limitaciones
No incluye el código React/TypeScript original, ni el intérprete Pine ni las alertas. Las APIs de Binance pueden estar restringidas por región; si fallan se muestra un aviso, nunca datos simulados. No ejecuta órdenes.
