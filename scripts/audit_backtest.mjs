#!/usr/bin/env node
/* 백테스트 점검 — "검증 결과가 착시는 아닌가" 를 따로 잰다. (scripts/backtest.mjs 캐시 사용)
   ① 진입 시점: 채점한 날 종가 대신 '다음 날 시가'에 산다고 보면 결과가 유지되나
   ② 거래 비용: 왕복 0.25%(세금 0.18% + 수수료·슬리피지) 를 빼도 남나
   ③ 미래 정보: PER 은 현재 값이라 미래가 섞인다 → PER 빼고 안정성·고점 근접만으로도 통하나
   ④ 겹침 착시: 60일 보유를 매주 재면 기간이 겹쳐 통계가 부풀려진다 → 겹치지 않게 60일마다만 잰 결과
   ⑤ 무작위 대조: 점수를 무작위로 섞었을 때(1,000번) 지금만큼 차이가 날 확률 (p값)
   ⑥ 달별 일관성: 매달 추천−매수 금지 차이가 플러스였던 달의 비율
   출력: feeds/backtest-audit.json + 화면 표 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const V = require(path.join(ROOT, 'score-core.js'));
const CACHE = process.env.BT_CACHE || '/tmp/vantor-bt';
const MIN_TV = 5, COST = 0.0025;
const data = fs.readdirSync(CACHE).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'))).filter((d) => d.candles.length >= 200);
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const ref = data.reduce((a, d) => (d.candles.length > a.length ? d.candles : a), []).map((x) => x[0]);
const idx = data.map((d) => new Map(d.candles.map((x, i) => [x[0], i])));
const op = (c, k) => c[k][1] > 0 ? c[k][1] : c[k][4];

function cross(dt, H, opt) { // 그날 채점 → 각 종목 {view, ret(다음 날 시가→H일 뒤 종가), retClose(그날 종가→H일 뒤 종가)}
  const arr = [];
  data.forEach((d, si) => {
    const i = idx[si].get(dt); if (i == null || i < 120 || i + H + 1 >= d.candles.length) return;
    const c = d.candles, f = V.features({ candles: c.slice(Math.max(0, i - 249), i + 1), per: opt.noPer ? null : d.per });
    if (!f || f.tv20 < MIN_TV) return;
    if (opt.noPer) { f.ep = 0; f.per = 0; } // 이익 항목을 모두 같게 → 안정성·고점 근접만으로 순위
    arr.push({ f, ret: c[i + H][4] / op(c, i + 1) - 1, retClose: c[i + H][4] / c[i][4] - 1 });
  });
  if (arr.length < 100) return null;
  const bp = V.breakpoints(arr.map((o) => o.f));
  arr.forEach((o) => { o.t = V.score(o.f, bp).total; });
  bp.cut = V.cuts(arr.map((o) => o.t));
  arr.forEach((o) => { o.view = V.score(o.f, bp).view; });
  return arr;
}
function measure(H, step, opt = {}) {
  const ds = []; for (let k = +(process.env.BT_WARM || 160); k + H + 1 < ref.length; k += step) ds.push(ref[k]);
  const rows = [];
  for (const dt of ds) {
    const a = cross(dt, H, opt); if (!a) continue;
    const key = opt.close ? 'retClose' : 'ret', m = mean(a.map((o) => o[key]));
    const g = (v) => mean(a.filter((o) => o.view === v).map((o) => o[key] - (opt.cost && v === '추천' ? COST : 0))) - m;
    rows.push({ d: dt, buy: g('추천'), ban: g('매수 금지'), arr: a, key });
  }
  return rows;
}
const P = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%p';
function summary(rows) {
  const buy = mean(rows.map((r) => r.buy)), ban = mean(rows.map((r) => r.ban)), spread = rows.map((r) => r.buy - r.ban);
  const ms = mean(spread), sd = Math.sqrt(mean(spread.map((x) => (x - ms) ** 2)));
  return { n: rows.length, buy, ban, spread: ms, t: sd ? ms / sd * Math.sqrt(spread.length) : 0, posShare: spread.filter((x) => x > 0).length / spread.length };
}
function permP(rows, iters = 1000) { // 날짜마다 '추천·매수 금지' 꼬리표를 무작위로 섞어 같은 개수로 다시 뽑는다
  const real = summary(rows).spread; let hit = 0;
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let it = 0; it < iters; it++) {
    const sp = rows.map((r) => { const a = r.arr, nb = a.filter((o) => o.view === '추천').length, nn = a.filter((o) => o.view === '매수 금지').length;
      const sh = a.map((o) => o[r.key]); for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
      return mean(sh.slice(0, nb)) - mean(sh.slice(nb, nb + nn)); });
    if (mean(sp) >= real) hit++;
  }
  return hit / iters;
}
function monthly(rows) { const by = {}; rows.forEach((r) => { (by[r.d.slice(0, 6)] ??= []).push(r.buy - r.ban); });
  const ms = Object.entries(by).map(([m, v]) => [m, mean(v)]); return { months: ms.length, pos: ms.filter((x) => x[1] > 0).length, list: ms.map(([m, v]) => [m, +(v * 100).toFixed(2)]) }; }

const out = { updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), checks: [] };
const add = (nm, H, rows, note) => { const s = summary(rows); out.checks.push({ nm, H, note, n: s.n, buy: +(s.buy * 100).toFixed(2), ban: +(s.ban * 100).toFixed(2), spread: +(s.spread * 100).toFixed(2), t: +s.t.toFixed(1), posShare: Math.round(s.posShare * 100) });
  console.log(`${nm.padEnd(30)} ${String(H).padStart(2)}일 · ${String(s.n).padStart(2)}회 | 추천 ${P(s.buy)} · 매수 금지 ${P(s.ban)} · 차이 ${P(s.spread)} t=${s.t.toFixed(1)} · 차이 플러스 ${Math.round(s.posShare * 100)}%`); return rows; };

for (const H of [20, 60]) {
  add('기준 (그날 종가 진입)', H, measure(H, 5, { close: true }), '사이트 검증 칸과 같은 방식');
  const nx = add('① 다음 날 시가 진입', H, measure(H, 5), '실제로 살 수 있는 가격');
  add('② ① + 거래 비용 0.25%', H, measure(H, 5, { cost: true }), '추천 쪽에만 비용(매수 금지는 안 사므로)');
  add('③ PER 빼고 (미래 정보 제거)', H, measure(H, 5, { noPer: true }), '안정성·고점 근접만');
  const nov = add('④ 겹치지 않게', H, measure(H, H), `${H}일마다 한 번만`);
  const p = permP(nx, 1000); out.checks.push({ nm: '⑤ 무작위 대조 p값', H, p }); console.log(`⑤ 무작위로 섞었을 때 이만큼 차이 날 확률 (${H}일): ${(p * 100).toFixed(1)}%`);
  const mo = monthly(nx); out.checks.push({ nm: '⑥ 달별 일관성', H, ...mo }); console.log(`⑥ 달별: ${mo.pos}/${mo.months}달 추천이 매수 금지보다 나음 — ${mo.list.map((x) => x[0].slice(2) + ':' + (x[1] >= 0 ? '+' : '') + x[1]).join(' ')}\n`);
}
fs.writeFileSync(path.join(ROOT, 'feeds/backtest-audit.json'), JSON.stringify(out, null, 1));
