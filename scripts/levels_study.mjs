#!/usr/bin/env node
/* 매수·손절·목표가 규칙 스터디 + 종목별 예상 모델 — 매주 토요일 자동(.github/workflows/levels-study.yml), 2026-10-13 사용자 결정(전부 자동).
   ① 과거 3년, 매주 그날의 '추천 목록에 오를 종목'(국장: 추천 · 거래대금 50억↑ · 하락 추세 제외 / 미장: 추천)을 고른다.
   ② 규칙 후보(1차 기준 × 손절 폭 × 목표가)마다 60거래일 모의매매(score-core.js simulate) → 자금 회전 기준 수익(배정 돈 수익 ÷ 평균 보유일 × 60).
      목표가 없는 '60일 보유'는 후보에서 뺀다 — 목표가에 닿으면 판다(2026-10-13 사용자 결정).
   ③ 앞 절반 기간으로 1등을 고르고, 뒤 절반에서도 지금 규칙보다 0.1%p 이상 나을 때만 바꾼다 (전부 자동, 과적합 방지 장치).
   ④ 고른 규칙으로 변동성 5구간별 예상(1차 체결·목표 도달·손절·평균 수익)과 60일 가격 경로 분위(10·25·50·75·90%)를 만든다.
      → 종목마다 그날 가격·ATR 로 바꿔 '예상 수익'과 '예상 경로'를 붙인다 (scripts/score_all.mjs).
   출력: feeds/levels-model(-us).json (규칙·예상·경로·변경 기록) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const V = require(path.join(ROOT, 'score-core.js'));
const US = process.env.MKT === 'US';
const API = 'https://m.stock.naver.com/api', UAPI = 'https://api.stock.naver.com';
const CACHE = process.env.LS_CACHE || (US ? '/tmp/vantor-ls-us' : '/tmp/vantor-ls');
const DAYS = 800, H = 60, STEP = 5, WARM = 260, MIN_TV = US ? 0.1 : 5, PICK_TV = US ? 0.1 : 50, NO_DOWN = !US;
const OUT = path.join(ROOT, `feeds/levels-model${US ? '-us' : ''}.json`);
const DS = [1, 2, 3, 5, 10, 15, 20, 30, 40, 50, 60], QS = [0.1, 0.25, 0.5, 0.75, 0.9];
fs.mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(u, t) { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return t ? await r.text() : await r.json(); } catch (e) { if (i === 2) throw e; await sleep(1500 * (i + 1)); } } }
const n = (s) => { if (s == null) return null; const m = String(s).replace(/,/g, '').match(/-?[\d.]+/); return m ? +m[0] : null; };
const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, '');

async function universe() {
  const out = [];
  const mkts = US ? ['NASDAQ', 'NYSE', 'AMEX'] : ['KOSPI', 'KOSDAQ'];
  for (const mkt of mkts) for (let p = 1; ; p++) {
    const d = await get(US ? `${UAPI}/stock/exchange/${mkt}/marketValue?page=${p}&pageSize=100` : `${API}/stocks/marketValue/${mkt}?page=${p}&pageSize=100`);
    for (const s of d.stocks || []) if (s.stockEndType === 'stock') out.push(US ? s.reutersCode : s.itemCode);
    if (p * 100 >= +(d.totalCount || 0) || !(d.stocks || []).length) break;
  }
  return out.filter(Boolean);
}
async function one(c) {
  const f = path.join(CACHE, c + '.json');
  if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 20 * 864e5) return JSON.parse(fs.readFileSync(f, 'utf8'));
  let d;
  if (US) {
    const rows = await get(`${UAPI}/chart/foreign/item/${c}/day?startDateTime=${ymd(new Date(Date.now() - 1210 * 864e5))}0000&endDateTime=${ymd(new Date())}2359`);
    const b = await get(`${UAPI}/stock/${c}/basic`).catch(() => null); const ti = {}; for (const x of (b && b.stockItemTotalInfos) || []) ti[x.code] = x.value;
    d = { candles: (Array.isArray(rows) ? rows : []).map((x) => [x.localDate, +x.openPrice, +x.highPrice, +x.lowPrice, +x.closePrice, +x.accumulatedTradingVolume]).slice(-DAYS), per: n(ti.per) };
  } else {
    const xml = await get(`https://fchart.stock.naver.com/sise.nhn?symbol=${c}&timeframe=day&count=${DAYS}&requestType=0`, true);
    const info = await get(`${API}/stock/${c}/integration`).catch(() => null); const ti = {}; for (const x of (info && info.totalInfos) || []) ti[x.code] = x.value;
    d = { candles: [...xml.matchAll(/data="(\d{8})\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)"/g)].map((m) => [m[1], +m[2], +m[3], +m[4], +m[5], +m[6]]), per: n(ti.per) };
  }
  fs.writeFileSync(f, JSON.stringify(d)); return d;
}

const t0 = Date.now();
const list = await universe(); console.log('종목', list.length);
const data = new Array(list.length); let k = 0;
await Promise.all(Array.from({ length: 10 }, async () => { while (k < list.length) { const i = k++; try { data[i] = await one(list[i]); } catch { /* 건너뜀 */ } } }));
const D = data.filter((d) => d && d.candles.length >= 300);
console.log(`자료 ${D.length} · ${Math.round((Date.now() - t0) / 1000)}초`);
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const q = (a, p) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1)))]; };
const cnt = new Map(); D.forEach((d) => d.candles.forEach((x) => cnt.set(x[0], (cnt.get(x[0]) || 0) + 1)));
const ref = [...cnt.keys()].filter((x) => cnt.get(x) >= D.length * 0.3).sort();
const idx = D.map((d) => new Map(d.candles.map((x, i) => [x[0], i])));

// ① 날짜마다 추천 목록에 오를 종목
const picks = [];
for (let j = WARM; j + H + 1 < ref.length; j += STEP) {
  const dt = ref[j], arr = [];
  D.forEach((d, si) => { const i = idx[si].get(dt); if (i == null || i < 250 || i + H + 1 >= d.candles.length) return;
    const f = V.features({ candles: d.candles.slice(Math.max(0, i - 260), i + 1), per: d.per }); if (f && f.tv20 >= MIN_TV) arr.push({ si, i, f }); });
  if (arr.length < 100) continue;
  const bp = V.breakpoints(arr.map((o) => o.f), US ? 'US' : undefined); arr.forEach((o) => { o.t = V.score(o.f, bp).total; }); bp.cut = V.cuts(arr.map((o) => o.t));
  arr.filter((o) => o.t >= bp.cut.buy && o.f.tv20 >= PICK_TV && !(NO_DOWN && o.f.trend === '하락 추세')).forEach((o) => picks.push({ d: dt, si: o.si, i: o.i }));
}
const ds = [...new Set(picks.map((p) => p.d))].sort(), half = ds[Math.floor(ds.length / 2)];
console.log(`평가 주 ${ds.length} (${ds[0]}~${ds[ds.length - 1]}) · 추천 ${picks.length.toLocaleString()}건`);

// ② 규칙 후보
const RULES = [];
for (const b1 of ['ma60', 'ma20']) for (const stopAtr of [1.5, 2, 3]) for (const t of ['vp', 'hi52', 'atr2', 'atr3', 'atr4', 'atr6']) {
  const o = { b1, stopAtr }; if (t) { if (t.startsWith('atr')) { o.tgt = 'atr'; o.tgK = +t.slice(3); } else { o.tgt = t; o.tgK = 4; } }
  RULES.push({ key: `${b1}|s${stopAtr}|${t || 'hold'}`, o });
}
const lv = (p, o) => { const c = D[p.si].candles; return V.levels(c.slice(Math.max(0, p.i - 249), p.i + 1), US ? { ...o, usd: true } : o); };
function run(o, sel) {
  const r = [];
  for (const p of sel) { const L = lv(p, o); if (!L) continue; r.push(V.simulate(D[p.si].candles, p.i, L, H)); }
  const inv = r.filter((s) => s.ret != null);
  return { n: r.length, alloc: mean(r.map((s) => s.alloc)), ret: mean(inv.map((s) => s.ret)), win: mean(inv.map((s) => (s.ret > 0 ? 1 : 0))),
    eff: mean(r.map((s) => s.alloc)) * H / (mean(r.map((s) => (s.ret == null ? H : s.day))) || H), // 자금 회전 기준: 60일로 환산한 배정 돈 수익 (목표가로 일찍 팔면 그 돈을 다시 쓴다)
    fill1: mean(r.map((s) => (s.f1 ? 1 : 0))), hit: mean(inv.map((s) => (s.hit ? 1 : 0))), stop: mean(inv.map((s) => (s.stopped ? 1 : 0))), day: q(inv.map((s) => s.day), 0.5) };
}
const A = picks.filter((p) => p.d < half), B = picks.filter((p) => p.d >= half);
const res = RULES.map((R) => ({ key: R.key, o: R.o, first: run(R.o, A), second: run(R.o, B) }));
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const curKey = prev ? prev.rule.key : 'ma60|s2|atr4'; // 처음 = 지금까지 쓰던 규칙(1차 60일선·손절 2ATR)에 목표 1차+4ATR
const cur = res.find((r) => r.key === curKey) || res.find((r) => r.key === 'ma60|s2|atr4');
const best = res.slice().sort((a, b) => b.first.eff - a.first.eff)[0];
const adopt = best.key !== cur.key && best.second.eff >= cur.second.eff + 0.001;
const chosen = adopt ? best : cur;
const P = (x) => x == null ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
res.sort((a, b) => b.first.eff - a.first.eff).slice(0, 12).forEach((r) => console.log(r.key.padEnd(18), '앞', P(r.first.eff), '뒤', P(r.second.eff), `| 수익 ${P(r.second.ret)} 승률 ${(r.second.win * 100).toFixed(0)}% 목표 ${(r.second.hit * 100).toFixed(0)}% 손절 ${(r.second.stop * 100).toFixed(0)}% 보유 ${r.second.day}일`));
console.log(`지금 ${cur.key} (뒤 ${P(cur.second.eff)}) → 1등 ${best.key} (뒤 ${P(best.second.eff)}) → ${adopt ? '변경' : '유지'}`);

// ④ 고른 규칙으로 변동성 구간별 예상 + 경로 분위
const rows = [];
for (const p of picks) { const c = D[p.si].candles, L = lv(p, chosen.o); if (!L) continue; const s = V.simulate(c, p.i, L, H), px0 = c[p.i][4], ap = L.atr / px0;
  rows.push({ d: p.d, ap, s, z: DS.map((d) => (c[p.i + d][4] / px0 - 1) / ap) }); }
const vcut = [0.2, 0.4, 0.6, 0.8].map((x) => q(rows.map((r) => r.ap), x));
const bucket = (ap) => vcut.filter((v) => ap > v).length;
const model = [0, 1, 2, 3, 4].map((b) => { const g = rows.filter((r) => bucket(r.ap) === b), inv = g.filter((r) => r.s.ret != null);
  return { n: g.length, fill1: mean(g.map((r) => (r.s.f1 ? 1 : 0))), hit: mean(inv.map((r) => (r.s.hit ? 1 : 0))), stop: mean(inv.map((r) => (r.s.stopped ? 1 : 0))),
    ret: mean(inv.map((r) => r.s.ret)), win: mean(inv.map((r) => (r.s.ret > 0 ? 1 : 0))), alloc: mean(g.map((r) => r.s.alloc)), day: q(inv.map((r) => r.s.day), 0.5),
    path: DS.map((_, di) => QS.map((qq) => +q(g.map((r) => r.z[di]), qq).toFixed(3))) }; });
const rowsA = rows.filter((r) => r.d < half), rowsB = rows.filter((r) => r.d >= half);
// 스스로 보정: 뒤 절반에서 10~90% 칸 적중이 80% 가 되도록 경로 폭을 넓히거나 좁힌다 (가운데 50% 는 그대로) → 아래 model.path 에 반영
let widen = 1, bestGap = 9;
for (let f = 0.8; f <= 1.61; f += 0.05) { let n = 0, in80 = 0;
  for (let b = 0; b < 5; b++) DS.forEach((d, di) => { const g = rowsA.filter((r) => bucket(r.ap) === b).map((r) => r.z[di]); if (!g.length) return; const m = q(g, 0.5), lo = m + (q(g, 0.1) - m) * f, hi = m + (q(g, 0.9) - m) * f;
    rowsB.filter((r) => bucket(r.ap) === b).forEach((r) => { n++; if (r.z[di] >= lo && r.z[di] <= hi) in80++; }); });
  const gap = Math.abs(in80 / n - 0.8); if (gap < bestGap) { bestGap = gap; widen = +f.toFixed(2); } }
// 경로 예상이 맞는지 미리 검사 — 앞 절반으로 만든 경로로 뒤 절반을 맞춰 본다 (잘 맞으면 25~75% 칸 50% · 10~90% 칸 80%)
const calib = DS.map((d, di) => { let n = 0, in50 = 0, in80 = 0, up = 0;
  for (let b = 0; b < 5; b++) { const g = rowsA.filter((r) => bucket(r.ap) === b).map((r) => r.z[di]); if (!g.length) continue; const m0 = q(g, 0.5), Q = QS.map((qq) => m0 + (q(g, qq) - m0) * widen); // 보정한 폭으로 검사
    rowsB.filter((r) => bucket(r.ap) === b).forEach((r) => { const z = r.z[di]; n++; if (z >= Q[1] && z <= Q[3]) in50++; if (z >= Q[0] && z <= Q[4]) in80++; if (z > Q[2]) up++; }); }
  return { d, n, in50: +(in50 / n).toFixed(3), in80: +(in80 / n).toFixed(3), up: +(up / n).toFixed(3) }; });
// 실제 기록으로 한 번 더 배우기 — 사이트에 낸 추천의 실제 경로 적중(scripts/track.mjs eval → track-summary.path)이 20거래일 기준 100건 넘게 쌓이면
//   넓은 범위 적중이 75% 미만이면 10% 넓히고, 85% 초과면 10% 좁힌다.
let realAcc = null;
try { const ts = JSON.parse(fs.readFileSync(path.join(ROOT, US ? 'feeds/track-summary-us.json' : 'feeds/track-summary.json'), 'utf8')); realAcc = (ts.path || []).find((x) => x.d === 20 && x.n >= 100) || null; } catch { /* 기록 없음 */ }
if (realAcc) { if (realAcc.in80 < 0.75) widen = +(widen * 1.1).toFixed(2); else if (realAcc.in80 > 0.85) widen = +(widen * 0.9).toFixed(2); console.log(`실제 기록 20일 넓은 범위 적중 ${(realAcc.in80 * 100).toFixed(0)}% (${realAcc.n}건) → 폭 ×${widen}`); }
model.forEach((m) => { m.path = m.path.map((qs) => qs.map((z, j) => +(qs[2] + (z - qs[2]) * widen).toFixed(3))); });
console.log('경로 폭 보정 ×' + widen);
console.log('경로 검사(뒤 절반, 보정 후):', calib.filter((c) => [5, 20, 60].includes(c.d)).map((c) => `${c.d}일 25~75% ${(c.in50 * 100).toFixed(0)}% · 10~90% ${(c.in80 * 100).toFixed(0)}%`).join(' | '));
const r4 = (x) => x == null ? null : +x.toFixed(4);
const hist = (prev && prev.history) || [];
if (!prev || adopt) hist.push({ d: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), key: chosen.key, why: !prev ? '처음 기록' : `${cur.key} → ${best.key}: 뒤 절반 60일 환산 수익 ${P(cur.second.eff)} → ${P(best.second.eff)}` });
const out = { v: 1, market: US ? 'US' : 'KR', updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '), horizon: H, period: [ds[0], ds[ds.length - 1]], nPicks: picks.length,
  rule: { key: chosen.key, o: chosen.o, first: chosen.first, second: chosen.second }, changed: adopt, prevKey: adopt ? cur.key : null,
  calib, widen, realAcc, vcut: vcut.map(r4), days: DS, qs: QS, model: model.map((m) => ({ ...m, fill1: r4(m.fill1), hit: r4(m.hit), stop: r4(m.stop), ret: r4(m.ret), win: r4(m.win), alloc: r4(m.alloc) })),
  candidates: res.slice(0, 12).map((r) => ({ key: r.key, first: r4(r.first.eff), second: r4(r.second.eff), alloc: r4(r.second.alloc), ret: r4(r.second.ret), win: r4(r.second.win), hit: r4(r.second.hit), stop: r4(r.second.stop), day: r.second.day })),
  history: hist.slice(-24) };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('저장', OUT, `${Math.round((Date.now() - t0) / 1000)}초`);
