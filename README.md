# CryptoChart Terminal — versión móvil

## Inicio
Abre `index.html` desde un servidor estático HTTPS (por ejemplo, GitHub Pages). No hay compilación ni dependencias: solo `index.html`, `style.css` y `app.js`.

En computadora (ventana de 1024 px o más) se muestran tres columnas a la vez: seguimiento a la izquierda, gráfico grande al centro e Indicadores/Ajustes a la derecha (pestañas arriba). En celular y ventanas estrechas se mantiene la versión móvil con pestañas abajo.

## Pestañas (celular)
1. **Seguimiento**: tu lista de criptomonedas (precio y variación 24 h de Binance Spot), con búsqueda, añadir, editar (subir/quitar) y destello al cambiar el precio.
2. **Gráfico**: velas a pantalla casi completa, **arrastra la barra derecha** para agrandar o achicar el gráfico en vertical (arriba = más grande; botón **A** o doble toque = escala automática) y **la barra inferior** para hacer zoom en el tiempo, temporalidades 1m–1M, datos en vivo por WebSocket, pellizco para zoom, arrastre para desplazar, mantener pulsado para retícula con OHLC, doble toque para ajustar y modo expandido.
3. **Indicadores**: EMA 20/50, SMA 200, WMA 20, VWAP, Bandas de Bollinger, Supertrend (10, 3), cruces EMA 20/50, Volumen y, en paneles inferiores, RSI 14, MACD (12, 26, 9), Estocástico (14, 3, 3), ATR 14 y OBV (también desde el botón del gráfico). Los cálculos viven en `indicators.js` y se verifican con `node --test tests/indicators.test.js`.
4. **Ajustes**: tema, exportar/importar configuración JSON.

## Dibujos
Línea de tendencia, rayo, horizontal, vertical, rectángulo, canal paralelo, flecha, texto, medición, retroceso y extensión de Fibonacci, marcador de máximo/mínimo y posiciones Long/Short. Arrastra o toca dos puntos (tres en canal y extensión de Fibonacci); toca un dibujo para seleccionarlo, mueve sus puntos o bórralo; deshacer. Se guardan por activo en este dispositivo y siguen en su sitio al cambiar de temporalidad.

## Limitaciones
Los parámetros de los indicadores (periodos, colores) son fijos por ahora; solo se activan o desactivan. El VWAP reinicia cada día UTC y por eso no se muestra en 1d, 1w ni 1M. Long/Short usan stop espejo a 2:1 (no editable todavía). Todavía no incluye el intérprete Pine ni las alertas. Las APIs de Binance pueden estar restringidas por región; si fallan se muestra un aviso, nunca datos simulados. No ejecuta órdenes.

## Inicio de sesión con Google (guardado por persona)
La versión móvil puede guardar el seguimiento, los indicadores, la temporalidad, el tema y los dibujos en la cuenta de Google de cada persona (Firebase Auth + Firestore), y sincronizarlos en tiempo real entre dispositivos. Cada persona solo ve sus propios datos. Al cerrar sesión, los datos de la cuenta dejan de verse en ese dispositivo.

Hasta que se configure Firebase, la app funciona igual y guarda todo solo en el dispositivo. Para activarlo (una sola vez):
1. En [Firebase Console](https://console.firebase.google.com) crea un proyecto (o usa uno existente) y añade una **app web**.
2. **Authentication → Método de acceso:** activa **Google**. En **Configuración → Dominios autorizados** añade `soobroon-beep.github.io`.
3. **Firestore Database:** crea la base y pega las reglas de `firestore.rules`.
4. Copia el objeto `firebaseConfig` de la app web dentro de `firebase-config.js` (son claves públicas, no secretos) y sube el cambio.

## Indicador Nova Nexus (port del script de Pine)

En **Indicadores** hay interruptores para cada módulo, que se dibujan directamente en el gráfico (móvil y escritorio):

- **Señales IA** (BUY/SELL con score ⭐, cooldown y divergencias), **EMA Cloud**, **TP / SL** y panel de **Reglas**.
- **Estructura SMC**: BOS / CHoCH con barridos (`x`), swing de longitud 5, ventana de las últimas 500 velas.
- **Order Blocks**: volumétricos, con actividad de compra/venta y % de volumen (últimos 5).

Los módulos SMC están apagados por defecto. Pendientes de portar: Pivots, Smooth Trail, Reversal Bands, Volume Profile, Soporte/Resistencia y Liquidaciones.
