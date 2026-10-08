#!/usr/bin/env node
/* 매수·손절 가격 규칙 백테스트 — score-core.js 의 levels() 가 과거에 통했는지 잰다.
   매주 1번, 그날 '추천'(상위 20%) 종목마다 그날까지의 일봉으로 1차·2차·손절 가격을 정하고
   다음 날부터 20거래일 동안 지정가로 사고(1차 50% · 2차 50%), 손절가에 닿으면 판다. 20일째 종가에 정리.
   비교: 같은 종목을 다음 날 시가에 다 사서 20일 보유 / 같은 날 전 종목 평균.
   체결 가정: 시가가 지정가 이하면 시가에, 아니면 저가가 닿으면 지정가에. 같은 날 손절가도 닿으면 그날 손절(보수적).
   자료: scripts/backtest.mjs 가 받아 둔 캐시(BT_CACHE, 기본 /tmp/vantor-bt) — 없으면 먼저 그걸 돌린다.
   출력: feeds/backtest-levels.json, 화면 출력 표 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const V = require(path.join(ROOT, 'score-core.js'));
const CACHE = process.env.BT_CACHE || '/tmp/vantor-bt';
const MIN_TV = 5, STEP = 5, H = +(process.env.BT_H || 20); // BT_H=60 → 60거래일 보유 기준 (feeds/backtest-levels-60.json)

const files = fs.readdirSync(CACHE).filter((f) => f.endsWith('.json'));
if (files.length < 1000) { console.error('캐시가 없어요 — 먼저 node scripts/backtest.mjs'); process.exit(1); }
const data = files.map((f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'))).filter((d) => d.candles.length >= 200);
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const ref = data.reduce((a, d) => (d.candles.length > a.length ? d.candles : a), []).map((x) => x[0]);
const dates = []; for (let k = 160; k + H + 1 < ref.length; k += STEP) dates.push(ref[k]);
const idx = data.map((d) => new Map(d.candles.map((x, i) => [x[0], i])));

// ① 날짜마다 추천 종목 고르기 (사이트·매일 채점과 같은 길)
const picks = []; // {d, si, i}
const mkt = new Map(); // 날짜 → 전 종목 20일 보유 평균
for (const dt of dates) {
  const arr = [];
  data.forEach((d, si) => {
    const i = idx[si].get(dt); if (i == null || i < 120 || i + H + 1 >= d.candles.length) return;
    const f = V.features({ candles: d.candles.slice(Math.max(0, i - 249), i + 1), per: d.per });
    if (f && f.tv20 >= MIN_TV) arr.push({ si, i, f });
  });
  if (arr.length < 100) continue;
  const bp = V.breakpoints(arr.map((o) => o.f));
  arr.forEach((o) => { o.t = V.score(o.f, bp).total; });
  bp.cut = V.cuts(arr.map((o) => o.t));
  mkt.set(dt, mean(arr.map((o) => { const c = data[o.si].candles; return c[o.i + H][4] / (c[o.i + 1][1] || c[o.i + 1][4]) - 1; })));
  arr.filter((o) => o.t >= bp.cut.buy).forEach((o) => picks.push({ d: dt, si: o.si, i: o.i }));
}
console.log(`평가일 ${mkt.size}개 · 추천 종목-주 ${picks.length.toLocaleString()}건`);

// ② 한 건 모의매매
function sim(c, i, L) {
  const legs = [{ p: L.b1, w: 0.5, fill: null }, { p: L.b2, w: 0.5, fill: null }];
  let exit = null, stopped = false, stopDay = null;
  for (let k = i + 1; k <= i + H; k++) {
    const [, o0, h, l0, cl] = c[k]; const o = o0 > 0 ? o0 : cl, l = l0 > 0 ? l0 : Math.min(o, cl); // 시가·저가 0 = 거래 없던 날
    for (const g of legs) if (g.fill == null && l <= g.p) g.fill = o <= g.p ? o : g.p;
    const inPos = legs.some((g) => g.fill != null);
    if (inPos && L.st != null && l <= L.st) { exit = o <= L.st ? o : L.st; stopped = true; stopDay = k; break; }
  }
  if (exit == null) exit = c[i + H][4];
  const filled = legs.filter((g) => g.fill != null), w = filled.reduce((s, g) => s + g.w, 0);
  const ret = w ? filled.reduce((s, g) => s + g.w * (exit / g.fill - 1), 0) / w : null; // 들어간 돈 기준
  return { f1: legs[0].fill != null, f2: legs[1].fill != null, w, ret, alloc: ret == null ? 0 : ret * w, stopped,
    recovered: stopped ? c[i + H][4] > L.st : null };
}

// ③ 규칙 후보
const RULES = [
  { key: 'adopt', nm: '채택 규칙 (1차 60일선 · 2차 매물대 · 손절 2차−2ATR)', o: {}, adopt: true },
  { key: 'ma20', nm: '1차 20일선 · 손절 2차−2ATR (10/8 오후 규칙)', o: { b1: 'ma20' } },
  { key: 'ma20s1', nm: '1차 20일선 · 손절 2차−1ATR (10/8 첫 규칙)', o: { b1: 'ma20', stopAtr: 1 } },
  { key: 'stop1', nm: '손절 2차−1ATR', o: { stopAtr: 1 } },
  { key: 'stop15', nm: '손절 2차−1.5ATR', o: { stopAtr: 1.5 } },
  { key: 'stop3', nm: '손절 2차−3ATR', o: { stopAtr: 3 } },
  { key: 'nostop', nm: '손절 없음', o: { stopAtr: 0 } },
  { key: 'mkt1', nm: '1차 = 다음 날 시가(바로 매수) · 손절 2차−1ATR', o: { b1: 'now', stopAtr: 1 } },
  { key: 'mkt1s2', nm: '1차 = 다음 날 시가 · 손절 2차−2ATR', o: { b1: 'now', stopAtr: 2 } },
  { key: 'mkt1ns', nm: '1차 = 다음 날 시가 · 손절 없음', o: { b1: 'now', stopAtr: 0 } },
];
function run(rule, sel) {
  const r = [];
  for (const p of sel) {
    const c = data[p.si].candles, L = V.levels(c.slice(Math.max(0, p.i - 249), p.i + 1), rule.o); if (!L) continue;
    if (rule.o.b1 === 'now') L.b1 = (c[p.i + 1][1] || c[p.i + 1][4]) * 1.0001; // 다음 날 시가에 바로 체결
    const s = sim(c, p.i, L); s.hold = c[p.i + H][4] / (c[p.i + 1][1] || c[p.i + 1][4]) - 1; s.m = mkt.get(p.d); r.push(s);
  }
  const inv = r.filter((s) => s.ret != null), st = r.filter((s) => s.stopped);
  return { key: rule.key, nm: rule.nm, adopt: !!rule.adopt, n: r.length,
    fill1: +(mean(r.map((s) => (s.f1 ? 1 : 0))) * 100).toFixed(0), fill2: +(mean(r.map((s) => (s.f2 ? 1 : 0))) * 100).toFixed(0),
    noFill: +(mean(r.map((s) => (s.w ? 0 : 1))) * 100).toFixed(0), stopRate: +(mean(r.map((s) => (s.stopped ? 1 : 0))) * 100).toFixed(0),
    recovered: st.length ? +(mean(st.map((s) => (s.recovered ? 1 : 0))) * 100).toFixed(0) : null,
    retInv: +(mean(inv.map((s) => s.ret)) * 100).toFixed(2), win: +(mean(inv.map((s) => (s.ret > 0 ? 1 : 0))) * 100).toFixed(0),
    worst5: +(inv.map((s) => s.ret).sort((a, b) => a - b)[Math.floor(inv.length * 0.05)] * 100).toFixed(1),
    retAlloc: +(mean(r.map((s) => s.alloc)) * 100).toFixed(2), hold: +(mean(r.map((s) => s.hold)) * 100).toFixed(2), mkt: +(mean(r.map((s) => s.m)) * 100).toFixed(2) };
}
const ds = [...mkt.keys()].sort(), half = ds[Math.floor(ds.length / 2)];
const res = { v: 1, updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), horizon: H, period: [ds[0], ds[ds.length - 1]], nPicks: picks.length,
  rules: RULES.map((rule) => ({ ...run(rule, picks), first: run(rule, picks.filter((p) => p.d < half)), second: run(rule, picks.filter((p) => p.d >= half)) })) };
fs.writeFileSync(path.join(ROOT, H === 20 ? 'feeds/backtest-levels.json' : `feeds/backtest-levels-${H}.json`), JSON.stringify(res, null, 1));
const P = (x) => (x >= 0 ? '+' : '') + x.toFixed(2) + '%';
console.log(`기준: 같은 추천 종목을 다음 날 시가에 사서 ${H}일 보유 ${P(res.rules[0].hold)} · 같은 날 전 종목 평균 ${P(res.rules[0].mkt)}\n`);
console.log('규칙'.padEnd(34), '1차체결 2차체결 미체결 손절 손절후회복 | 들어간돈수익 승률 하위5% | 배정돈수익 | 앞절반 뒤절반');
for (const r of res.rules) console.log(r.nm.slice(0, 32).padEnd(34), `${r.fill1}%`.padStart(5), `${r.fill2}%`.padStart(6), `${r.noFill}%`.padStart(6), `${r.stopRate}%`.padStart(5), (r.recovered == null ? '—' : r.recovered + '%').padStart(7), '|', P(r.retInv).padStart(7), `${r.win}%`.padStart(4), `${r.worst5}%`.padStart(7), '|', P(r.retAlloc).padStart(7), '|', P(r.first.retInv), P(r.second.retInv));
