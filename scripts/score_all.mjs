#!/usr/bin/env node
/* 코스피·코스닥 전 종목 종합 평점 (장마감 후 1회).
   네이버 증권 공개 API(키 없음)로 종목마다 일봉 160일 · 지표(PER·PBR·배당·52주) · 투자자 30일을 받아
   score-core.js 로 채점한다. ETF·ETN·거래정지 종목은 뺀다.
   출력: feeds/stock-scores.json (사이트 종목 화면용, 전 종목)
         feeds/stock-picks.json  (디스코드 추천용, 긍정 상위·주의 하위)
   사용: node scripts/score_all.mjs [최대종목수]   (시험할 땐 숫자를 줘서 일부만) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const { features, breakpoints, score, cuts } = require(path.join(ROOT, 'score-core.js'));
const API = 'https://m.stock.naver.com/api';
const LIMIT = +process.argv[2] || 0;
const CONC = 8;
const MIN_TV = 5; // 추천 목록에 넣을 최소 20일 평균 거래대금(억) — 거래가 거의 없는 종목은 순위에서 뺀다

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

async function one(s) {
  const [xml, info, trend] = await Promise.all([
    get(`https://fchart.stock.naver.com/sise.nhn?symbol=${s.c}&timeframe=day&count=160&requestType=0`, true),
    get(`${API}/stock/${s.c}/integration`).catch(() => null),
    get(`${API}/stock/${s.c}/trend?pageSize=30`).catch(() => []),
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
    f._fr = [ratio('f', 5), ratio('i', 5), ratio('f', 20), ratio('i', 20)];
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
const bp = breakpoints(liq0.map((x) => x.f));
bp.cut = cuts(liq0.map((x) => score(x.f, bp).total)); // 상위 20% = 추천, 하위 20% = 매수 금지
fresh.forEach((x) => { x.r = score(x.f, bp); });
fresh.sort((a, b) => b.r.total - a.r.total);
fresh.forEach((x, i) => { x.rank = i + 1; });

const r1 = (v, k) => v == null ? null : +v.toFixed(k);
const scores = { v: 2, date, n: fresh.length, updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '),
  bp: { vol: bp.vol.map((x) => r1(x, 5)), hiGap: bp.hiGap.map((x) => r1(x, 4)), ep: bp.ep.map((x) => r1(x, 4)), cut: bp.cut }, // 사이트가 목록에 없는 종목을 같은 기준으로 채점할 때 씀
  // 코드: [총점, 관점, 순위, [안정성,고점근접,이익], 좋은점[], 약한점[], 20일평균거래대금(억), 등락률%, 참고[], 하루변동%, 52주고점대비%, PER]
  items: Object.fromEntries(fresh.map((x) => [x.c, [x.r.total, x.r.view, x.rank, x.r.parts, x.r.good, x.r.bad, r1(x.f.tv20, 1), r1(x.f.day, 2), x.r.ref, r1(x.f.vol * 100, 2), r1(x.f.hiGap * 100, 1), x.f.per]])) };
const liquid = fresh.filter((x) => x.f.tv20 >= MIN_TV);
const pick = (x) => ({ c: x.c, n: x.n, mk: x.mk, rank: x.rank, total: x.r.total, view: x.r.view, parts: x.r.parts, good: x.r.good, bad: x.r.bad, ref: x.r.ref,
  px: x.f.px, day: x.f.day, ret20: x.f.ret20, per: x.f.per, vol: x.f.vol, hiGap: x.f.hiGap, tv20: Math.round(x.f.tv20) });
const dist = { '추천': 0, '중립': 0, '매수 금지': 0 }; liquid.forEach((x) => dist[x.r.view]++);
const picks = { v: 2, cut: bp.cut, date, n: fresh.length, liquidN: liquid.length, minTv: MIN_TV, updated: scores.updated, dist,
  top: liquid.slice(0, 10).map(pick), weak: liquid.slice(-5).reverse().map(pick) };

// 종목 뉴스 — 추천 화면에서 종목을 펼치면 보여준다 (거래 활발한 종목마다 최근 3건, 네이버 증권 종목 뉴스)
const news = {}, detail = {}; let ni = 0;
// 종목별 상세(추천 화면 펼침): 업종 코드 · 거래대금 대비 순매수 비율 [외국인5일, 기관5일, 외국인20일, 기관20일]
fresh.forEach((x) => { detail[x.c] = { ind: x.f._ind, fr: x.f._fr }; });
await Promise.all(Array.from({ length: CONC }, async () => {
  while (ni < liquid.length) {
    const x = liquid[ni++];
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
fs.writeFileSync(path.join(ROOT, 'feeds/stock-news.json'), JSON.stringify({ date, updated: scores.updated, items: news }));
fs.writeFileSync(path.join(ROOT, 'feeds/stock-detail.json'), JSON.stringify({ date, updated: scores.updated, items: detail }));
console.log('종목 뉴스', Object.keys(news).length, '종목 · 재무', Object.values(detail).filter((d) => d.fin).length, '종목');
fs.writeFileSync(path.join(ROOT, 'feeds/stock-scores.json'), JSON.stringify(scores));
fs.writeFileSync(path.join(ROOT, 'feeds/stock-picks.json'), JSON.stringify(picks, null, 1));
console.log(`완료 ${fresh.length}종목 (실패 ${fail}, 옛 날짜 ${rows.length - fresh.length}) · ${date} · ${Math.round((Date.now() - t0) / 1000)}초`);
console.log('분포', dist, '· 상위', picks.top.slice(0, 3).map((x) => `${x.n} ${x.total}`).join(', '));
