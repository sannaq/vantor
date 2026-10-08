#!/usr/bin/env node
/* 실제 성과 기록 — 백테스트가 아니라 '그날 실제로 낸 추천'이 그 뒤 어떻게 됐는지 쌓는다.
   record: 평일 장마감 채점(score_all.mjs) 직후, 그날 거래 활발 종목·추천·매수 금지와 추천 종목의 1차·2차·손절 가격을
           feeds/track/<YYYYMM>.json 에 남긴다. 이미 있는 날짜는 덮지 않는다(기록은 고치지 않는다).
   eval:   기록된 날마다 20·60거래일이 지났으면, 다음 날 시가에 사서 그날 종가까지의 실제 수익률을
           같은 날 거래 활발 종목 평균과 비교하고, 추천 종목은 1차·2차·손절 규칙대로 모의매매(score-core.js simulate)한다.
           → feeds/track-summary.json (사이트 추천 화면 '실제 성과')
   사용: node scripts/track.mjs record | eval */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const V = require(path.join(ROOT, 'score-core.js'));
const DIR = path.join(ROOT, 'feeds/track');
const MIN_TV = 5, HS = [20, 60], CONC = 8;
fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function candles(code, count) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${count}&requestType=0`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      return [...t.matchAll(/data="(\d{8})\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)"/g)].map((m) => [m[1], +m[2], +m[3], +m[4], +m[5], +m[6]]);
    } catch { await sleep(1500 * (i + 1)); }
  }
  return [];
}
async function pool(items, fn) { const out = new Map(); let k = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (k < items.length) { const x = items[k++]; out.set(x, await fn(x)); } })); return out; }
// 결과가 나오는 날(어림): 마지막 거래일에서 남은 거래일 수만큼 평일을 더한다 (공휴일 미반영)
function dueDate(from, n) { const t = new Date(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6, 8)); while (n > 0) { t.setDate(t.getDate() + 1); if (t.getDay() % 6) n--; }
  return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`; }
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const loadAll = () => fs.readdirSync(DIR).filter((f) => /^\d{6}\.json$/.test(f)).sort()
  .flatMap((f) => Object.entries(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).days || {}));

async function record() {
  const sc = JSON.parse(fs.readFileSync(path.join(ROOT, 'feeds/stock-scores.json'), 'utf8'));
  const d = sc.date, file = path.join(DIR, d.slice(0, 6) + '.json');
  const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { days: {} };
  if (cur.days[d]) { console.log('이미 기록됨', d); return; }
  const liq = Object.entries(sc.items).filter(([, it]) => (it[6] ?? 0) >= MIN_TV);
  const buys = liq.filter(([, it]) => it[1] === '추천'), bans = liq.filter(([, it]) => it[1] === '매수 금지');
  const cs = await pool(buys.map(([c]) => c), (c) => candles(c, 250));
  const b = buys.map(([c, it]) => { const L = V.levels(cs.get(c) || []); return [c, it[0], L ? L.b1 : null, L ? L.b2 : null, L ? L.st : null]; });
  cur.days[d] = { u: liq.map(([c]) => c), b, n: bans.map(([c, it]) => [c, it[0]]), formula: 'v2 안정성40·고점근접30·이익30 · 1차60일선·2차매물대·손절2차−2ATR' };
  fs.writeFileSync(file, JSON.stringify(cur));
  console.log(`기록 ${d}: 거래 활발 ${liq.length} · 추천 ${b.length} · 매수 금지 ${bans.length}`);
}

async function evaluate() {
  const days = loadAll();
  if (!days.length) { console.log('기록 없음'); return; }
  const ref = await candles('005930', 200), td = ref.map((x) => x[0]);
  const codes = [...new Set(days.flatMap(([, x]) => x.u))];
  const cs = await pool(codes, (c) => candles(c, 200));
  const cohorts = [];
  for (const [d, x] of days) {
    const k0 = td.indexOf(d), co = { d, nU: x.u.length, nB: x.b.length, nN: x.n.length };
    for (const H of HS) {
      if (k0 < 0 || k0 + H >= td.length) { co['h' + H] = { due: dueDate(k0 < 0 ? d : td[td.length - 1], k0 < 0 ? H : k0 + H - (td.length - 1)), pending: true }; continue; }
      const end = td[k0 + H];
      const ret = (c) => { const a = cs.get(c) || [], i = a.findIndex((v) => v[0] === d), j = a.findIndex((v) => v[0] === end);
        if (i < 0 || j < 0 || i + 1 > j) return null; const o = a[i + 1][1] || a[i + 1][4]; return o ? a[j][4] / o - 1 : null; };
      const all = x.u.map(ret).filter((v) => v != null), m = mean(all);
      const rb = x.b.map((b) => ret(b[0])).filter((v) => v != null), rn = x.n.map((b) => ret(b[0])).filter((v) => v != null);
      const sims = x.b.map(([c, , b1, b2, st]) => { const a = cs.get(c) || [], i = a.findIndex((v) => v[0] === d);
        if (b1 == null || i < 0 || i + H >= a.length) return null; return V.simulate(a, i, { b1, b2, st }, H); }).filter(Boolean);
      const inv = sims.filter((s) => s.ret != null);
      co['h' + H] = { end, mkt: m, buy: mean(rb) - m, ban: mean(rn) - m, buyAbs: mean(rb), banAbs: mean(rn),
        lv: { n: sims.length, fill1: mean(sims.map((s) => (s.f1 ? 1 : 0))), stop: mean(sims.map((s) => (s.stopped ? 1 : 0))), ret: mean(inv.map((s) => s.ret)), win: mean(inv.map((s) => (s.ret > 0 ? 1 : 0))) } };
    }
    cohorts.push(co);
  }
  const agg = {};
  for (const H of HS) {
    const done = cohorts.map((c) => c['h' + H]).filter((h) => h && !h.pending);
    agg['h' + H] = { n: done.length, buy: mean(done.map((h) => h.buy)), ban: mean(done.map((h) => h.ban)),
      beat: done.length ? done.filter((h) => h.buy > 0).length / done.length : null, banLose: done.length ? done.filter((h) => h.ban < 0).length / done.length : null,
      lvRet: mean(done.map((h) => h.lv.ret).filter((v) => v != null)), lvStop: mean(done.map((h) => h.lv.stop).filter((v) => v != null)),
      next: (cohorts.map((c) => c['h' + H]).find((h) => h && h.pending && h.due) || {}).due || null };
  }
  const out = { updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '), start: days[0][0], days: days.length, agg, cohorts: cohorts.slice(-120) };
  fs.writeFileSync(path.join(ROOT, 'feeds/track-summary.json'), JSON.stringify(out));
  console.log(`기록 ${days.length}일 (${out.start}~) · 20일 결과 ${agg.h20.n}건 · 60일 결과 ${agg.h60.n}건`);
}

const mode = process.argv[2];
if (mode === 'record') await record(); else if (mode === 'eval') await evaluate(); else { console.error('사용: node scripts/track.mjs record | eval'); process.exit(1); }
