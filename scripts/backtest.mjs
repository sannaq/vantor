#!/usr/bin/env node
/* 종합 평점 백테스트 — score-core.js(v2) 가 과거에도 통했는지 잰다. 매달 1일 자동 실행(.github/workflows/backtest.yml).
   ① 종목마다 일봉 420일 · 투자자 300일 · 현재 PER/PBR/배당을 받는다 (캐시: BT_CACHE, 기본 /tmp/vantor-bt)
   ② 5거래일마다(주 1회) 그날까지의 자료만으로 채점 → 이후 5일·20일 수익률을 같은 날 전체 평균과 비교(초과수익)
   ③ 추천·중립·매수 금지 묶음과 5분위의 초과수익, 점수의 예측력(순위 상관 IC), 앞·뒤 절반 기간 비교(과적합 점검)
   ④ 점수에 넣은 지표와 뺀 지표(추세·수급)의 개별 예측력 — 공식을 바꿀지 판단하는 근거
   한계: 가치(PER·PBR)는 과거 값을 못 구해 현재 값으로 계산 → 그 항목은 미래 정보가 섞인다. 상장폐지 종목은 빠져 있다.
   사용: node scripts/backtest.mjs [--refresh] */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const { features, breakpoints, score, cuts } = require(path.join(ROOT, 'score-core.js'));
const API = 'https://m.stock.naver.com/api';
const US = process.env.MKT === 'US'; // MKT=US → 미장(나스닥·NYSE·AMEX), 결과 feeds/backtest-us*.json
const UAPI = 'https://api.stock.naver.com';
const CACHE = process.env.BT_CACHE || (US ? '/tmp/vantor-bt-us' : '/tmp/vantor-bt');
const REFRESH = process.argv.includes('--refresh');
const MIN_TV = +(process.env.BT_MINTV || (US ? 0.1 : 5)), STEP = 5, WARM = +(process.env.BT_WARM || 160), H = +(process.env.BT_H || 20), HZ = [5, H]; // BT_H=60 → 60거래일 보유 기준 (feeds/backtest-60.json)
fs.mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, asText) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asText ? await r.text() : await r.json();
    } catch (e) { if (i === 2) throw e; await sleep(1500 * (i + 1)); }
  }
}
const n = (s) => { if (s == null) return null; const m = String(s).replace(/,/g, '').match(/-?[\d.]+/); return m ? +m[0] : null; };

async function universe() {
  const out = [];
  if (US) {
    for (const mkt of ['NASDAQ', 'NYSE', 'AMEX']) for (let page = 1; ; page++) {
      const d = await get(`${UAPI}/stock/exchange/${mkt}/marketValue?page=${page}&pageSize=100`);
      for (const s of d.stocks || []) if (s.stockEndType === 'stock' && s.reutersCode) out.push({ c: s.reutersCode, n: s.stockName, mk: mkt });
      if (page * 100 >= +(d.totalCount || 0) || !(d.stocks || []).length) break;
    }
    return out;
  }
  for (const mkt of ['KOSPI', 'KOSDAQ']) for (let page = 1; ; page++) {
    const d = await get(`${API}/stocks/marketValue/${mkt}?page=${page}&pageSize=100`);
    for (const s of d.stocks || []) if (s.stockEndType === 'stock') out.push({ c: s.itemCode, n: s.stockName, mk: mkt });
    if (page * 100 >= +(d.totalCount || 0) || !(d.stocks || []).length) break;
  }
  return out;
}
async function fetchOne(s) {
  const f = path.join(CACHE, s.c + '.json');
  if (!REFRESH && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  if (US) {
    const days = +(process.env.BT_DAYS || 420), end = new Date(), st = new Date(end - Math.ceil(days * 1.5 + 10) * 864e5);
    const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, '');
    const rows = await get(`${UAPI}/chart/foreign/item/${s.c}/day?startDateTime=${ymd(st)}0000&endDateTime=${ymd(end)}2359`);
    const candles = (Array.isArray(rows) ? rows : []).map((x) => [x.localDate, +x.openPrice, +x.highPrice, +x.lowPrice, +x.closePrice, +x.accumulatedTradingVolume]).slice(-days);
    const b = await get(`${UAPI}/stock/${s.c}/basic`).catch(() => null);
    const ti = {}; for (const x of (b && b.stockItemTotalInfos) || []) ti[x.code] = x.value;
    const d = { candles, flows: {}, per: n(ti.per), pbr: n(ti.pbr), div: n(ti.dividendYieldRatio) };
    fs.writeFileSync(f, JSON.stringify(d));
    return d;
  }
  const xml = await get(`https://fchart.stock.naver.com/sise.nhn?symbol=${s.c}&timeframe=day&count=${process.env.BT_DAYS || 420}&requestType=0`, true);
  const candles = [...xml.matchAll(/data="(\d{8})\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)"/g)].map((m) => [m[1], +m[2], +m[3], +m[4], +m[5], +m[6]]);
  const info = await get(`${API}/stock/${s.c}/integration`).catch(() => null);
  const ti = {}; for (const x of (info && info.totalInfos) || []) ti[x.code] = x.value;
  const flows = {}; let bd = '';
  for (let p = 0; p < 5; p++) {
    const rows = await get(`${API}/stock/${s.c}/trend?pageSize=60${bd ? '&bizdate=' + bd : ''}`).catch(() => []);
    if (!Array.isArray(rows) || !rows.length) break;
    for (const x of rows) flows[x.bizdate] = { f: n(x.foreignerPureBuyQuant), i: n(x.organPureBuyQuant), v: n(x.accumulatedTradingVolume) };
    const last = rows[rows.length - 1].bizdate;
    const dt = new Date(+last.slice(0, 4), +last.slice(4, 6) - 1, +last.slice(6, 8) - 1);
    bd = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
    if (rows.length < 60) break;
  }
  const d = { candles, flows, per: n(ti.per), pbr: n(ti.pbr), div: n(ti.dividendYieldRatio) };
  fs.writeFileSync(f, JSON.stringify(d));
  return d;
}

/* ── ① 자료 받기 ── */
const t0 = Date.now();
const list = await universe();
console.log('종목', list.length);
const data = new Array(list.length); let idx = 0, fail = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (idx < list.length) { const i = idx++; try { data[i] = await fetchOne(list[i]); } catch { fail++; } if (i % 500 === 0) console.log(`  자료 ${i}/${list.length} · ${Math.round((Date.now() - t0) / 1000)}초`); }
}));
console.log(`자료 완료 (실패 ${fail}) ${Math.round((Date.now() - t0) / 1000)}초`);

/* ── ② 날짜별 채점 (사이트·매일 채점과 같은 길: features → 그날 기준표 → score) ── */
// 기준 날짜 = 가장 많이 나온 날짜들 (미장은 종목마다 상장일·결측이 달라 최장 종목 하나로 잡지 않는다)
const cnt = new Map(); data.forEach((d) => d && d.candles.forEach((x) => cnt.set(x[0], (cnt.get(x[0]) || 0) + 1)));
const allDates = [...cnt.keys()].filter((k) => cnt.get(k) >= data.filter(Boolean).length * 0.3).sort();
const evalDates = [];
for (let k = WARM; k + HZ[1] < allDates.length; k += STEP) evalDates.push(allDates[k]);
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const rank = (a) => { const ix = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); ix.forEach((x, k) => { r[x[1]] = k; }); return r; };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sa && sb ? s / Math.sqrt(sa * sb) : 0; };
const idx2 = data.map((d) => d ? new Map(d.candles.map((x, i) => [x[0], i])) : null);
const fdates = data.map((d) => d ? Object.keys(d.flows).sort() : []);
const byDate = new Map();
for (const dt of evalDates) {
  const arr = [];
  data.forEach((d, si) => {
    if (!d) return; const i = idx2[si].get(dt); if (i == null || i < 120 || i + HZ[1] >= d.candles.length) return;
    const c = d.candles; const f = features({ candles: c.slice(Math.max(0, i - 260), i + 1), per: d.per, flows: fdates[si].filter((x) => x <= dt).slice(-20).map((x) => d.flows[x]) });
    if (!f || f.tv20 < MIN_TV) return;
    const fl = fdates[si].filter((x) => x <= dt).slice(-20).map((x) => d.flows[x]), sv = fl.reduce((s, x) => s + (x.v || 0), 0);
    const cc = c.map((x) => x[4]);
    arr.push({ f, px: c[i][4], f5: c[i + 5][4] / c[i][4] - 1, f20: c[i + H][4] / c[i][4] - 1,
      trend: cc[i] / mean(cc.slice(i - 59, i + 1)) - 1, mom: cc[i] / cc[i - 60] - 1, flow: sv ? fl.reduce((s, x) => s + (x.f || 0) + (x.i || 0), 0) / sv : null });
  });
  if (arr.length < 100) continue;
  const bp = breakpoints(arr.map((o) => o.f), US ? 'US' : undefined);
  arr.forEach((o) => { o.r = score(o.f, bp); });
  bp.cut = cuts(arr.map((o) => o.r.total));
  arr.forEach((o) => { o.r = score(o.f, bp); });
  const m5 = mean(arr.map((o) => o.f5)), m20 = mean(arr.map((o) => o.f20));
  arr.forEach((o) => { o.x5 = o.f5 - m5; o.x20 = o.f20 - m20; });
  byDate.set(dt, arr);
}
const dates = [...byDate.keys()].sort();
const nObs = dates.reduce((s, d) => s + byDate.get(d).length, 0);
console.log(`평가일 ${dates.length}개 (${dates[0]} ~ ${dates[dates.length - 1]}) · 관측 ${nObs.toLocaleString()}건`);

/* ── ③ 성적 ── */
const VIEWS = ['추천', '중립', '매수 금지'];
function report(ds) {
  const q = [[], [], [], [], []], g = { '추천': [], '중립': [], '매수 금지': [] }, wk = { '추천': [], '매수 금지': [] }, ics = [];
  for (const d of ds) {
    const a = byDate.get(d).slice().sort((p, r) => r.r.total - p.r.total);
    a.forEach((o, i) => { q[Math.min(4, Math.floor(i / a.length * 5))].push(o.x20); g[o.r.view].push(o); });
    for (const v of ['추천', '매수 금지']) wk[v].push(mean(a.filter((o) => o.r.view === v).map((o) => o.x20)));
    ics.push(corr(rank(a.map((o) => o.r.total)), rank(a.map((o) => o.x20))));
  }
  const icm = mean(ics), sd = Math.sqrt(mean(ics.map((x) => (x - icm) ** 2)));
  return { n: ds.length, from: ds[0], to: ds[ds.length - 1], q20: q.map((x) => +(mean(x) * 100).toFixed(2)),
    groups: Object.fromEntries(VIEWS.map((v) => [v, { x20: +(mean(g[v].map((o) => o.x20)) * 100).toFixed(2), x5: +(mean(g[v].map((o) => o.x5)) * 100).toFixed(2), n: Math.round(g[v].length / ds.length) }])),
    beatWeeks: { '추천': +(wk['추천'].filter((x) => x > 0).length / ds.length * 100).toFixed(0), '매수 금지': +(wk['매수 금지'].filter((x) => x < 0).length / ds.length * 100).toFixed(0) },
    ic: +icm.toFixed(3), icT: +(sd ? icm / sd * Math.sqrt(ics.length) : 0).toFixed(1) };
}
function factorIC(fx) { const v = (ds) => mean(ds.map((d) => { const a = byDate.get(d).filter((o) => fx(o) != null && isFinite(fx(o))); return corr(rank(a.map(fx)), rank(a.map((o) => o.x20))); }));
  const h = Math.floor(dates.length / 2); return { all: +v(dates).toFixed(3), first: +v(dates.slice(0, h)).toFixed(3), second: +v(dates.slice(h)).toFixed(3) }; }
const h = Math.floor(dates.length / 2);
const res = { v: 2, market: US ? 'US' : 'KR', updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), minTv: MIN_TV, horizon: H, step: STEP, nObs,
  formula: US ? '1년 모멘텀 67 · 흑자 33' : '안정성 40 · 고점 근접 30 · 이익 30', currency: US ? 'USD' : 'KRW', all: report(dates), first: report(dates.slice(0, h)), second: report(dates.slice(h)),
  factors: US ? [
    { nm: '1년 모멘텀(1년 전→한 달 전)', used: true, ...factorIC((o) => o.f.mom) },
    { nm: '흑자(PER 있음)', used: true, ...factorIC((o) => (o.f.ep > 0 ? 1 + Math.random() * 1e-9 : Math.random() * 1e-9)) },
    { nm: '안정성(20일 변동성 낮음)', used: false, ...factorIC((o) => -o.f.vol) },
    { nm: '52주 고점 근접', used: false, ...factorIC((o) => o.f.hiGap) },
    { nm: '이익 대비 주가(PER)', used: false, ...factorIC((o) => o.f.ep) },
    { nm: '추세(60일선 위)', used: false, ...factorIC((o) => o.trend) },
  ] : [
    { nm: '안정성(20일 변동성 낮음)', used: true, ...factorIC((o) => -o.f.vol) },
    { nm: '52주 고점 근접', used: true, ...factorIC((o) => o.f.hiGap) },
    { nm: '이익 대비 주가(PER)', used: true, ...factorIC((o) => o.f.ep) },
    { nm: '추세(60일선 위)', used: false, ...factorIC((o) => o.trend) },
    { nm: '60일 상승률', used: false, ...factorIC((o) => o.mom) },
    { nm: '외국인·기관 20일 순매수', used: false, ...factorIC((o) => o.flow) },
  ],
  limits: US ? ['흑자 여부는 과거 값이 없어 지금 PER 로 판단(미래 정보가 섞임)', '지금 상장된 종목만 — 상장폐지 종목 빠짐', '거래 비용·세금 미반영', '공식은 앞 1.5년으로 고름 — 뒤 1.5년이 확인 구간'] : ['PER 은 과거 값이 없어 현재 값으로 계산(미래 정보가 섞임)', '지금 상장된 종목만 — 상장폐지 종목 빠짐', '거래 비용·세금 미반영'] };
fs.writeFileSync(path.join(ROOT, `feeds/backtest${US ? '-us' : ''}${H === 20 ? '' : '-' + H}.json`), JSON.stringify(res, null, 1));
const P = (x) => (x >= 0 ? '+' : '') + x.toFixed(2) + '%';
for (const k of ['all', 'first', 'second']) { const r = res[k];
  console.log(`${k.padEnd(6)} ${r.from}~${r.to} 5분위 ${r.q20.map(P).join(' ')} | 추천 ${P(r.groups['추천'].x20)} (이긴 주 ${r.beatWeeks['추천']}%) 중립 ${P(r.groups['중립'].x20)} 매수금지 ${P(r.groups['매수 금지'].x20)} (진 주 ${r.beatWeeks['매수 금지']}%) | IC ${r.ic} t=${r.icT}`); }
res.factors.forEach((f) => console.log(`  ${f.used ? '●' : '○'} ${f.nm.padEnd(18)} IC ${f.all} (앞 ${f.first} · 뒤 ${f.second})`));
console.log(`총 ${Math.round((Date.now() - t0) / 1000)}초`);
