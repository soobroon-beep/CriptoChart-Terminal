const test = require('node:test'), assert = require('node:assert');
const N = require('../news.js');
const now = Date.parse('2026-10-23T12:00:00Z');
const rss = `<rss><channel>
<item><title><![CDATA[Bitcoin se dispara tras decisión de la Fed]]></title><link>https://x.com/a</link><pubDate>Fri, 23 Oct 2026 11:30:00 GMT</pubDate><description>&lt;p&gt;El precio de BTC sube con la inflaci&oacute;n a la baja&lt;/p&gt;</description></item>
<item><title>Bitcoin hits new high as the Fed says rates will fall</title><link>https://x.com/b</link><pubDate>Fri, 23 Oct 2026 11:45:00 GMT</pubDate></item>
<item><title>Receta de pastel de chocolate para la familia</title><link>https://x.com/c</link><pubDate>Fri, 23 Oct 2026 11:00:00 GMT</pubDate></item>
<item><title>Wall Street cierra con alzas en el Nasdaq</title><link>https://x.com/d</link><pubDate>Fri, 23 Oct 2026 11:50:00 GMT</pubDate></item>
<item><title>Bitcoin antiguo del año pasado en el mercado</title><link>https://x.com/e</link><pubDate>Mon, 01 Jan 2024 11:00:00 GMT</pubDate></item>
</channel></rss>`;
test('parseFeed y entidades', () => {
  const r = N.parseFeed(rss); assert.equal(r.length, 5);
  assert.equal(r[0].title, 'Bitcoin se dispara tras decisión de la Fed'); assert.match(r[0].desc, /inflación/);
});
test('idioma', () => { assert.ok(N.looksSpanish('El precio de bitcoin sube en el mercado')); assert.ok(!N.looksSpanish('Bitcoin hits new high as the Fed says rates will fall')); });
test('buildItems filtra idioma, tema y antigüedad; mergeItems ordena nuevo→viejo', () => {
  const src = {id: 't', name: 'T', cat: null}, items = N.buildItems(N.parseFeed(rss), src, now);
  assert.deepEqual(items.map(i => i.link), ['https://x.com/a', 'https://x.com/d']);
  const m = N.mergeItems([items], now); assert.ok(m[0].t >= m[1].t); assert.equal(m[0].link, 'https://x.com/d');
  assert.equal(items[0].impact, 'alto');
});
test('dedupe entre fuentes', () => {
  const s = {id: 't', name: 'T', cat: 'cripto'}, a = N.buildItems(N.parseFeed(rss), s, now), b = N.buildItems(N.parseFeed(rss), {id: 'u', name: 'U', cat: 'cripto'}, now);
  assert.equal(N.mergeItems([a, b], now).length, a.length);
});
test('rss2json y relTime', () => {
  const r = N.parseRss2json({status: 'ok', items: [{title: 'Bitcoin sube en el mercado', link: 'https://x', pubDate: '2026-10-23 11:00:00', description: 'x'}]});
  assert.equal(r[0].t, Date.parse('2026-10-23T11:00:00Z')); assert.equal(N.relTime(now - 5 * 60e3, now), 'hace 5 min');
});
