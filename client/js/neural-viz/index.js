/**
 * neural-viz/index.js
 *
 * Final assembly: promotes window._NVR (set by renderer.js, patched by
 * data-layer.js) to the public NeuralViz global and removes the temp symbol.
 *
 * Load order: renderer.js → data-layer.js → index.js
 */
const NeuralViz = window._NVR;
delete window._NVR;
