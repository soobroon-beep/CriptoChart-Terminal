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

## Convertidor de Pine Script (pegar y ver en el gráfico)

En **Indicadores → Scripts de Pine → «Pegar / convertir Pine»** se pega el código de TradingView, se interpreta aquí y se dibuja en el gráfico. Cada script se guarda en «Mis scripts» (y en tu cuenta de Google) y se puede encender, apagar, quitar y ajustar (⚙ muestra sus `input.*` como formulario).

- **Cómo funciona:** `pine.js` es un intérprete propio (lexer + parser + evaluador barra a barra). **No usa `eval` ni `Function`**: el código pegado nunca se ejecuta como JavaScript. Corre en un Web Worker con tiempo límite (si no hay Worker, en línea con el mismo límite). `pine-draw.js` dibuja el resultado en el canvas. Solo análisis: no hay órdenes ni claves.
- **Soportado (v5, y sintaxis antigua v4 básica):** `var`/`varip`, `:=`, `if`/`for`/`while`/`switch` (también como expresión), funciones propias, tuplas, historial `x[n]`, `input.*` (editables), `ta.*` (sma, ema, rma, wma, vwma, hma, swma, rsi, macd, stoch, atr, tr, bb, bbw, kc, kcw, cci, mfi, wpr, change, mom, roc, highest/lowest(+bars), crossover/under, cross, pivothigh/low, barssince, valuewhen, cum, stdev, variance, dev, median, linreg, rising, falling, percentrank, supertrend, dmi, vwap, obv), `math.*`, `str.*`, `array.*`, `color.*`, `plot` (línea, escalón, histograma, columnas, área, círculos, cruces), `hline`, `fill`, `bgcolor`, `barcolor`, `plotshape`, `plotchar`, `plotarrow`, `label.*`, `line.*`, `box.*`, `timeframe.*`, `syminfo.*`, `barstate.*`. Lista exacta: `CCTPine.supported()`.
- **No soportado todavía (se avisa con su línea, nunca en silencio):** `request.security` con otro símbolo/temporalidad (devuelve `na`), `table.*`, `matrix.*`, `map.*`, `type`/`method`/`enum` y `import` (el script falla con mensaje claro), órdenes de `strategy.*` (se ignoran; el backtesting es la Fase 7), alertas (se ignoran). Un script con partes sin soporte se marca «⚠ resultado puede diferir de TradingView».
- **Equivalencia con TradingView:** no se promete. Las pruebas (`tests/pine.test.js`) comprueban valores derivados a mano y contra implementaciones independientes (RSI de Wilder, ATR, MACD, Supertrend), pero no se ha comparado contra TradingView con datos reales. Suposiciones: `ta.ema` se siembra con la primera fuente (referencia de Pine); empates cuentan como pivote; horas en UTC; el color por defecto de `plot` es #2962FF.
- **Overlay:** un script con `overlay=true` solo ajusta la escala del precio con los plots cuya escala se parece a la del precio; los demás quedan fuera de vista (se avisa en la leyenda). Con `overlay=false` tiene su panel.

## Indicador Nova Nexus (port del script de Pine)

En **Indicadores → Mis indicadores** aparece **Nova Nexus como un solo indicador**, con vista previa, un interruptor general y «⚙ Configurar», donde se eligen los módulos (agrupados en Señales, Tendencia y bandas, Estructura y niveles, Liquidez y volumen) y hay «Activar todos / Desactivar todos». Al apagarlo se recuerda la selección y al encenderlo se restaura. Los parámetros numéricos de cada módulo siguen fijos en los valores por defecto del Pine (aún no son editables). La vista previa es una ilustración, no un render del gráfico real. Los módulos, que se dibujan directamente en el gráfico (móvil y escritorio):

- **Señales IA** (BUY/SELL con score ⭐, cooldown y divergencias), **EMA Cloud**, **TP / SL** y panel de **Reglas**.
- **Liquidaciones**: niveles 5x/10x/25x/50x/100x que nacen en cada pivote (3 velas a cada lado; 2 en 1d/1w/1M) solo si el volumen pasa el filtro de ese apalancamiento, y se alargan hasta que una vela los cruza. Incluye la tabla «Active Liquidation Levels» y el tinte tenue antes del 2023-01-01. Suposición: la fecha de inicio del Pine (`timestamp("2023-01-01")`) se toma como UTC. El `barcolor` lima del Pine, que pinta todas las velas, va aparte como opción **«Liquidaciones: velas lima»** (apagada por defecto).
- **Pivots** (longitud 50, estilo LuxAlgo): zigzag entre pivotes, pivotes «perdidos» discontinuos, niveles fantasma y la proyección de la última barra. Las etiquetas del Pine original están anuladas en el script, por eso aquí tampoco hay.
- **Soporte y Resistencia** (port de *Breaks and Retests [HG]* © HoanGhetti, MPL 2.0): cajas por pivote de 20 velas, etiquetas Break / Potential Retest / Retest. Usa el modo «Repainting: On» del Pine; sin alertas.
- **Smooth Trail** (EMA 30 ± 2 ATR(20), suavizado 2) y **Reversal Bands** (SMA 70 ± 6/7/8 ATR(70)): cálculos en `indicators.js`, con pruebas.
- **Volume Profile** (estilo LuxAlgo, tema Default): 25 filas sobre las últimas 200 velas, volumen repartido por fila con polaridad alcista/bajista (cierre > apertura), nodos de volumen alto (53 %) y bajo (37 %) y POC «Last (Zone)». *Desviación de diseño*: el Pine lo dibuja a la derecha de la última vela con un desplazamiento en barras, inservible en móvil; aquí se reserva un margen en píxeles dentro del gráfico (≈40 %, entre 110 y 300 px) solo mientras el módulo está encendido, y el texto de cada fila solo aparece si cabe. No portado (opciones no predeterminadas): fuente Money Flow, Heatmap, POC en desarrollo, zonas de consolidación, zona de mayor sentimiento, niveles de precio, fondo del rango, método de polaridad 2 y otros temas.
- **Estructura SMC**: BOS / CHoCH con barridos (`x`), swing de longitud 5, ventana de las últimas 500 velas.
- **Order Blocks**: volumétricos, con actividad de compra/venta y % de volumen (últimos 5).

Los módulos SMC están apagados por defecto. Los perfiles Mobile/Cloud/SMC del Pine todavía no existen aquí. Los parámetros de cada módulo están fijos en los valores por defecto del Pine y se usa el tema Default.
