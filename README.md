# CryptoChart Terminal — versión móvil independiente

## Inicio
Abre `index.html` desde un servidor estático HTTPS (por ejemplo, GitHub Pages). No hay compilación ni dependencias. Sube los tres archivos `index.html`, `style.css` y `app.js` a la raíz del repositorio.

## Incluye
- Cuatro pestañas para móvil: Seguimiento, Gráfico, Indicadores y Ajustes.
- Watchlist editable, búsqueda, BTC, ETH, SOL y más símbolos, datos de precios Binance Spot cada 30 s.
- Gráfico de velas Canvas de altura flexible, navegación táctil horizontal, zoom, temporalidades de 1m a 1M y modo expandido.
- Indicadores EMA 20/50, SMA 200, Bandas de Bollinger, RSI 14 y Volumen; valores calculados sobre las velas recibidas.
- Dibujos sencillos: línea y horizontal (de sesión). Persistencia local para watchlist, tema, temporalidad y selección de indicadores.
- Importación/exportación JSON de configuración.

## Limitaciones
Esta versión NO ha modificado el código fuente original React/TypeScript de la aplicación publicada: el `index.html` antiguo encontrado en Biblioteca solo redirige al sitio, y el repositorio completo no estaba disponible. Para integrar este diseño preservando el editor/intérprete Pine, dibujos, alertas, plantillas y demás capacidades previas, se requiere ese código base. Los dibujos de este prototipo no se guardan tras recargar; no hay ejecución automática de órdenes. Las APIs de Binance pueden estar restringidas por región/red; cuando fallan se muestra un error, nunca datos simulados.

No se incluye ni se afirma compatibilidad completa con TradingView; es una interfaz original inspirada en su organización móvil.
