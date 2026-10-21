// Genera catalog.js a partir de catalog/*.pine (node tools-gen-catalog.js)
const fs = require('fs');
const items = [
  {id: 'nova-osc', file: 'nova-oscillator.pine', name: 'Nova Oscillator 1.1', desc: 'Oscilador Flux + Momentum, medidores, squeeze, divergencias, cinta de fuerza y tabla institucional'},
  {id: 'nova-scr', file: 'nova-screener.pine', name: 'Nova Screener 40 Cryptos', desc: 'Tabla de 40 criptos con señal, score y persistencia (se rellena con 40 pares de Binance; cámbialos en ⚙)'}
].map(x => Object.assign({}, x, {code: fs.readFileSync(__dirname + '/catalog/' + x.file, 'utf8').replace(/\r\n?/g, '\n')}));
fs.writeFileSync(__dirname + '/catalog.js', '/* Generado por tools-gen-catalog.js: no editar a mano */\n(function (root) { root.CCTCatalog = ' + JSON.stringify(items.map(({file, ...r}) => r)) + '; })(typeof self !== \'undefined\' ? self : this);\n');
