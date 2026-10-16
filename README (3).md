# CryptoChart Terminal — archivos recuperados (16 de octubre de 2026)

Este paquete contiene **únicamente archivos efectivamente recuperados** de la Biblioteca. **No es un export del código fuente completo** de la aplicación principal React/TypeScript.

## Qué hay en el ZIP

- `index.html`: archivo original recuperado. Redirige a la aplicación publicada en https://cripto-chart-terminal.greenbream32.chatgpt.site/ . **No contiene el motor de la aplicación.**
- `archivo-original/index.html`: copia de respaldo del mismo archivo.
- `prototipo-movil/index.html`, `style.css`, `app.js`, `README.md`: código del prototipo móvil recuperado. Es una implementación separada y **no está integrado** en la aplicación React original.

## Publicar en GitHub Pages

### A. Mantener el acceso a la aplicación actual
Sube el `index.html` de la raíz del paquete a la raíz del repositorio. En GitHub entra en **Settings > Pages > Build and deployment**, elige `Deploy from a branch`, rama `main`, carpeta `/ (root)`, guarda. La URL de Pages redirigirá al sitio de la app original, mientras ese sitio siga activo. **Esto no hospeda de forma autónoma la aplicación original.**

### B. Probar el prototipo móvil (sin afectar a la app original)
Puedes abrir la carpeta `prototipo-movil` en GitHub Pages bajo `/prototipo-movil/`, si publicas este ZIP descomprimido. Tiene su propio `index.html` y recursos. Es solo una prueba independiente, no la versión móvil integrada solicitada.

## Falta recuperar

Código fuente principal React/TypeScript/Vite, archivos de configuración originales (`package.json`, `vite.config.*`, etc.), módulos de indicadores/dibujos/Pine, lógica original de alertas, frontend de escritorio y cualquier backend de Fase 5. Los documentos, pruebas y el repositorio originales no se recuperaron en este paquete. No se garantiza continuidad funcional desde GitHub si el sitio externo deja de existir.

## Seguridad y datos

El prototipo móvil consulta la API pública de Binance Spot, puede sufrir restricciones regionales y no ejecuta órdenes. No se adjuntan claves secretas.
