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
  // Calendario económico de la semana (ForexFactory vía faireconomy). Se pide como mucho cada ~50 min para no abusar.
  let cal = null; try { cal = JSON.parse(fs.readFileSync(__dirname + '/../calendar-data.json', 'utf8')); } catch {}
  if (!cal || now - (cal.at || 0) > 50 * 60e3) {
    const evs = [];
    for (const f of ['thisweek', 'nextweek']) {
      try { const r = await fetch(`https://nfs.faireconomy.media/ff_calendar_${f}.json`, {headers: {'user-agent': 'Mozilla/5.0 (compatible; CCTNews/1.0)'}, signal: AbortSignal.timeout(20000)});
        if (r.ok) { const j = await r.json(); if (Array.isArray(j)) for (const e of j) { const t = Date.parse(e.date); if (Number.isFinite(t) && e.title) evs.push({t, title: String(e.title), country: String(e.country || ''), impact: String(e.impact || ''), forecast: e.forecast || '', previous: e.previous || '', actual: e.actual || ''}); } status['cal_' + f] = 'ok'; } else status['cal_' + f] = 'HTTP ' + r.status;
      } catch (e) { status['cal_' + f] = 'error: ' + e.message; }
    }
    if (evs.length) { evs.sort((a, b) => a.t - b.t); fs.writeFileSync(__dirname + '/../calendar-data.json', JSON.stringify({at: now, events: evs})); }
  }
  console.log(status, items.length);
  if (!items.length) { console.error('Sin noticias: no se sobrescribe news-data.json'); process.exit(0); }
  fs.writeFileSync(__dirname + '/../news-data.json', JSON.stringify({at: now, status, items}));
})();
