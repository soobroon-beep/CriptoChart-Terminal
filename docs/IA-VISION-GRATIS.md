# Visión local gratuita en Vortex (IA)

**Objetivo:** que «Analizar gráfico con IA» examine el lienzo real del gráfico, incluidos los dibujos y los indicadores visibles, sin contratar una API ni exponer credenciales.

## Cómo funciona

Al pulsar «Analizar gráfico con IA», Vortex analiza **el rango visible del precio** (zoom/desplazamiento), los indicadores realmente activos, sus valores, el volumen, el POC si hay perfil visible y las posiciones, líneas o zonas dibujadas. Captura además **priceCanvas**, un solo lienzo que contiene las velas, paneles de indicadores, volumen y dibujos. El PNG se ofrece a un **Web Worker local** para observaciones complementarias. **El modelo visual NO sustituye los cálculos basados en las velas**: si su descripción es genérica, está repetida, cambia de idioma, introduce indicadores ocultos o contradice datos verificables, se descarta y queda la lectura en español respaldada por datos.

- **SmolVLM-256M-Instruct (predeterminado)** — pesos abiertos Apache-2.0, ejecución local mediante Transformers.js v4.3.2, WebGPU o CPU/WASM; primera descarga normalmente de cientos de MB.
- **Qwen3-VL-2B-Instruct (opcional)** — modelo multimodal abierto, mayor consumo de RAM/VRAM y descarga; exige WebGPU. No se activa automáticamente.
- **Solo datos (desactivado)** — mantiene el resumen basado en velas, señales y dibujos ya registrados, sin descargar modelos.

La selección está en **IA → engranaje → Visión gratis para analizar el gráfico**. La primera descarga de cada modelo puede ser grande; las cargas siguientes pueden reutilizar la caché del navegador. No necesita clave de Anthropic, Qwen ni DeepSeek. El modo Briefing, laboratorio e indicadores existentes no dependen de esta función.


## Preguntas sobre long, short y el gráfico

El chat de IA admite preguntas como «¿Es buena zona para entrar en long o short?», «¿Dónde están los soportes?», «¿Cómo ves la EMA?», «¿Qué dice el volumen?» y «¿Qué marcan mis indicadores?».

- Se respetan las velas y los indicadores **del tramo mostrado**. Si el usuario desplaza el gráfico hacia velas antiguas, se identifica como tramo histórico y no como precio actual.
- Los soportes y resistencias son **niveles observados** de pivotes locales, líneas y rectángulos guardados, zonas Nova activas y POC visible. No son garantías ni señales de operación.
- Para preguntas long/short se explican posibilidades condicionadas, confirmaciones por esperar y riesgos; **no hay ejecución de órdenes ni instrucciones infalibles**.
- El análisis de volumen compara la última vela (puede estar formándose) con el promedio visible y, si hay perfil, sitúa el precio respecto al POC.
- Una EMA, Bollinger, RSI o MACD oculto **no se introduce** en el análisis, aunque sus series puedan existir internamente.
- Si la captura no puede interpretarse, el análisis por datos **sigue funcionando** y no hace falta descargar un modelo para obtener un resumen.

**Limitación del modelo pequeño:** SmolVLM-256M está orientado principalmente al inglés. No se le puede obligar a comprender siempre gráficos financieros complejos ni a responder en español con calidad; por eso sus resultados son solo observaciones auxiliares y están sujetos a validación. Qwen3-VL es una alternativa más capaz, pero no es apta para todos los equipos.

## Privacidad y limitaciones

- El PNG no se envía a un proveedor de inferencia remoto por esta ruta. **Sí** se descarga la librería desde jsDelivr y los pesos del modelo desde Hugging Face; son proveedores externos de distribución.
- No hay garantía de funcionamiento en todos los navegadores, móviles ni GPUs. Puede fallar por memoria, compatibilidad o descarga.
- No hay coste por token, pero el usuario aporta recursos de cómputo, batería y descarga de datos. Las condiciones de alojamiento externo y su disponibilidad pueden cambiar; no se promete «gratis para siempre» para ningún CDN.
- Los modelos pequeños pueden equivocarse al leer textos o formas y **no son asesoría financiera**. La app intenta excluir referencias a MACD, RSI y Bollinger que no estén activos.
- En caso de fallo, el gráfico no se modifica y Vortex ofrece su resumen Local habitual.
- La integración del modelo en navegadores físicos y teléfonos **requiere todavía pruebas funcionales**; la comprobación estática y las pruebas con Web Workers simulados no sustituyen una prueba con GPU.

## Dependencias y licencias

- SmolVLM: https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct
- Qwen3-VL: https://huggingface.co/onnx-community/Qwen3-VL-2B-Instruct-ONNX
- Transformers.js 4.3.2 (Apache-2.0): https://github.com/huggingface/transformers.js
- Fuente de ejemplo técnico: https://github.com/pranavchokda/RunInBrowser

## Validación

`node --test tests/ai-vision.test.js tests/ai-chart.test.js`

El respaldo anterior a modificaciones de IA queda en `vortex-respaldo-antes-publicar-ia-2026-11-06`. No se modifica.
