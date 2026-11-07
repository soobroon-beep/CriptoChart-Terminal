# Visión local gratuita en Vortex (IA)

**Objetivo:** que «Analizar gráfico con IA» examine el lienzo real del gráfico, incluidos los dibujos y los indicadores visibles, sin contratar una API ni exponer credenciales.

## Cómo funciona

Al pulsar «Analizar gráfico con IA», Vortex captura **priceCanvas**, el lienzo que utiliza para representar velas, paneles, indicadores y dibujos. El archivo PNG se pasa a un **Web Worker del mismo sitio**, donde un modelo multimodal abierto lo interpreta. La interfaz muestra el estado de la descarga y después una descripción breve del gráfico.

- **SmolVLM-256M-Instruct (predeterminado)** — pesos abiertos Apache-2.0, ejecución local mediante Transformers.js v4.3.2, WebGPU o CPU/WASM; primera descarga normalmente de cientos de MB.
- **Qwen3-VL-2B-Instruct (opcional)** — modelo multimodal abierto, mayor consumo de RAM/VRAM y descarga; exige WebGPU. No se activa automáticamente.
- **Solo datos (desactivado)** — mantiene el resumen basado en velas, señales y dibujos ya registrados, sin descargar modelos.

La selección está en **IA → engranaje → Visión gratis para analizar el gráfico**. La primera descarga de cada modelo puede ser grande; las cargas siguientes pueden reutilizar la caché del navegador. No necesita clave de Anthropic, Qwen ni DeepSeek. El modo Briefing, laboratorio e indicadores existentes no dependen de esta función.

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

`node --test tests/ai-vision.test.js`

El respaldo anterior a modificaciones de IA queda en `vortex-respaldo-antes-publicar-ia-2026-11-06`. No se modifica.
