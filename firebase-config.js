/* Configuración pública de Firebase (no contiene secretos).
   1) Firebase Console → tu proyecto → Configuración → "Tus apps" → app web → copia el objeto firebaseConfig aquí.
   2) Authentication → Método de acceso → activa Google. Authentication → Configuración → Dominios autorizados → añade soobroon-beep.github.io
   3) Firestore Database → crea la base y pega las reglas de firestore.rules.
   Mientras esto sea null, la app funciona igual, guardando todo solo en el dispositivo. */
window.CCT_FIREBASE = null;
/* Ejemplo:
window.CCT_FIREBASE = {
  apiKey: "AIza...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  appId: "1:1234567890:web:abcdef"
};
*/
