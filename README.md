# CryptoChart Terminal — versión móvil

## Inicio
Abre `index.html` desde un servidor estático HTTPS (por ejemplo, GitHub Pages). No hay compilación ni dependencias: solo `index.html`, `style.css` y `app.js`.

En computadora, `index.html` abre la versión de escritorio; en celular se queda en esta versión móvil. Para forzar una u otra: `?movil` o `?escritorio` al final de la dirección.

## Pestañas
1. **Seguimiento**: tu lista de criptomonedas (precio y variación 24 h de Binance Spot), con búsqueda, añadir, editar (subir/quitar) y destello al cambiar el precio.
2. **Gráfico**: velas a pantalla casi completa, temporalidades 1m–1M, datos en vivo por WebSocket, pellizco para zoom, arrastre para desplazar, mantener pulsado para retícula con OHLC, doble toque para ajustar y modo expandido.
3. **Indicadores**: EMA 20/50, SMA 200, Bollinger, RSI 14 y Volumen (también desde el botón del gráfico).
4. **Ajustes**: tema, exportar/importar configuración JSON.

## Dibujos
Línea de tendencia, horizontal, rectángulo y Fibonacci. Arrastra o toca dos puntos; toca un dibujo para seleccionarlo, mueve sus puntos o bórralo; deshacer. Se guardan por activo en este dispositivo y siguen en su sitio al cambiar de temporalidad.

## Limitaciones
Todavía no incluye el intérprete Pine ni las alertas. Las APIs de Binance pueden estar restringidas por región; si fallan se muestra un aviso, nunca datos simulados. No ejecuta órdenes.

## Inicio de sesión con Google (guardado por persona)
La versión móvil puede guardar el seguimiento, los indicadores, la temporalidad, el tema y los dibujos en la cuenta de Google de cada persona (Firebase Auth + Firestore), y sincronizarlos en tiempo real entre dispositivos. Cada persona solo ve sus propios datos. Al cerrar sesión, los datos de la cuenta dejan de verse en ese dispositivo.

Hasta que se configure Firebase, la app funciona igual y guarda todo solo en el dispositivo. Para activarlo (una sola vez):
1. En [Firebase Console](https://console.firebase.google.com) crea un proyecto (o usa uno existente) y añade una **app web**.
2. **Authentication → Método de acceso:** activa **Google**. En **Configuración → Dominios autorizados** añade `soobroon-beep.github.io`.
3. **Firestore Database:** crea la base y pega las reglas de `firestore.rules`.
4. Copia el objeto `firebaseConfig` de la app web dentro de `firebase-config.js` (son claves públicas, no secretos) y sube el cambio.
