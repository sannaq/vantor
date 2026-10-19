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
const V = require(path.join(ROOT, 'score-core.js'));
const API = 'https://m.stock.naver.com/api';
const US = process.env.MKT === 'US', UAPI = 'https://api.stock.naver.com';
const OUT = (nm) => path.join(ROOT, `feeds/${nm}${US ? '-us' : ''}.json`);
const LIMIT = +process.argv[2] || 0;
const CONC = 8;
const MIN_TV = US ? 0.1 : 5; // 채점 기준표(점수 분위)를 만드는 모집단 — 백테스트와 같게 둔다. 미장: 0.1억 달러 = 1천만 달러 (2026-10-10 사용자 결정) · 추천 목록에 넣을 최소 20일 평균 거래대금(억) — 거래가 거의 없는 종목은 순위에서 뺀다
// 국장 추천 목록(TOP 10·분포·매수 금지 5)에 올리는 조건 (2026-10-13 사용자 결정): 20일 평균 거래대금 50억↑ + 하락 추세 제외.
//   백테스트 124주(24.2~26.9): 추천 묶음 20일 시장 대비 5억↑ +0.81%p → 50억↑ +1.94%p(앞 +2.25 · 뒤 +1.63). 하락 추세 제외는 효과 거의 없음(+1.87%p) — 사용자가 그래도 빼기로 함.
const PICK_TV = US ? MIN_TV : 50, NO_DOWN = !US;

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

const TI_KEYS = ['marketValue', 'per', 'cnsPer', 'eps', 'pbr', 'bps', 'dividendYieldRatio', 'dividend', 'foreignRate']; // 종목 상세 '재무' 탭 핵심 지표 (원문 문자열 그대로)
const pickTi = (ti) => { const o = {}; for (const k of TI_KEYS) if (ti[k] != null && ti[k] !== 'N/A') o[k] = ti[k]; return o; };
async function oneUS(s) {
  const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, ''), end = new Date(), st = new Date(end - 420 * 864e5);
  const [rows, b] = await Promise.all([
    get(`${UAPI}/chart/foreign/item/${s.rc}/day?startDateTime=${ymd(st)}0000&endDateTime=${ymd(end)}2359`),
    get(`${UAPI}/stock/${s.rc}/basic`).catch(() => null),
  ]);
  const candles = (Array.isArray(rows) ? rows : []).map((x) => [x.localDate, +x.openPrice, +x.highPrice, +x.lowPrice, +x.closePrice, +x.accumulatedTradingVolume]).slice(-270);
  const ti = {}; for (const x of (b && b.stockItemTotalInfos) || []) ti[x.code] = x.value;
  const f = features({ candles, per: n(ti.per), h52: n(ti.highPriceOf52Weeks), l52: n(ti.lowPriceOf52Weeks) });
  if (f) { f._ind = s.ind || ti.industryGroupKor || null; f._cs = candles; f._ti = pickTi(ti); } // _cs: 추천 목록 매수·목표가 계산용 (저장 안 함)
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
    f._cs = candles; // 추천 목록 매수·목표가 계산용 (저장 안 함)
    f._ind = info && info.industryCode != null ? String(info.industryCode) : null;
    f._ti = pickTi(ti);
    const ir = info && info.irScheduleInfo; // 실적 발표(IR) 일정 — 회사가 공시한 것만 있다
    if (ir && ir.irScheduleDate) f._ir = [ir.irScheduleDate.replace(/-/g, ''), ir.title || ''];
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

// 미장 시장 국면: S&P500(SPY)이 200일선 아래면 사이트·디스코드에 경고만 띄운다 (점수는 그대로, 2026-10-10 사용자 결정)
let spy = null;
if (US) try {
  const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, ''), rows = await get(`${UAPI}/chart/foreign/item/SPY/day?startDateTime=${ymd(new Date(Date.now() - 330 * 864e5))}0000&endDateTime=${ymd(new Date())}2359`);
  const c = rows.map((x) => +x.closePrice).filter((v) => v > 0);
  if (c.length >= 200) { const ma = c.slice(-200).reduce((a, b) => a + b, 0) / 200; spy = { px: c[c.length - 1], ma200: +ma.toFixed(2), gap: +((c[c.length - 1] / ma - 1) * 100).toFixed(1), below: c[c.length - 1] < ma }; }
} catch { /* 없으면 경고 생략 */ }
const r1 = (v, k) => v == null ? null : +v.toFixed(k);
const scores = { v: 2, market: US ? 'US' : 'KR', spy, date, n: fresh.length, updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '),
  bp: US ? { mkt: 'US', mom: bp.mom.map((x) => r1(x, 4)), cut: bp.cut } : { vol: bp.vol.map((x) => r1(x, 5)), hiGap: bp.hiGap.map((x) => r1(x, 4)), ep: bp.ep.map((x) => r1(x, 4)), cut: bp.cut }, // 사이트가 목록에 없는 종목을 같은 기준으로 채점할 때 씀
  // 코드: [총점, 관점, 순위, [안정성,고점근접,이익], 좋은점[], 약한점[], 20일평균거래대금(억), 등락률%, 참고[], 하루변동%, 52주고점대비%, PER]
  //   미장은 뒤에 [12]이름, [13]거래소, [14]로이터 코드, [15]1년 모멘텀%, [16]업종, [17]종가 를 더 붙인다 (16·17 은 스크리너용, 2026-10-12) (국내는 stock-list.json 에서 이름을 찾는다)
  items: Object.fromEntries(fresh.map((x) => [x.c, [x.r.total, x.r.view, x.rank, x.r.parts, x.r.good, x.r.bad, r1(x.f.tv20, US ? 3 : 1), r1(x.f.day, 2), x.r.ref, r1(x.f.vol * 100, 2), r1(x.f.hiGap * 100, 1), x.f.per]
    .concat(US ? [x.n, x.mk, x.rc, x.f.mom == null ? null : r1(x.f.mom * 100, 1), x.f._ind || null, r1(x.f.px, 2)] : [])])) };
const liquid = fresh.filter((x) => x.f.tv20 >= PICK_TV);
const pickable = liquid.filter((x) => !(NO_DOWN && x.f.trend === '하락 추세'));
// 매수·손절·목표가 + 종목별 예상 (2026-10-13 사용자 결정) — 규칙과 예상 모델은 feeds/levels-model*.json (scripts/levels_study.mjs 가 매달 스스로 고름)
let LVM = null; try { LVM = JSON.parse(fs.readFileSync(OUT('levels-model'), 'utf8')); } catch { /* 모델 없으면 기본 규칙 · 예상 없음 */ }
const r2 = (v) => v == null ? null : +v.toFixed(4);
// 시장 심리(CNN 공포탐욕, feeds/fear-study.json)에 따라 백테스트로 고른 보정을 얹는다 (2026-10-19 사용자 결정)
let FGNOW = null; try { FGNOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'feeds/fear-study.json'), 'utf8')).now.fg; } catch { /* 없으면 보정 없음 */ }
const RULE = V.ruleFor(LVM, FGNOW);
const lvOf = (x) => { const L = V.levels(x.f._cs, { ...RULE.o, ...(US ? { usd: true } : {}) }); if (!L) return {};
  const e = V.expect(L, LVM, US);
  return { lv: { b1: L.b1, b2: L.b2, st: L.st, tg1: L.tg1, tg: L.tg, rule: LVM ? LVM.rule.key : 'ma60|s2|hold' },
    ex: e ? { b: e.b, ap: r2(e.ap), ret: r2(e.ret), win: r2(e.win), hit: r2(e.hit), stop: r2(e.stop), fill1: r2(e.fill1), day: e.day, tgPct: r2(e.tgPct), stPct: r2(e.stPct), band: e.band } : null }; };
const pick = (x) => ({ c: x.c, n: x.n, mk: x.mk, rank: x.rank, total: x.r.total, view: x.r.view, parts: x.r.parts, good: x.r.good, bad: x.r.bad, ref: x.r.ref,
  px: x.f.px, day: x.f.day, ret20: x.f.ret20, per: x.f.per, vol: x.f.vol, hiGap: x.f.hiGap, mom: x.f.mom, tv20: US ? r1(x.f.tv20, 2) : Math.round(x.f.tv20) });
const dist = { '추천': 0, '중립': 0, '매수 금지': 0 }; pickable.forEach((x) => dist[x.r.view]++);
const picks = { v: 2, market: US ? 'US' : 'KR', currency: US ? 'USD' : 'KRW', spy, cut: bp.cut, date, n: fresh.length, liquidN: pickable.length, minTv: PICK_TV, noDown: NO_DOWN, updated: scores.updated, dist,
  top: pickable.slice(0, 20).map((x) => ({ ...pick(x), ...lvOf(x) })), lvRule: LVM ? { key: LVM.rule.key, zone: RULE.zone, adj: RULE.adj, fg: FGNOW, updated: LVM.updated, changed: LVM.changed, ret: LVM.rule.second.ret, win: LVM.rule.second.win, hit: LVM.rule.second.hit, stop: LVM.rule.second.stop, day: LVM.rule.second.day } : null, weak: liquid.slice(-20).reverse().map(pick) }; // 책처럼 양쪽 20종씩 (2026-10-13 사용자 결정)
// 직전 거래일 대비 변화 (이미지의 NEW·순위 ▲▼·빠진 종목). 같은 날 다시 돌리면 그 전 거래일 기준을 그대로 물려받는다.
{
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT('stock-picks'), 'utf8')); } catch { /* 첫 실행 */ }
  const base = old && old.date && old.date !== date && Array.isArray(old.top) ? { date: old.date, top: old.top.map((x) => x.c), weak: (old.weak || []).map((x) => x.c) } : (old && old.prev) || null;
  if (base) {
    const liqPos = new Map(pickable.map((x, i) => [x.c, i + 1]));
    picks.prev = base;
    picks.top.forEach((x) => { const k = base.top.indexOf(x.c); x.was = k < 0 ? null : k + 1; });
    picks.weak.forEach((x) => { x.isNew = !base.weak.includes(x.c); });
    const nowTop = new Set(picks.top.map((x) => x.c)), byC = new Map(fresh.map((x) => [x.c, x]));
    picks.dropped = base.top.map((c, k) => ({ c, was: k + 1 })).filter((d) => !nowTop.has(d.c)).map((d) => {
      const x = byC.get(d.c);
      return { c: d.c, n: x ? x.n : (old.top.find((o) => o.c === d.c) || {}).n || d.c, was: d.was, pos: liqPos.get(d.c) || null, total: x ? x.r.total : null, view: x ? x.r.view : null };
    });
  }
}

// 미장 실적 발표 예정일 (나스닥 실적 달력, 앞으로 6주) — 못 받으면 빈 채로 둔다
const EARN = {};
if (US) {
  for (let k = 0; k < 46; k++) { // 앞으로 6주+ (종목 상세 실적 D-day, 2026-10-19 '모든 미국 종목')
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
// 종목 상세 '재무' 탭 + 실적 D-day — 전 종목 (2026-10-19 사용자 결정). 사이트가 탭을 열 때만 받도록 16조각으로 나눠 쓴다
// feeds/fin/<kr|us>-<0~f>.json = { date, items: { 코드: { ti: 핵심지표, y: 연간, q: 분기 } } } · feeds/earn(-us).json = { 코드: [YYYYMMDD, 설명] }
const finShard = (c) => { let h = 0; for (const ch of String(c)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 16).toString(16); };
const FIN = {}; let fi2 = 0;
const finRows = US ? [['매출액', 'rev'], ['EBIT', 'op'], ['당기순이익', 'ni']] : [['매출액', 'rev'], ['영업이익', 'op'], ['당기순이익', 'ni'], ['영업이익률', 'opm'], ['ROE', 'roe'], ['부채비율', 'debt']];
const finTable = (j) => { const t = j && (j.financeInfo || j); if (!t || !t.trTitleList) return null;
  const ks = t.trTitleList.map((x) => [x.key, x.isConsensus === 'Y']), o = { k: ks.map(([k, e]) => k + (e ? 'E' : '')) };
  for (const [nm, key] of finRows) { const r = (t.rowList || []).find((z) => z.title === nm); o[key] = ks.map(([k]) => (r && r.columns && r.columns[k] ? n(r.columns[k].value) : null)); }
  return o; };
await Promise.all(Array.from({ length: CONC }, async () => {
  while (fi2 < fresh.length) {
    const x = fresh[fi2++], base = US ? `${UAPI}/stock/${x.rc}` : `${API}/stock/${x.c}`;
    const [a, q] = await Promise.all([get(`${base}/finance/annual`).catch(() => null), get(`${base}/finance/quarter`).catch(() => null)]);
    const o = { ti: x.f._ti || {} }, y = finTable(a), qq = finTable(q); if (y) o.y = y; if (qq) o.q = qq;
    (FIN[finShard(x.c)] ||= {})[x.c] = o;
  }
}));
fs.mkdirSync(path.join(ROOT, 'feeds/fin'), { recursive: true });
for (let i = 0; i < 16; i++) { const h = i.toString(16); fs.writeFileSync(path.join(ROOT, `feeds/fin/${US ? 'us' : 'kr'}-${h}.json`), JSON.stringify({ date, items: FIN[h] || {} })); }
const EARNOUT = {}; if (US) { for (const x of fresh) if (EARN[x.c]) EARNOUT[x.c] = EARN[x.c]; } else { for (const x of fresh) if (x.f._ir) EARNOUT[x.c] = x.f._ir; }
fs.writeFileSync(OUT('earn'), JSON.stringify({ date, items: EARNOUT }));
console.log('재무 탭', Object.values(FIN).reduce((s2, m) => s2 + Object.keys(m).length, 0), '종목 · 실적 일정', Object.keys(EARNOUT).length, '종목');
fs.writeFileSync(OUT('stock-news'), JSON.stringify({ date, updated: scores.updated, items: news }));
fs.writeFileSync(OUT('stock-detail'), JSON.stringify({ date, updated: scores.updated, items: detail }));
console.log('종목 뉴스', Object.keys(news).length, '종목 · 재무', Object.values(detail).filter((d) => d.fin).length, '종목');
fs.writeFileSync(OUT('stock-scores'), JSON.stringify(scores));
// 미장 종목 검색 목록 (사이트 검색창 — 한글 이름으로도 찾게, 2026-10-12): [티커, 한글 이름, 거래소] 20일 거래대금 순
if (US) fs.writeFileSync(path.join(ROOT, 'feeds/stock-list-us.json'), JSON.stringify(fresh.slice().sort((a, b) => (b.f.tv20 || 0) - (a.f.tv20 || 0)).map((x) => [x.c, x.n, x.mk])));
fs.writeFileSync(OUT('stock-picks'), JSON.stringify(picks, null, 1));
console.log(`완료 ${fresh.length}종목 (실패 ${fail}, 옛 날짜 ${rows.length - fresh.length}) · ${date} · ${Math.round((Date.now() - t0) / 1000)}초`);
console.log('분포', dist, '· 상위', picks.top.slice(0, 3).map((x) => `${x.n} ${x.total}`).join(', '));
