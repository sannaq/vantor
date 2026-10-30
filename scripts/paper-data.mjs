import { snapshotHash } from './gemini-review.mjs';
const UA = { 'User-Agent': 'Mozilla/5.0' };
async function get(url, json = true) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!r.ok) throw new Error('source_unavailable');
  return json ? r.json() : r.text();
}
export async function candles(market, code) {
  if (!/^[A-Za-z0-9.^-]{1,30}$/.test(code)) throw new Error('invalid_symbol');
  if (market === 'KR') {
    const xml = await get(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=200&requestType=0`, false);
    return [...xml.matchAll(/data="(\d{8})\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)"/g)].map(m => [m[1], ...m.slice(2).map(Number)]);
  }
  const ymd = d => d.toISOString().slice(0,10).replaceAll('-', '');
  const end = new Date(), start = new Date(end - 300 * 864e5);
  const rows = await get(`https://api.stock.naver.com/chart/foreign/item/${code}/day?startDateTime=${ymd(start)}0000&endDateTime=${ymd(end)}2359`);
  if (!Array.isArray(rows)) throw new Error('invalid_price_response');
  return rows.map(x => [x.localDate, +x.openPrice, +x.highPrice, +x.lowPrice, +x.closePrice, +x.accumulatedTradingVolume]);
}
export function plainText(html) {
  return String(html || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, x =>
      ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[x])
    .replace(/\s+/g, ' ').trim();
}
function kstTime(value) {
  const d = String(value).replace(/[^0-9]/g, '');
  if (d.length < 12) return null;
  return new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(8,10)}:${d.slice(10,12)}:00+09:00`).toISOString();
}

// Only public article bodies are sent to the model. Missing/blocked pages are
// never replaced with made-up content or assumed risk-free.
export async function collectEvidence(market, candidate, newsRows = []) {
  const documents = [];
  if (market === 'US') {
    const list = await get(`https://api.stock.naver.com/news/worldStock/${encodeURIComponent(candidate.rc)}?pageSize=3&page=1`);
    newsRows = (Array.isArray(list) ? list : []).map(x => ({ title: x.tit, date: x.dt,
      office: x.oid, article: x.aid }));
  } else newsRows = newsRows.map(x => ({ title: x[0], date: x[2], url: x[3] }));
  for (const row of newsRows.slice(0, 3)) {
    try {
      const publishedAt = kstTime(row.date), published = Date.parse(publishedAt);
      if (!Number.isFinite(published) || published > Date.now() || Date.now() - published > 7 * 864e5) continue;
      let html, url;
      if (market === 'US') {
        const params = new URLSearchParams({ officeId: row.office, articleId: row.article, reutersCode: candidate.rc });
        url = `https://m.stock.naver.com/front-api/news/worldStock/end?${params}`;
        const result = await get(url);
        html = result?.result?.article?.content;
      } else {
        if (!/^https:\/\/n\.news\.naver\.com\/mnews\/article\/\d+\/\d+$/.test(row.url || '')) continue;
        url = row.url; const page = await get(url, false);
        html = page.match(/<article\b[^>]*id=["']dic_area["'][^>]*>([\s\S]*?)<\/article>/i)?.[1];
      }
      const text = plainText(html);
      if (text.length < 160) continue;
      documents.push({ id: snapshotHash({ url, text }), type: 'news', title: plainText(row.title),
        text: text.slice(0, 6000), url, publishedAt, fetchedAt: new Date().toISOString(), verified: true });
    } catch { /* unverified source omitted; model must hold if evidence is insufficient */ }
  }
  return documents;
}

let secTickers;
async function secGet(url, json = true) {
  const r = await fetch(url, { headers: { 'User-Agent': 'VantorPaperResearch contact https://github.com/sannaq/vantor',
    Accept: json ? 'application/json' : 'text/html' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!r.ok) throw new Error('filing_unavailable');
  return json ? r.json() : r.text();
}
export async function collectFilings(market, candidate) {
  try {
    const out = [];
    if (market === 'KR') {
      const rows = await get(`https://m.stock.naver.com/api/stock/${candidate.c}/disclosure?pageSize=2&page=1`);
      for (const row of (Array.isArray(rows) ? rows : []).slice(0,2)) {
        const url = `https://m.stock.naver.com/api/stock/${candidate.c}/disclosure/${encodeURIComponent(row.disclosureId)}`;
        const d = await get(url), text = plainText(d.disclosure?.contents);
        const stamp = d.disclosure?.datetime || row.datetime;
        const publishedAt = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(stamp) ? stamp : stamp + 'Z').toISOString();
        if (text.length < 160 || Date.parse(publishedAt) > Date.now()) continue;
        out.push({ id: snapshotHash({ url, text }), type: 'filing', title: row.title, text: text.slice(0,10000),
          url, publishedAt, fetchedAt: new Date().toISOString(), verified: true });
      }
    } else {
      secTickers ||= await secGet('https://www.sec.gov/files/company_tickers.json');
      const issuer = Object.values(secTickers).find(s => s.ticker === candidate.c);
      if (!issuer) return [];
      const cik = String(issuer.cik_str), data = await secGet(`https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`);
      const r = data.filings?.recent, i = r?.form?.findIndex(f => ['10-K','10-Q','8-K','20-F','6-K'].includes(f));
      if (i == null || i < 0) return [];
      const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${r.accessionNumber[i].replaceAll('-','')}/${r.primaryDocument[i]}`;
      const text = plainText(await secGet(url, false)), publishedAt = new Date(r.acceptanceDateTime[i]).toISOString();
      if (text.length >= 160 && Date.parse(publishedAt) <= Date.now()) out.push({ id: snapshotHash({ url, text }), type: 'filing',
        title: `${issuer.title} ${r.form[i]}`, text: text.slice(0,10000), url, publishedAt,
        fetchedAt: new Date().toISOString(), verified: true });
    }
    return out;
  } catch { return []; }
}
