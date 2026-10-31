/* Mercados: cada activo se guarda con su exchange en la propia clave, como en TradingView.
   «BTCUSDT» = Binance Spot (como siempre) · «BTCUSDT@bybit», «BTCUSDT@okx», «BTCUSDT@binancef», «BTC-USD@coinbase»·, «BTCUSDT@bingx».
   Aquí viven: la lectura de claves, las listas de pares de cada exchange (para el buscador) y los precios/cambio 24 h de cada uno.
   Todo es de datos públicos (sin llaves). */
(function (root) {
  'use strict';
  const EXCH = {binance: 'Binance', binancef: 'Binance Futuros', bybit: 'Bybit', okx: 'OKX', coinbase: 'Coinbase', bingx: 'BingX'};
  const SHORT = {binance: 'BINANCE', binancef: 'BINANCE·F', bybit: 'BYBIT', okx: 'OKX', coinbase: 'COINBASE', bingx: 'BINGX'};
  const ORDER = ['binance', 'bybit', 'bingx', 'okx', 'coinbase', 'binancef'];
  const QUOTE_OK = ['USDT', 'USDC', 'USD', 'BTC', 'EUR'];

  const parse = key => { const s = String(key || ''), i = s.indexOf('@'); const src = i < 0 ? 'binance' : s.slice(i + 1); return {sym: i < 0 ? s : s.slice(0, i), src: EXCH[src] ? src : 'binance'}; };
  const symOf = key => parse(key).sym, srcOf = key => parse(key).src;
  const mk = (sym, src) => !src || src === 'binance' ? sym : `${sym}@${src}`;
  /* Símbolo «de trabajo» que usa la app para separar base/cotización: Binance escribe BTCUSDT; OKX/Coinbase/BingX usan guiones (BTC-USDT). */
  const norm = sym => String(sym).replace(/[-_/]/g, '').toUpperCase();

  // ── normalizadores (puros, probados en tests/markets.test.js) ──
  const num = x => { const n = Number(x); return Number.isFinite(n) ? n : NaN; };
  const row = (src, sym, base, quote, last, chg, vol) => ({key: mk(sym, src), sym, src, base, quote, last: num(last), chg: num(chg), vol: num(vol) || 0});
  const splitQ = s => { for (const q of ['USDT', 'USDC', 'FDUSD', 'USD', 'BTC', 'EUR']) if (s.length > q.length && s.endsWith(q)) return [s.slice(0, -q.length), q]; return null; };
  const N = {
    binance: d => (Array.isArray(d) ? d : []).map(t => { const p = splitQ(t.symbol); return p && QUOTE_OK.includes(p[1]) ? row('binance', t.symbol, p[0], p[1], t.lastPrice, t.priceChangePercent, t.quoteVolume) : null; }).filter(Boolean),
    binancef: d => (Array.isArray(d) ? d : []).map(t => { const p = splitQ(t.symbol); return p && QUOTE_OK.includes(p[1]) ? row('binancef', t.symbol, p[0], p[1], t.lastPrice, t.priceChangePercent, t.quoteVolume) : null; }).filter(Boolean),
    bybit: j => (j && j.result && Array.isArray(j.result.list) ? j.result.list : []).map(t => { const p = splitQ(t.symbol); return p && QUOTE_OK.includes(p[1]) ? row('bybit', t.symbol, p[0], p[1], t.lastPrice, num(t.price24hPcnt) * 100, t.turnover24h) : null; }).filter(Boolean),
    okx: j => (j && Array.isArray(j.data) ? j.data : []).map(t => { const pp = String(t.instId).split('-'), b = pp[0], q = pp[1]; if (pp.length !== 2 || !QUOTE_OK.includes(q)) return null; const o = num(t.open24h), l = num(t.last); return row('okx', t.instId, b, q, l, o > 0 ? (l / o - 1) * 100 : NaN, t.volCcy24h * l); }).filter(Boolean),
    coinbase: d => (Array.isArray(d) ? d : []).map(t => { const b = t.base_currency, q = t.quote_currency; if (!b || !QUOTE_OK.includes(q) || t.trading_disabled || t.status === 'delisted') return null; return row('coinbase', t.id, b, q, NaN, NaN, 0); }).filter(Boolean),
    bingx: j => (j && j.data && Array.isArray(j.data.symbols) ? j.data.symbols : Array.isArray(j && j.data) ? j.data : []).map(t => { const [b, q] = String(t.symbol).split('-'); if (!b || !QUOTE_OK.includes(q) || t.status === 0) return null; return row('bingx', t.symbol, b, q, NaN, NaN, 0); }).filter(Boolean)
  };
  const URLS = {
    binance: 'https://api.binance.com/api/v3/ticker/24hr',
    binancef: 'https://fapi.binance.com/fapi/v1/ticker/24hr',
    bybit: 'https://api.bybit.com/v5/market/tickers?category=spot',
    okx: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
    coinbase: 'https://api.exchange.coinbase.com/products',
    bingx: 'https://open-api.bingx.com/openApi/spot/v1/common/symbols'
  };

  // ── listas de pares (se piden una vez y se guardan 30 min) ──
  const cache = {}, TTL = 30 * 60 * 1000;
  let get = async url => { const r = await fetch(url); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
  const setFetcher = f => { get = f; };
  async function universe(src) {
    const c = cache[src]; if (c && Date.now() - c.ts < TTL) return c.list;
    if (c && c.p) return c.p;
    const p = (async () => { try { const list = N[src](await get(URLS[src])); cache[src] = {ts: Date.now(), list}; return list; } catch { cache[src] = {ts: Date.now() - TTL + 60000, list: (c && c.list) || []}; return (c && c.list) || []; } })();
    cache[src] = Object.assign({}, c, {p}); return p;
  }
  const loaded = () => ORDER.filter(s => cache[s] && cache[s].list && cache[s].list.length);

  /* Búsqueda estilo TradingView: «btc», «ethusdt», «sol/usdt»… devuelve filas {key, sym, src, base, quote} ordenadas por relevancia y exchange. */
  function search(q, opts = {}) {
    const t = String(q || '').toUpperCase().replace(/[^A-Z0-9.]/g, ''), limit = opts.limit || 60, names = opts.names || (() => '');
    const out = [];
    for (const src of ORDER) {
      const list = cache[src] && cache[src].list; if (!list) continue;
      for (const r of list) {
        const full = r.base + r.quote, nm = String(names(r.base) || '').toUpperCase();
        let score = -1;
        if (!t) score = r.quote === 'USDT' || r.quote === 'USD' ? 1 : -1;
        else if (r.base === t) score = 100 + (r.quote === 'USDT' ? 5 : r.quote === 'USD' ? 4 : 0);
        else if (full === t) score = 110;
        else if (full.startsWith(t)) score = 60;
        else if (r.base.startsWith(t)) score = 50;
        else if (nm && nm.startsWith(t)) score = 40;
        else if (full.includes(t) || (nm && nm.includes(t))) score = 20;
        if (score < 0) continue;
        out.push(Object.assign({score: score + Math.min(8, Math.log10(1 + r.vol) / 2) - ORDER.indexOf(src) * .1}, r));
      }
    }
    out.sort((a, b) => b.score - a.score || a.base.localeCompare(b.base));
    return out.slice(0, limit);
  }

  // ── precios 24 h de las claves del seguimiento (agrupadas por exchange) ──
  async function tickers(keys) {
    const by = {}; for (const k of keys) { const p = parse(k); if (p.src !== 'binance') (by[p.src] = by[p.src] || []).push(p); }
    const out = {};
    await Promise.all(Object.entries(by).map(async ([src, ps]) => {
      try {
        if (src === 'binancef' || src === 'bybit' || src === 'okx') { const list = await universe(src), m = new Map(list.map(r => [r.sym, r])); for (const p of ps) { const r = m.get(p.sym); if (r) out[mk(p.sym, src)] = {symbol: mk(p.sym, src), lastPrice: String(r.last), priceChangePercent: String(r.chg)}; } }
        else if (src === 'coinbase') await Promise.all(ps.map(async p => { try { const s = await get(`https://api.exchange.coinbase.com/products/${p.sym}/stats`), t = await get(`https://api.exchange.coinbase.com/products/${p.sym}/ticker`), o = num(s.open), l = num(t.price); out[mk(p.sym, src)] = {symbol: mk(p.sym, src), lastPrice: String(l), priceChangePercent: String(o > 0 ? (l / o - 1) * 100 : NaN)}; } catch {} }));
        else if (src === 'bingx') await Promise.all(ps.map(async p => { try { const j = await get(`https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?symbol=${p.sym}&timestamp=${Date.now()}`), t = Array.isArray(j.data) ? j.data[0] : j.data; if (t) out[mk(p.sym, src)] = {symbol: mk(p.sym, src), lastPrice: String(num(t.lastPrice)), priceChangePercent: String(num(String(t.priceChangePercent).replace('%', '')))}; } catch {} }));
      } catch {}
    }));
    return out;
  }

  // BingX: velas (el orden que devuelve no está garantizado, se ordena por tiempo)
  const BX_IV = {'1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M'};
  async function klinesBingx(sym, tf, limit = 1000) {
    const j = await get(`https://open-api.bingx.com/openApi/spot/v2/market/kline?symbol=${sym}&interval=${BX_IV[tf]}&limit=${Math.min(1000, limit)}`);
    const d = j && Array.isArray(j.data) ? j.data : null; if (!d || !d.length) throw Error('BingX sin datos');
    return d.map(x => Array.isArray(x) ? {t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5]} : {t: +x.openTime || +x.time, o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume}).sort((a, b) => a.t - b.t).filter((c, i, arr) => !i || c.t !== arr[i - 1].t);
  }

  root.CCTMarkets = {EXCH, SHORT, ORDER, parse, symOf, srcOf, mk, norm, N, universe, loaded, search, tickers, klinesBingx, BX_IV, setFetcher, splitQ};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CCTMarkets;
})(typeof window !== 'undefined' ? window : globalThis);
