// La mezcla con la nube: la lista de seguimiento (orden de monedas/secciones, sección y color) más recientemente cambiada gana;
// lo que solo existe en el otro lado se conserva. Antes ganaba siempre el orden de la nube y el reorden recién arrastrado se deshacía.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const i = src.indexOf('function reconcile(local, remote)'); let d = 0, k = src.indexOf('{', i);
for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
const reconcile = eval('(' + src.slice(i, k + 1) + ')');
const g = (...ids) => ids.map(id => ({id, name: id}));
const local = {rev: 200, listRev: 200, symbols: ['BTC', 'ETH', 'SOL'], groups: g('c', 'a', 'b'), symGroup: {ETH: 'c', SOL: 'a'}, symColor: {BTC: '#ff9800'}, alerts: []};
const remote = {rev: 300, listRev: 100, symbols: ['BTC', 'ETH', 'SOL', 'XRP'], groups: g('a', 'b', 'c'), symGroup: {ETH: 'a', SOL: 'a', XRP: 'b'}, symColor: {XRP: '#f23645'}, alerts: []};
test('gana la lista cambiada más recientemente en este dispositivo', () => {
  const m = reconcile(local, remote);
  assert.deepEqual(m.groups.map(x => x.id), ['c', 'a', 'b']);
  assert.deepEqual(m.symGroup, {ETH: 'c', SOL: 'a', XRP: 'b'});
  assert.deepEqual(m.symColor, {BTC: '#ff9800', XRP: '#f23645'});
  assert.deepEqual(m.symbols, ['BTC', 'ETH', 'SOL', 'XRP']);
});
test('si la nube tiene la lista más nueva, manda la nube y se conserva lo local nuevo', () => {
  const m = reconcile({...local, listRev: 50, symbols: [...local.symbols, 'ADA']}, remote);
  assert.deepEqual(m.groups.map(x => x.id), ['a', 'b', 'c']);
  assert.deepEqual(m.symGroup.ETH, 'a');
  assert.ok(m.symbols.includes('ADA') && m.symbols.includes('XRP'));
});
