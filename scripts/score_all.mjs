#!/usr/bin/env node
/* 코스피·코스닥 전 종목 종합 평점 (장마감 후 1회).
   네이버 증권 공개 API(키 없음)로 종목마다 일봉 160일 · 지표(PER·PBR·배당·52주) · 투자자 30일을 받아
   score-core.js 로 채점한다. ETF·ETN·거래정지 종목은 뺀다.
   출력: feeds/stock-scores.json (사이트 종목 화면용, 전 종목)
         feeds/stock-picks.json  (디스코드 추천용, 긍정 상위·주의 하위)
   MKT=US → 미장(나스닥·NYSE·AMEX, 공식은 score-core.js 미장용): feeds/stock-scores-us.json · stock-picks-us.json · stock-detail-us.json · stock-news-us.json
            종목 키 = 티커(AAPL). 거래대금 단위는 억달러(0.1 = 1천만 달러).
   사용: node scripts/score_all.mjs [최대종목수]   (시험할 땐 숫자를 줘서 일부만) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const { features, breakpoints, score, cuts } = require(path.join(ROOT, 'score-core.js'));
const API = 'https://m.stock.naver.com/api';
const US = process.env.MKT === 'US', UAPI = 'https://api.stock.naver.com';
const OUT = (nm) => path.join(ROOT, `feeds/${nm}${US ? '-us' : ''}.json`);
const LIMIT = +process.argv[2] || 0;
const CONC = 8;
const MIN_TV = US ? 0.1 : 5; // 미장: 0.1억 달러 = 1천만 달러 (2026-10-10 사용자 결정) · 추천 목록에 넣을 최소 20일 평균 거래대금(억) — 거래가 거의 없는 종목은 순위에서 뺀다

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, asText) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asText ? await r.text() : await r.json();
    } catch (e) {
      if (i === 2) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}
const n = (s) => { if (s == null) return null; const m = String(s).replace(/,/g, '').match(/-?[\d.]+/); return m ? +m[0] : null; };

async function universe() {
  const out = [];
  if (US) {
    for (const mkt of ['NASDAQ', 'NYSE', 'AMEX']) for (let page = 1; ; page++) {
      const d = await get(`${UAPI}/stock/exchange/${mkt}/marketValue?page=${page}&pageSize=100`);
      for (const s of d.stocks || []) {
        const stop = s.tradeStopType && s.tradeStopType.name && s.tradeStopType.name !== 'TRADING';
        if (s.stockEndType === 'stock' && s.reutersCode && s.symbolCode && !stop) out.push({ c: s.symbolCode, rc: s.reutersCode, n: s.stockName || s.stockNameEng, mk: mkt, ind: s.industryCodeType ? s.industryCodeType.industryGroupKor : null });
      }
      if (page * 100 >= +(d.totalCount || 0) || !(d.stocks || []).length) break;
    }
    return out;
  }
  for (const mkt of ['KOSPI', 'KOSDAQ']) {
    for (let page = 1; ; page++) {
      const d = await get(`${API}/stocks/marketValue/${mkt}?page=${page}&pageSize=100`);
      for (const s of d.stocks || []) {
        const stop = s.tradeStopType && s.tradeStopType.name && s.tradeStopType.name !== 'TRADING';
        if (s.stockEndType === 'stock' && !stop) out.push({ c: s.itemCode, n: s.stockName, mk: mkt });
      }
      if (page * 100 >= +(d.totalCount || 0) || !(d.stocks || []).length) break;
    }
  }
  return out;
}

async function oneUS(s) {
  const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, ''), end = new Date(), st = new Date(end - 420 * 864e5);
  const [rows, b] = await Promise.all([
    get(`${UAPI}/chart/foreign/item/${s.rc}/day?startDateTime=${ymd(st)}0000&endDateTime=${ymd(end)}2359`),
    get(`${UAPI}/stock/${s.rc}/basic`).catch(() => null),
  ]);
  const candles = (Array.isArray(rows) ? rows : []).map((x) => [x.localDate, +x.openPrice, +x.highPrice, +x.lowPrice, +x.closePrice, +x.accumulatedTradingVolume]).slice(-270);
  const ti = {}; for (const x of (b && b.stockItemTotalInfos) || []) ti[x.code] = x.value;
  const f = features({ candles, per: n(ti.per), h52: n(ti.highPriceOf52Weeks), l52: n(ti.lowPriceOf52Weeks) });
  if (f) f._ind = s.ind || ti.industryGroupKor || null;
  return f;
}
async function one(s) {
  if (US) return oneUS(s);
  const [xml, info, trend] = await Promise.all([
    get(`https://fchart.stock.naver.com/sise.nhn?symbol=${s.c}&timeframe=day&count=160&requestType=0`, true),
    get(`${API}/stock/${s.c}/integration`).catch(() => null),
    get(`${API}/stock/${s.c}/trend?pageSize=60`).catch(() => []),
  ]);
  const candles = [...xml.matchAll(/data="(\d{8})\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)"/g)].map((m) => [m[1], +m[2], +m[3], +m[4], +m[5], +m[6]]);
  const ti = {}; for (const x of (info && info.totalInfos) || []) ti[x.code] = x.value;
  const flows = (Array.isArray(trend) ? trend : []).slice().reverse().map((x) => ({ f: n(x.foreignerPureBuyQuant), i: n(x.organPureBuyQuant), v: n(x.accumulatedTradingVolume) }));
  const f = features({ candles, per: n(ti.per), h52: n(ti.highPriceOf52Weeks), l52: n(ti.lowPriceOf52Weeks), flows });
  if (f) {
    f._ind = info && info.industryCode != null ? String(info.industryCode) : null;
    // 거래대금 대비 외국인·기관 순매수 금액 비율(%) — 순매수 수량 × 그날 종가 ÷ (거래량 × 종가)
    const tr = (Array.isArray(trend) ? trend : []).map((x) => ({ f: n(x.foreignerPureBuyQuant) || 0, i: n(x.organPureBuyQuant) || 0, v: n(x.accumulatedTradingVolume) || 0, c: n(x.closePrice) || 0 }));
    const ratio = (k, d) => { const a = tr.slice(0, d), tv = a.reduce((s2, x) => s2 + x.v * x.c, 0); return tv ? +(a.reduce((s2, x) => s2 + x[k] * x.c, 0) / tv * 100).toFixed(1) : null; };
    f._fr = [ratio('f', 5), ratio('i', 5), ratio('f', 20), ratio('i', 20), ratio('f', 60), ratio('i', 60)];
  }
  return f;
}

const t0 = Date.now();
let list = await universe();
if (LIMIT) list = list.slice(0, LIMIT);
console.log('채점 대상', list.length, '종목');
const res = new Array(list.length);
let idx = 0, fail = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (idx < list.length) {
    const i = idx++;
    try { res[i] = await one(list[i]); } catch (e) { fail++; }
    if (i % 300 === 0) console.log(`  ${i}/${list.length} · ${Math.round((Date.now() - t0) / 1000)}초`);
  }
}));

const rows = list.map((s, i) => ({ ...s, f: res[i] })).filter((x) => x.f);
if (rows.length < list.length * 0.8) { console.error(`채점 성공이 너무 적음 (${rows.length}/${list.length}) → 저장 안 함`); process.exit(1); }
const date = rows.map((x) => x.f.date).sort().pop(); // 가장 최근 거래일(YYYYMMDD)
const fresh = rows.filter((x) => x.f.date === date);
// 기준표는 거래가 있는 종목(백테스트와 같은 모집단)으로 만들고, 그 표로 전 종목을 채점한다
const liq0 = fresh.filter((x) => x.f.tv20 >= MIN_TV);
const bp = breakpoints(liq0.map((x) => x.f), US ? 'US' : undefined);
bp.cut = cuts(liq0.map((x) => score(x.f, bp).total)); // 상위 20% = 추천, 하위 20% = 매수 금지
fresh.forEach((x) => { x.r = score(x.f, bp); });
fresh.sort((a, b) => b.r.total - a.r.total);
fresh.forEach((x, i) => { x.rank = i + 1; });

const r1 = (v, k) => v == null ? null : +v.toFixed(k);
const scores = { v: 2, market: US ? 'US' : 'KR', date, n: fresh.length, updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '),
  bp: US ? { mkt: 'US', mom: bp.mom.map((x) => r1(x, 4)), cut: bp.cut } : { vol: bp.vol.map((x) => r1(x, 5)), hiGap: bp.hiGap.map((x) => r1(x, 4)), ep: bp.ep.map((x) => r1(x, 4)), cut: bp.cut }, // 사이트가 목록에 없는 종목을 같은 기준으로 채점할 때 씀
  // 코드: [총점, 관점, 순위, [안정성,고점근접,이익], 좋은점[], 약한점[], 20일평균거래대금(억), 등락률%, 참고[], 하루변동%, 52주고점대비%, PER]
  //   미장은 뒤에 [12]이름, [13]거래소, [14]로이터 코드, [15]1년 모멘텀% 를 더 붙인다 (국내는 stock-list.json 에서 이름을 찾는다)
  items: Object.fromEntries(fresh.map((x) => [x.c, [x.r.total, x.r.view, x.rank, x.r.parts, x.r.good, x.r.bad, r1(x.f.tv20, US ? 3 : 1), r1(x.f.day, 2), x.r.ref, r1(x.f.vol * 100, 2), r1(x.f.hiGap * 100, 1), x.f.per]
    .concat(US ? [x.n, x.mk, x.rc, x.f.mom == null ? null : r1(x.f.mom * 100, 1)] : [])])) };
const liquid = fresh.filter((x) => x.f.tv20 >= MIN_TV);
const pick = (x) => ({ c: x.c, n: x.n, mk: x.mk, rank: x.rank, total: x.r.total, view: x.r.view, parts: x.r.parts, good: x.r.good, bad: x.r.bad, ref: x.r.ref,
  px: x.f.px, day: x.f.day, ret20: x.f.ret20, per: x.f.per, vol: x.f.vol, hiGap: x.f.hiGap, mom: x.f.mom, tv20: US ? r1(x.f.tv20, 2) : Math.round(x.f.tv20) });
const dist = { '추천': 0, '중립': 0, '매수 금지': 0 }; liquid.forEach((x) => dist[x.r.view]++);
const picks = { v: 2, market: US ? 'US' : 'KR', currency: US ? 'USD' : 'KRW', cut: bp.cut, date, n: fresh.length, liquidN: liquid.length, minTv: MIN_TV, updated: scores.updated, dist,
  top: liquid.slice(0, 10).map(pick), weak: liquid.slice(-5).reverse().map(pick) };

// 미장 실적 발표 예정일 (나스닥 실적 달력, 앞으로 3주) — 못 받으면 빈 채로 둔다
const EARN = {};
if (US) {
  for (let k = 0; k < 22; k++) {
    const t = new Date(Date.now() + k * 864e5), wd = t.getUTCDay(); if (wd === 0 || wd === 6) continue;
    const ds = t.toISOString().slice(0, 10);
    try {
      const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${ds}`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      for (const row of (j && j.data && j.data.rows) || []) if (row.symbol && !EARN[row.symbol]) EARN[row.symbol] = [ds.replace(/-/g, ''), /pre/.test(row.time || '') ? '장 전' : /after/.test(row.time || '') ? '장 후' : '', row.epsForecast || ''];
    } catch { /* 달력은 없어도 된다 */ }
  }
  console.log('실적 발표 예정', Object.keys(EARN).length, '종목');
}
// 종목 뉴스 — 추천 화면에서 종목을 펼치면 보여준다 (거래 활발한 종목마다 최근 3건, 네이버 증권 종목 뉴스)
const news = {}, detail = {}; let ni = 0;
// 종목별 상세(추천 화면 펼침): 업종 코드 · 거래대금 대비 순매수 비율 [외국인5일, 기관5일, 외국인20일, 기관20일, 외국인60일, 기관60일]
fresh.forEach((x) => { detail[x.c] = US ? { indN: x.f._ind } : { ind: x.f._ind, fr: x.f._fr }; });
await Promise.all(Array.from({ length: CONC }, async () => {
  while (ni < liquid.length) {
    const x = liquid[ni++];
    if (US) {
      try { // 애널리스트 의견(1~5, 5 = 적극 매수) · 목표주가
        const ig = await get(`${UAPI}/stock/${x.rc}/integration`).catch(() => null), ci = ig && ig.consensusInfo;
        if (ci && ci.recommMean) detail[x.c] = { ...(detail[x.c] || {}), cons: { r: n(ci.recommMean), t: n(ci.priceTargetMean), hi: n(ci.priceTargetHigh), lo: n(ci.priceTargetLow), d: ci.createDate || null } };
      } catch { /* 없어도 된다 */ }
      try { // 분기 실적 (최근 5개 분기, 백만 달러)
        const fq = await get(`${UAPI}/stock/${x.rc}/finance/quarter`).catch(() => null);
        if (fq && fq.trTitleList) {
          const ks = fq.trTitleList.map((t) => t.key);
          const row = (nm) => { const r = (fq.rowList || []).find((z) => z.title === nm); return ks.map((k) => (r && r.columns[k] ? n(r.columns[k].value) : null)); };
          detail[x.c] = { ...(detail[x.c] || {}), qfin: { q: ks, rev: row('매출액'), op: row('EBIT'), ni: row('당기순이익') } };
        }
      } catch { /* 없어도 된다 */ }
      if (EARN[x.c]) detail[x.c] = { ...(detail[x.c] || {}), earn: EARN[x.c] };
      try {
        const fi = await get(`${UAPI}/stock/${x.rc}/finance/annual`).catch(() => null);
        if (fi && fi.trTitleList) {
          const ys = fi.trTitleList.map((t) => [t.key, t.isConsensus === 'Y']);
          const row = (nm) => { const r = (fi.rowList || []).find((z) => z.title === nm); return ys.map(([k]) => (r && r.columns[k] ? n(r.columns[k].value) : null)); };
          detail[x.c] = { ...(detail[x.c] || {}), fin: { y: ys.map((v) => v[0].slice(0, 4) + (v[1] ? 'E' : '')), rev: row('매출액'), op: row('EBIT'), eps: row('당기순이익'), lab: ['매출', '영업이익(EBIT)', '순이익'] } };
        }
      } catch { /* 재무는 없어도 된다 */ }
      try {
        const g = await get(`${UAPI}/news/worldStock/${x.rc}?pageSize=3&page=1`);
        const its = (Array.isArray(g) ? g : []).slice(0, 3);
        if (its.length) news[x.c] = its.map((a) => [String(a.tit || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'), a.ohnm || '', String(a.dt || '').slice(0, 12), `https://m.stock.naver.com/worldstock/stock/${x.rc}/news`]);
      } catch { /* 뉴스는 없어도 된다 */ }
      continue;
    }
    try {
      const fin = await get(`${API}/stock/${x.c}/finance/annual`).catch(() => null);
      const fi = fin && fin.financeInfo;
      if (fi && fi.trTitleList) {
        const ys = fi.trTitleList.map((t) => [t.key, t.isConsensus === 'Y']);
        const row = (nm) => { const r = (fi.rowList || []).find((z) => z.title === nm); return ys.map(([k]) => (r && r.columns[k] ? n(r.columns[k].value) : null)); };
        detail[x.c] = { ...(detail[x.c] || {}), fin: { y: ys.map((v) => v[0].slice(0, 4) + (v[1] ? 'E' : '')), rev: row('매출액'), op: row('영업이익'), eps: row('EPS') } };
      }
    } catch { /* 재무는 없어도 된다 */ }
    try {
      const g = await get(`${API}/news/stock/${x.c}?pageSize=3`);
      const its = (Array.isArray(g) ? g : []).flatMap((b) => b.items || []).slice(0, 3);
      if (its.length) news[x.c] = its.map((a) => [String(a.titleFull || a.title || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'), a.officeName, a.datetime, `https://n.news.naver.com/mnews/article/${a.officeId}/${a.articleId}`]);
    } catch { /* 뉴스는 없어도 된다 */ }
  }
}));
fs.writeFileSync(OUT('stock-news'), JSON.stringify({ date, updated: scores.updated, items: news }));
fs.writeFileSync(OUT('stock-detail'), JSON.stringify({ date, updated: scores.updated, items: detail }));
console.log('종목 뉴스', Object.keys(news).length, '종목 · 재무', Object.values(detail).filter((d) => d.fin).length, '종목');
fs.writeFileSync(OUT('stock-scores'), JSON.stringify(scores));
fs.writeFileSync(OUT('stock-picks'), JSON.stringify(picks, null, 1));
console.log(`완료 ${fresh.length}종목 (실패 ${fail}, 옛 날짜 ${rows.length - fresh.length}) · ${date} · ${Math.round((Date.now() - t0) / 1000)}초`);
console.log('분포', dist, '· 상위', picks.top.slice(0, 3).map((x) => `${x.n} ${x.total}`).join(', '));
