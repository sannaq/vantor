import { readFileSync } from 'node:fs';
import { snapshotHash } from './gemini-review.mjs';
import { createSecClient } from './paper-sec.mjs';
import { createIrClient, createFilingCollector } from './paper-ir.mjs';
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
export async function collectEvidence(market, candidate, newsRows = [], options = {}) {
  return (await collectNewsResult(market, candidate, newsRows, options)).documents;
}
// Diagnostics distinguish stale coverage from transport/body failures without relaxing evidence rules.
export async function collectNewsResult(market, candidate, newsRows = [], { load = get, now = Date.now() } = {}) {
  const documents = [], maxAgeDays = market === 'US' ? 14 : 7;
  const diagnostics = { checked: 0, stale: 0, invalidDate: 0, invalidUrl: 0, unavailable: 0,
    shortBody: 0, maxAgeDays, latestPublishedAt: null };
  const result = reason => ({ documents, reason, diagnostics });
  if (market === 'US') {
    let list;
    try { list = await load(`https://api.stock.naver.com/news/worldStock/${encodeURIComponent(candidate.rc)}?pageSize=3&page=1`); }
    catch { return result('news_list_unavailable'); }
    if (!Array.isArray(list)) return result('news_list_invalid');
    newsRows = list.map(x => ({ title: x.tit, date: x.dt, office: x.oid, article: x.aid }));
  } else newsRows = newsRows.map(x => ({ title: x[0], date: x[2], url: x[3] }));
  for (const row of newsRows.slice(0, 3)) {
    diagnostics.checked++;
    let publishedAt;
    try { publishedAt = kstTime(row.date); } catch {}
    const published = Date.parse(publishedAt);
    if (!Number.isFinite(published) || published > now) { diagnostics.invalidDate++; continue; }
    if (!diagnostics.latestPublishedAt || published > Date.parse(diagnostics.latestPublishedAt)) diagnostics.latestPublishedAt = publishedAt;
    if (now - published > maxAgeDays * 864e5) { diagnostics.stale++; continue; }
    let html, url;
    try {
      if (market === 'US') {
        const params = new URLSearchParams({ officeId: row.office, articleId: row.article, reutersCode: candidate.rc });
        url = `https://m.stock.naver.com/front-api/news/worldStock/end?${params}`;
        const response = await load(url);
        html = response?.result?.article?.content;
      } else {
        if (!/^https:\/\/n\.news\.naver\.com\/mnews\/article\/\d+\/\d+$/.test(row.url || '')) { diagnostics.invalidUrl++; continue; }
        url = row.url; const page = await load(url, false);
        html = page.match(/<article\b[^>]*id=["']dic_area["'][^>]*>([\s\S]*?)<\/article>/i)?.[1];
      }
      if (typeof html !== 'string' || !html.trim()) { diagnostics.unavailable++; continue; }
      const text = plainText(html);
      if (text.length < 160) { diagnostics.shortBody++; continue; }
      documents.push({ id: snapshotHash({ url, text }), type: 'news', title: plainText(row.title),
        text: text.slice(0, 6000), url, publishedAt, fetchedAt: new Date(now).toISOString(), verified: true });
    } catch { diagnostics.unavailable++; }
  }
  return result(documents.length ? 'ok' : !diagnostics.checked ? 'news_empty' :
    diagnostics.unavailable ? 'news_body_unavailable' : diagnostics.shortBody ? 'news_body_short' :
    diagnostics.invalidUrl ? 'news_url_invalid' : diagnostics.invalidDate ? 'news_date_invalid' : 'news_stale');
}

let secCache = null;
try { secCache = JSON.parse(readFileSync(new URL('../feeds/sec-cache-us.json', import.meta.url), 'utf8')); } catch {}
const usFilings = createFilingCollector(createSecClient({ cache: secCache }), createIrClient());
export async function collectFilingResult(market, candidate) {
  if (market === 'US') return usFilings(candidate, plainText);
  const documents = await collectFilings(market, candidate);
  return { documents, reason: documents.length ? 'ok' : 'waiting_evidence' };
}
export async function collectFilings(market, candidate) {
  if (market === 'US') return (await usFilings(candidate, plainText)).documents;
  try {
    const out = [];
    if (market === 'KR') {
      const rows = await get(`https://m.stock.naver.com/api/stock/${candidate.c}/disclosure?pageSize=2&page=1`);
      for (const row of (Array.isArray(rows) ? rows : []).slice(0,2)) {
        const url = `https://m.stock.naver.com/api/stock/${candidate.c}/disclosure/${encodeURIComponent(row.disclosureId)}`;
        const d = await get(url), text = plainText(d.disclosure?.contents);
        if (d.disclosure?.itemCode !== candidate.c) continue;
        const stamp = d.disclosure?.datetime || row.datetime;
        const publishedAt = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(stamp) ? stamp : stamp + 'Z').toISOString();
        if (text.length < 160 || Date.parse(publishedAt) > Date.now()) continue;
        out.push({ id: snapshotHash({ url, text }), type: 'filing', title: row.title, text: text.slice(0,10000),
          url, publishedAt, fetchedAt: new Date().toISOString(), verified: true });
      }
    }
    return out;
  } catch { return []; }
}
