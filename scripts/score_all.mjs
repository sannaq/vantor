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
const { score } = require(path.join(ROOT, 'score-core.js'));
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
  return score({ candles, per: n(ti.per), pbr: n(ti.pbr), div: n(ti.dividendYieldRatio), h52: n(ti.highPriceOf52Weeks), l52: n(ti.lowPriceOf52Weeks), flows });
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

const rows = list.map((s, i) => ({ ...s, r: res[i] })).filter((x) => x.r);
if (rows.length < list.length * 0.8) { console.error(`채점 성공이 너무 적음 (${rows.length}/${list.length}) → 저장 안 함`); process.exit(1); }
const date = rows.map((x) => x.r.m.date).sort().pop(); // 가장 최근 거래일(YYYYMMDD)
const fresh = rows.filter((x) => x.r.m.date === date);
fresh.sort((a, b) => b.r.total - a.r.total);
fresh.forEach((x, i) => { x.rank = i + 1; });

const P = (r) => [r.parts.trend[0], r.parts.flow[0], r.parts.value[0], r.parts.risk[0]];
const scores = { date, n: fresh.length, updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '),
  // 코드: [총점, 등급, 관점, 순위, [추세,수급,가치,위험], 좋은점[], 약한점[]]
  items: Object.fromEntries(fresh.map((x) => [x.c, [x.r.total, x.r.grade, x.r.view, x.rank, P(x.r), x.r.good, x.r.bad]])) };
const liquid = fresh.filter((x) => x.r.m.tv20 >= MIN_TV);
const pick = (x) => ({ c: x.c, n: x.n, mk: x.mk, rank: x.rank, total: x.r.total, grade: x.r.grade, view: x.r.view, parts: P(x.r),
  good: x.r.good, bad: x.r.bad, px: x.r.m.px, day: x.r.m.day, ret20: x.r.m.ret20, rsi: x.r.m.rsi, per: x.r.m.per, pbr: x.r.m.pbr, tv20: Math.round(x.r.m.tv20) });
const dist = { '긍정': 0, '중립': 0, '주의': 0 }; fresh.forEach((x) => dist[x.r.view]++);
const picks = { date, n: fresh.length, liquidN: liquid.length, minTv: MIN_TV, updated: scores.updated, dist,
  top: liquid.slice(0, 10).map(pick), weak: liquid.slice(-5).reverse().map(pick) };

fs.writeFileSync(path.join(ROOT, 'feeds/stock-scores.json'), JSON.stringify(scores));
fs.writeFileSync(path.join(ROOT, 'feeds/stock-picks.json'), JSON.stringify(picks, null, 1));
console.log(`완료 ${fresh.length}종목 (실패 ${fail}, 옛 날짜 ${rows.length - fresh.length}) · ${date} · ${Math.round((Date.now() - t0) / 1000)}초`);
console.log('분포', dist, '· 상위', picks.top.slice(0, 3).map((x) => `${x.n} ${x.total}`).join(', '));
