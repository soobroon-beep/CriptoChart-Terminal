// Descarga los feeds en español desde el servidor (sin CORS) y deja news-data.json junto a la app. Lo ejecuta .github/workflows/news.yml cada ~10 min.
const fs = require('fs'), N = require('../news.js');
(async () => {
  const now = Date.now(), lists = [], status = {};
  await Promise.all(N.SOURCES.map(async src => {
    try {
      const r = await fetch(src.url, {headers: {'user-agent': 'Mozilla/5.0 (compatible; CCTNews/1.0)', accept: 'application/rss+xml, application/xml, text/xml, */*'}, signal: AbortSignal.timeout(20000)});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const items = N.buildItems(N.parseFeed(await r.text()), src, now); lists.push(items); status[src.id] = items.length;
    } catch (e) { status[src.id] = 'error: ' + e.message; }
  }));
  const items = N.mergeItems(lists, now).map(({id, title, link, t, desc, src, cat, cats, impact}) => ({id, title, link, t, desc, src, cat, cats, impact}));
  console.log(status, items.length);
  if (!items.length) { console.error('Sin noticias: no se sobrescribe news-data.json'); process.exit(0); }
  fs.writeFileSync(__dirname + '/../news-data.json', JSON.stringify({at: now, status, items}));
})();
