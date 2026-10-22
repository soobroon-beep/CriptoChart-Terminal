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

- **Configuración como en TradingView:** el ⚙ de cada script abre una ventana con tres pestañas. **Entradas de datos** respeta lo que escribió el autor en el código: secciones por `group`, controles en la misma fila por `inline`, ayudas ⓘ por `tooltip`, listas por `options`, casillas, colores con opacidad y fechas. **Estilo**: mostrar/ocultar y cambiar color y grosor de cada línea (si el color lo decide el script según condiciones se avisa «color dinámico»), líneas horizontales, y mostrar u ocultar etiquetas, líneas, cajas, tablas y formas. **Visibilidad**: en qué temporalidades se muestra (minutos, horas, días, semanas, meses, con rango). «Por defecto» restablece todo. Cambiar entradas recalcula el script; estilo y visibilidad no. Los scripts pesados se recalculan con menos frecuencia.
- **Cómo funciona:** `pine.js` es un intérprete propio (lexer + parser + evaluador barra a barra). **No usa `eval` ni `Function`**: el código pegado nunca se ejecuta como JavaScript. Corre en un Web Worker con tiempo límite (si no hay Worker, en línea con el mismo límite). `pine-draw.js` dibuja el resultado en el canvas. Solo análisis: no hay órdenes ni claves.
- **Soportado (v5, y sintaxis antigua v4 básica):** `var`/`varip`, `:=`, `if`/`for`/`while`/`switch` (también como expresión), funciones propias, tuplas, historial `x[n]`, `input.*` (editables), `ta.*` (sma, ema, rma, wma, vwma, hma, swma, rsi, macd, stoch, atr, tr, bb, bbw, kc, kcw, cci, mfi, wpr, change, mom, roc, highest/lowest(+bars), crossover/under, cross, pivothigh/low, barssince, valuewhen, cum, stdev, variance, dev, median, linreg, rising, falling, percentrank, supertrend, dmi, vwap, obv), `math.*`, `str.*`, `array.*`, `color.*`, `plot` (línea, escalón, histograma, columnas, área, círculos, cruces), `hline`, `fill`, `bgcolor`, `barcolor`, `plotshape`, `plotchar`, `plotarrow`, `label.*`, `line.*`, `box.*`, `timeframe.*`, `syminfo.*`, `barstate.*`. Lista exacta: `CCTPine.supported()`.
- **También soportado:** `type` con campos y `.new()`, `method` (también llamados como función), `enum` (con `input.enum`), `map.*`, `matrix.*` (new/get/set/filas/columnas/transpose/mult/sum/diff/det/avg/max/min…), `request.security` a otros símbolos/temporalidades de Binance (la app descarga las velas y repite la corrida; `3M` y `12M` se arman con velas mensuales; respeta `lookahead`; `ticker.heikinashi()` calcula Heikin Ashi), `time(tf, sesión, zona)` con sesiones y zonas horarias, `table.*` (anclada a una esquina), `polyline.*`, `chart.point.*`, `linefill.*`, `plotcandle`/`plotbar`, `label/line/box.copy` y todos los setters habituales, `ta.sar/tsi/cmo/cog/alma/correlation/range/mode/percentile_*`, `str.format_time/pos/repeat`, formatos de `str.tostring` (`format.mintick/percent/volume`, patrones `#.##`, `0.000`, `#,###.0`, `%`), `timestamp()`, `int()/float()/bool()/string()/color()`, textos multilínea y sentencias separadas por coma.
- **Reparación automática (se avisa siempre, en «🔧 Reparado automáticamente»):** comillas tipográficas, espacios no separables y caracteres invisibles; números de línea pegados con el código; CRLF/BOM/tabuladores; sintaxis antigua v1–v4 (`study`, `sma()` sin `ta.`, `security()`, `iff`, `transp=`, colores sueltos como `blue`, `input(type=input.integer)`, `tickerid`, `n`…); `input(close)` como origen de datos. Si algo no se puede arreglar, el error indica la línea y el texto.
- **Corpus de pruebas:** `tests/corpus/*.pine` son indicadores de uso general (Ichimoku, RSI con divergencias, Bollinger, Squeeze, ADX, pivotes, Fibonacci, tablas MTF, estrategias, v3/v4…). `tests/corpus.test.js` exige que todos corran sin partes sin soporte, sin plots vacíos y con el mismo resultado pegados con CRLF, BOM o tabuladores.
- **No soportado todavía (se avisa con su línea, nunca en silencio):** `import` y `library` (no hay acceso a bibliotecas publicadas), `request.financial/economic/earnings/dividends/splits…`, `ticker.renko/kagi/…`, símbolos que no sean de Binance Spot, órdenes de `strategy.*` (se ignoran; el backtesting es la Fase 7), alertas (se ignoran). Un script con partes sin soporte se marca «⚠ resultado puede diferir de TradingView».
- **Equivalencia con TradingView:** no se promete. Las pruebas (`tests/pine.test.js`) comprueban valores derivados a mano y contra implementaciones independientes (RSI de Wilder, ATR, MACD, Supertrend), pero no se ha comparado contra TradingView con datos reales. Suposiciones: `ta.ema` se siembra con la primera fuente (referencia de Pine); empates cuentan como pivote; horas en UTC; el color por defecto de `plot` es #2962FF.
- **Overlay:** un script con `overlay=true` solo ajusta la escala del precio con los plots cuya escala se parece a la del precio; los demás quedan fuera de vista (se avisa en la leyenda). Con `overlay=false` tiene su panel.

## Indicador Nova Nexus (port del script de Pine)

> **Un solo Nova Nexus.** Desde la versión actual solo existe el completo (Pine, en **Indicadores → Mis indicadores**, llamado simplemente «Nova Nexus»). El módulo nativo antiguo ya no aparece en la lista ni en la leyenda: si lo tenías encendido, tu estado se migra solo al completo. Lo que sigue describe ese módulo nativo antiguo (código conservado en `nova-nexus.js`).

En **Indicadores → Mis indicadores** aparecía **Nova Nexus como un solo indicador**, con vista previa, un interruptor general y «⚙ Configurar», donde se eligen los módulos (agrupados en Señales, Tendencia y bandas, Estructura y niveles, Liquidez y volumen) y hay «Activar todos / Desactivar todos». Al apagarlo se recuerda la selección y al encenderlo se restaura. El ⚙ abre la misma ventana de configuración de los scripts, con los parámetros que el indicador ya permite cambiar (periodos y multiplicadores de EMA Cloud, Smooth Trail, Pivots, Reversal Bands, estructura SMC, Order Blocks, Volume Profile, Liquidaciones, Soporte y Resistencia, TP/SL, score, cooldown, reglas); los demás siguen fijos en los valores del Pine. Para tener TODOS los parámetros del Pine original, se pega su código en «Scripts de Pine». La vista previa es una ilustración, no un render del gráfico real. Los módulos, que se dibujan directamente en el gráfico (móvil y escritorio):

- **Señales IA** (BUY/SELL con score ⭐, cooldown y divergencias), **EMA Cloud**, **TP / SL** y panel de **Reglas**.
- **Liquidaciones**: niveles 5x/10x/25x/50x/100x que nacen en cada pivote (3 velas a cada lado; 2 en 1d/1w/1M) solo si el volumen pasa el filtro de ese apalancamiento, y se alargan hasta que una vela los cruza. Incluye la tabla «Active Liquidation Levels» y el tinte tenue antes del 2023-01-01. Suposición: la fecha de inicio del Pine (`timestamp("2023-01-01")`) se toma como UTC. El `barcolor` lima del Pine, que pinta todas las velas, va aparte como opción **«Liquidaciones: velas lima»** (apagada por defecto).
- **Pivots** (longitud 50, estilo LuxAlgo): zigzag entre pivotes, pivotes «perdidos» discontinuos, niveles fantasma y la proyección de la última barra. Las etiquetas del Pine original están anuladas en el script, por eso aquí tampoco hay.
- **Soporte y Resistencia** (port de *Breaks and Retests [HG]* © HoanGhetti, MPL 2.0): cajas por pivote de 20 velas, etiquetas Break / Potential Retest / Retest. Usa el modo «Repainting: On» del Pine; sin alertas.
- **Smooth Trail** (EMA 30 ± 2 ATR(20), suavizado 2) y **Reversal Bands** (SMA 70 ± 6/7/8 ATR(70)): cálculos en `indicators.js`, con pruebas.
- **Volume Profile** (estilo LuxAlgo, tema Default): 25 filas sobre las últimas 200 velas, volumen repartido por fila con polaridad alcista/bajista (cierre > apertura), nodos de volumen alto (53 %) y bajo (37 %) y POC «Last (Zone)». *Desviación de diseño*: el Pine lo dibuja a la derecha de la última vela con un desplazamiento en barras, inservible en móvil; aquí se reserva un margen en píxeles dentro del gráfico (≈40 %, entre 110 y 300 px) solo mientras el módulo está encendido, y el texto de cada fila solo aparece si cabe. No portado (opciones no predeterminadas): fuente Money Flow, Heatmap, POC en desarrollo, zonas de consolidación, zona de mayor sentimiento, niveles de precio, fondo del rango, método de polaridad 2 y otros temas.
- **Estructura SMC**: BOS / CHoCH con barridos (`x`), swing de longitud 5, ventana de las últimas 500 velas.
- **Order Blocks**: volumétricos, con actividad de compra/venta y % de volumen (últimos 5).

Los módulos SMC están apagados por defecto. Los perfiles Mobile/Cloud/SMC del Pine todavía no existen aquí. Los parámetros de cada módulo están fijos en los valores por defecto del Pine y se usa el tema Default.

### Estilo completo (como TradingView)
La pestaña **Estilo** de cada indicador permite cambiar, por elemento: visibilidad, color y opacidad (también sustituir colores dinámicos), tipo de gráfico (línea, escalón, histograma, columnas, área, círculos, cruces), estilo de línea, grosor, rellenos, líneas horizontales, formas (color, texto, tamaño), fondo/velas coloreadas, y la precisión/valores de la leyenda.

### Alertas de precio (móvil: pestaña Alertas · escritorio: panel derecho)
Alertas "≥ / ≤" por activo con nota opcional. Se revisan con el WebSocket del gráfico y con sondeo cada 10 s mientras la app está abierta; al dispararse avisan con mensaje, sonido, vibración y notificación del sistema (si lo permites), y pasan a "Disparadas" (se pueden reactivar). Se guardan por dispositivo/cuenta. Solo análisis: no ejecutan órdenes. Aún no hay alertas desde indicadores Pine (`alertcondition` se ignora con aviso).

### Alertas con indicadores
Botón **ƒx Crear alerta con indicador** (pestaña Alertas). Fuentes: indicadores comunes (cruces EMA/precio, RSI con nivel, MACD, ruptura de Bollinger, cambio de Supertrend), señales de Nova Nexus (compra/venta, puntuación mínima) y **cualquier script Pine**: sus `alertcondition(...)` y `alert(...)` (con su mensaje), sus formas/señales (`plotshape`…) y cruces entre cualquiera de sus líneas, el precio o un nivel fijo. Se evalúan **al cierre de cada vela** (sin repintado) para el activo y temporalidad elegidos, aunque no estén en el gráfico; "una vez" o "cada vez". Solo mientras la app está abierta; no ejecutan órdenes.

### Backtesting de estrategias (`strategy.*`)
Los scripts declarados con `strategy(...)` ahora se simulan: `strategy.entry/order/close/close_all/exit/cancel` (con `limit`, `stop`, `profit`/`loss` en ticks, trailing `trail_points/trail_offset`, `when=` de sintaxis antigua), `pyramiding`, tamaño (contratos / efectivo / % del capital), comisión (porcentaje / por orden / por contrato), deslizamiento, `process_orders_on_close`, y variables `strategy.position_size`, `equity`, `netprofit`, `closedtrades`, `closedtrades.profit(i)`, etc. Botón **📊** en el script → **Informe** (resumen con curva de capital, operaciones, supuestos); las entradas/salidas se marcan en el gráfico.
Reglas de simulación: mercado → apertura de la vela siguiente; límites/stops dentro de la vela con la ruta O→H→L→C (u O→L→H→C si el mínimo queda más cerca de la apertura); trailing aproximado; sin margen/liquidaciones ni `calc_on_every_tick`. Es histórico con las velas cargadas: **no garantiza resultados futuros ni coincide exactamente con TradingView**.

**Informe de backtest — activo, temporalidad y período:** en el informe se puede elegir otro activo, otra temporalidad y 500 / 1000 / 3000 / 5000 / 10 000 velas (se descargan de Binance por tramos) y pulsar *Recalcular*; no cambia el gráfico. Exportación a CSV de las operaciones y de la curva de capital. Resultados reproducibles (mismo script + datos + ajustes → mismo informe). Las reglas de entrada/salida se escriben en Pine (`strategy.*`, con stop/take-profit); aún no hay un constructor visual de reglas.

### Sincronización entre dispositivos (cuenta de Google)
Con la sesión iniciada, el seguimiento, los indicadores activos y sus ajustes (entradas, estilo, visibilidad), Nova Nexus, dibujos, temas y alertas viajan en un documento de Firestore, y los scripts Pine guardados en otro; los cambios se reciben en vivo en el otro dispositivo. Los scripts guardados antes de iniciar sesión se suben a la cuenta la primera vez. El estado de la cuenta muestra cuántos scripts/alertas hay sincronizados y, si Firestore no está listo, qué revisar en Firebase Console. `tests/e2e/sync-two-devices.js` simula dos dispositivos con un Firestore falso (requiere `playwright-core` y Chromium).

### Paneles de los indicadores Pine
Cada script Pine tiene un selector **Panel** (en *Mis indicadores*): automático (según el script), **sobre el gráfico**, **arriba** o **abajo** (panel propio con su escala). Se guarda por script y se sincroniza con la cuenta. Los indicadores comunes (RSI, MACD, etc.) siguen en sus paneles inferiores.

### Ancho de los paneles laterales (escritorio)
Arrastra el borde entre *Seguimiento* y el gráfico, o entre el gráfico y *Indicadores/Alertas/Ajustes*, para ensanchar o estrechar los paneles; doble clic (o el botón ‹ ›) los oculta/muestra para dar todo el ancho al gráfico. Se recuerda en este dispositivo.

## Catálogo, estrategias de Nova y leyenda del gráfico
- **Mis indicadores** incluye Nova Nexus, Nova Oscillator 1.1 y Nova Screener 40 Cryptos (códigos Pine originales en `catalog/`, empaquetados con `node tools-gen-catalog.js` → `catalog.js`). El Screener se añade con 40 pares de Binance en sus entradas (cámbialos en ⚙); calcula 40 símbolos y puede tardar varios segundos.
- La corrida de `request.security` ahora recorta el script a lo que dependen sus argumentos (más rápido con muchos símbolos).
- Estrategias Mobile / Cloud / SMC: ahora se eligen en las entradas del Nova Nexus completo (⚙ → grupo «ESTRATEGIAS»).
- Leyenda sobre el gráfico: junto a cada indicador, 👁 ocultar/mostrar (Pine) o apagar (nativos), ⚙ ajustes, ⇅ mover (sobre el gráfico / panel arriba / panel abajo, solo Pine) y ✕ quitar. Botones ▤− / ▤+ de la barra del gráfico cambian la altura de los paneles (se recuerda).

## Paneles redimensionables y aspecto del gráfico
- Cada panel (volumen, RSI, MACD…, paneles de Pine) tiene un **asa en su borde** (una pastilla gris): arrástrala con el dedo o el ratón para agrandar o achicar ese panel; doble toque/clic = altura automática. Las alturas se recuerdan en el dispositivo. ▤− / ▤+ siguen escalando los paneles automáticos.
- **🎨 Aspecto** (barra del gráfico): color de fondo, líneas horizontales/verticales (y su color), colores de cuerpo, borde y mecha de velas alcistas/bajistas, velas alcistas huecas y «restablecer». Se guarda en el estado (también se sincroniza con tu cuenta).

## Ajustes por indicador desde la leyenda
- El ⚙ junto al nombre de cada indicador abre **solo la configuración de ese indicador** (sin abrir la lista): parámetros y color en EMA/SMA/WMA, Bollinger, RSI, MACD, Estocástico, ATR, Supertrend, VWAP y OBV; Nova Nexus y los scripts de Pine abren su propia ventana. También hay ⚙ en cada fila de «Comunes». Las alertas con indicadores estándar siguen usando los valores clásicos.
- Si un script Pine falla por tiempo, se reintenta una vez solo; en «Mis indicadores» la tarjeta muestra el error y un botón «↻ Reintentar».

## Catálogo integrado, colores y panel derecho
- **Nova Nexus, Nova Oscillator y Nova Screener viven en la página** (`catalog/` → `catalog.js`): aparecen en Indicadores → Mis indicadores sin subir nada y **no se guardan en tu cuenta** (ya no sale «el script no quedó guardado»). Las copias que habías pegado antes se reemplazan solas por las integradas conservando tus ajustes.
- El panel derecho ya no lleva indicadores: ahora son **Noticias** e **IA** (próximamente), Alertas y Ajustes. Los indicadores se abren con el botón «ƒx Indicadores» sobre el gráfico.
- ⚙ de indicadores nativos: color **y opacidad**, grosor y estilo de línea (EMA/SMA/WMA/Bollinger/VWAP), relleno de Bollinger, niveles del RSI y del Estocástico, colores de MACD y Supertrend, colores del volumen. Nova Nexus nativo: sección «🎨 Colores y opacidad» (EMA Cloud, Smooth Trail, Reversal Bands, Soporte/Resistencia, Volume Profile).
- El convertidor de Pine muestra siempre **todas** las entradas del script (p. ej. 233 en el Nova Nexus) y la pestaña Estilo con tipo, grosor, color y opacidad de cada línea, relleno, forma y objeto.

## Arreglos de la leyenda de indicadores y del oscilador (oct 2026)
- **Botones de la leyenda (👁 ⚙ ⇅ ✕) no respondían.** El gesto del gráfico capturaba el puntero al pulsar sobre ellos, así que el `click` nunca llegaba al botón; ahora el gráfico ignora los toques sobre `.leg-row`. Además los botones quedan por encima de las barras de arrastre de los paneles (antes la barra los tapaba en Volumen, RSI y los Pine de panel propio) y la leyenda ya no se recrea en cada tick de precio, para que un clic en curso no pierda su botón.
- **Leyenda más grande:** nombre del indicador a 13 px y botones de 22 px en escritorio (26 px en móvil), con más separación entre filas.
- **El Nova Oscillator «no se podía agregar».** Sí se agregaba y calculaba, pero con varios paneles activos (Volumen, RSI, MACD, Estocástico, ATR, la tabla del Screener) el cálculo de alturas le daba a cada panel un mínimo fijo de 56 px y el último —el oscilador— quedaba fuera del lienzo. Ahora todos los paneles se ajustan para caber (mínimo 36 px, o 24 px si hay muchísimos) y la tabla del Screener pesa menos cuando hay muchos paneles. El script `catalog/nova-oscillator.pine` es el mismo que enviaste (probado con 30–5000 velas y de 1m a 1w sin errores).
