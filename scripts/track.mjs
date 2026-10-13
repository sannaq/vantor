#!/usr/bin/env node
/* 실제 성과 기록 — 백테스트가 아니라 '그날 실제로 낸 추천'이 그 뒤 어떻게 됐는지 쌓는다.
   record: 평일 장마감 채점(score_all.mjs) 직후, 그날 거래 활발 종목·추천·매수 금지와 추천 종목의 1차·2차·손절 가격을
           feeds/track/<YYYYMM>.json 에 남긴다. 이미 있는 날짜는 덮지 않는다(기록은 고치지 않는다).
   eval:   기록된 날마다 20·60거래일이 지났으면, 다음 날 시가에 사서 그날 종가까지의 실제 수익률을
           같은 날 거래 활발 종목 평균과 비교하고, 추천 종목은 1차·2차·손절 규칙대로 모의매매(score-core.js simulate)한다.
           → feeds/track-summary.json (사이트 추천 화면 '실제 성과')
   MKT=US → 미장: feeds/stock-scores-us.json 을 읽어 feeds/track-us/ · feeds/track-summary-us.json (종목 키 = 로이터 코드, 가격은 달러)
   사용: node scripts/track.mjs record | eval */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const V = require(path.join(ROOT, 'score-core.js'));
const US = process.env.MKT === 'US';
const DIR = path.join(ROOT, US ? 'feeds/track-us' : 'feeds/track');
const MIN_TV = US ? 0.1 : 5, HS = [1, 5, 20, 60], CONC = 8; // 1·5일은 참고용(공식은 60일 보유 기준) — 2026-10-12 사용자 결정
fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function candles(code, count) {
  if (US) {
    const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, ''), end = new Date(), st = new Date(end - Math.ceil(count * 1.5 + 10) * 864e5);
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(`https://api.stock.naver.com/chart/foreign/item/${code}/day?startDateTime=${ymd(st)}0000&endDateTime=${ymd(end)}2359`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
        const a = await r.json();
        return (Array.isArray(a) ? a : []).map((x) => [x.localDate, +x.openPrice, +x.highPrice, +x.lowPrice, +x.closePrice, +x.accumulatedTradingVolume]).slice(-count);
      } catch { await sleep(1500 * (i + 1)); }
    }
    return [];
  }
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
  const sc = JSON.parse(fs.readFileSync(path.join(ROOT, US ? 'feeds/stock-scores-us.json' : 'feeds/stock-scores.json'), 'utf8'));
  // 그날 디스코드로 보낸 TOP 10 (미장은 로이터 코드로 바꿔 둔다)
  let top = null;
  try { const pk = JSON.parse(fs.readFileSync(path.join(ROOT, US ? 'feeds/stock-picks-us.json' : 'feeds/stock-picks.json'), 'utf8'));
    if (pk.date === sc.date) top = pk.top.map((x) => (US ? (sc.items[x.c] || [])[14] : x.c)).filter(Boolean); } catch { /* 없으면 생략 */ }
  if (US) sc.items = Object.fromEntries(Object.values(sc.items).map((it) => [it[14], it])); // 미장은 로이터 코드(AAPL.O)로 기록 — 일봉을 다시 받을 때 쓴다
  const d = sc.date, file = path.join(DIR, d.slice(0, 6) + '.json');
  const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { days: {} };
  if (cur.days[d]) {
    if (!cur.days[d].t && top) { cur.days[d].t = top; fs.writeFileSync(file, JSON.stringify(cur)); console.log('이미 기록됨', d, '· TOP 10 만 보탬'); return; }
    console.log('이미 기록됨', d); return;
  }
  const liq = Object.entries(sc.items).filter(([, it]) => (it[6] ?? 0) >= MIN_TV);
  // 국장 추천은 거래대금 50억↑ · 하락 추세 제외만 (2026-10-13 사용자 결정, score_all.mjs PICK_TV). 비교 기준(u)은 그대로 5억↑ 전체.
  const buys = liq.filter(([, it]) => it[1] === '추천' && (US || ((it[6] ?? 0) >= 50 && !(it[8] || []).includes('하락 추세')))), bans = liq.filter(([, it]) => it[1] === '매수 금지');
  const cs = await pool(buys.map(([c]) => c), (c) => candles(c, 250));
  const b = buys.map(([c, it]) => { const L = V.levels(cs.get(c) || [], US ? { usd: true } : undefined); return [c, it[0], L ? L.b1 : null, L ? L.b2 : null, L ? L.st : null]; });
  cur.days[d] = { u: liq.map(([c]) => c), b, t: top || undefined, n: bans.map(([c, it]) => [c, it[0]]), formula: US ? 'US 모멘텀67·흑자33 · 1차60일선·2차매물대·손절2차−2ATR' : 'v2 안정성40·고점근접30·이익30 · 1차60일선·2차매물대·손절2차−2ATR' };
  fs.writeFileSync(file, JSON.stringify(cur));
  console.log(`기록 ${d}: 거래 활발 ${liq.length} · 추천 ${b.length} · 매수 금지 ${bans.length}`);
}

async function evaluate() {
  const days = loadAll();
  if (!days.length) { console.log('기록 없음'); return; }
  const ref = await candles(US ? 'AAPL.O' : '005930', 200), td = ref.map((x) => x[0]);
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
      const rt = (x.t || []).map(ret).filter((v) => v != null);
      // 적중 = 시장 평균(같은 날 거래 활발 종목)보다 나았던 종목 비율. 매수 금지는 평균보다 못했던 비율
      const hit = (a, up) => (a.length && m != null ? a.filter((v) => (up ? v > m : v < m)).length / a.length : null);
      const sims = H < 20 ? [] : x.b.map(([c, , b1, b2, st]) => { const a = cs.get(c) || [], i = a.findIndex((v) => v[0] === d);
        if (b1 == null || i < 0 || i + H >= a.length) return null; return V.simulate(a, i, { b1, b2, st }, H); }).filter(Boolean);
      const inv = sims.filter((s) => s.ret != null);
      co['h' + H] = { end, mkt: m, buy: mean(rb) - m, ban: mean(rn) - m, buyAbs: mean(rb), banAbs: mean(rn),
        top: rt.length ? mean(rt) - m : null, nT: rt.length, hitB: hit(rb, true), hitT: hit(rt, true), hitN: hit(rn, false),
        lv: { n: sims.length, fill1: mean(sims.map((s) => (s.f1 ? 1 : 0))), stop: mean(sims.map((s) => (s.stopped ? 1 : 0))), ret: mean(inv.map((s) => s.ret)), win: mean(inv.map((s) => (s.ret > 0 ? 1 : 0))) } };
    }
    cohorts.push(co);
  }
  const agg = {};
  for (const H of HS) {
    const done = cohorts.map((c) => c['h' + H]).filter((h) => h && !h.pending);
    agg['h' + H] = { n: done.length, buy: mean(done.map((h) => h.buy)), ban: mean(done.map((h) => h.ban)),
      beat: done.length ? done.filter((h) => h.buy > 0).length / done.length : null, banLose: done.length ? done.filter((h) => h.ban < 0).length / done.length : null,
      top: mean(done.map((h) => h.top).filter((v) => v != null)), hitB: mean(done.map((h) => h.hitB).filter((v) => v != null)),
      hitT: mean(done.map((h) => h.hitT).filter((v) => v != null)), hitN: mean(done.map((h) => h.hitN).filter((v) => v != null)),
      lvRet: mean(done.map((h) => h.lv.ret).filter((v) => v != null)), lvStop: mean(done.map((h) => h.lv.stop).filter((v) => v != null)),
      next: (cohorts.map((c) => c['h' + H]).find((h) => h && h.pending && h.due) || {}).due || null };
  }
  const out = { updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '), start: days[0][0], days: days.length, agg, cohorts: cohorts.slice(-120) };

  // 종목별 — 추천 화면 각 줄의 '추천 이후 성과'와 펼치면 보이는 '추천일별 결과' (2026-10-12 사용자 결정)
  //   s = 이번에 연속으로 추천되기 시작한 기록일, r = 그 다음 날 시가에 사서 최근 종가까지, m = 같은 날 거래 활발 종목 평균(같은 기간)
  //   h = 최근 추천일 6개의 [기록일, 1일·5일·20일 뒤 시장 대비] (아직이면 null)
  const lastTd = td[td.length - 1];
  const between = (c, d, end) => { const a = cs.get(c) || [], i = a.findIndex((v) => v[0] === d), j = a.findIndex((v) => v[0] === end);
    if (i < 0 || j < 0 || i + 1 > j) return null; const o = a[i + 1][1] || a[i + 1][4]; return o ? a[j][4] / o - 1 : null; };
  const mkC = {}, mkt = (d, end, u) => { const k = d + end; if (!(k in mkC)) mkC[k] = mean(u.map((c) => between(c, d, end)).filter((v) => v != null)); return mkC[k]; };
  const coBy = Object.fromEntries(cohorts.map((c) => [c.d, c]));
  const recSets = days.map(([d, x]) => [d, new Set(x.b.map((b) => b[0])), x.u]);
  const items = {};
  for (const c of new Set(days.flatMap(([, x]) => x.b.map((b) => b[0])))) {
    let i = recSets.length - 1; while (i >= 0 && !recSets[i][1].has(c)) i--;
    if (i < 0) continue;
    const now = i === recSets.length - 1; let st = i; while (st > 0 && recSets[st - 1][1].has(c)) st--;
    const [sd, , su] = recSets[st], r = between(c, sd, lastTd), m = r == null ? null : mkt(sd, lastTd, su);
    const h = recSets.filter(([, set]) => set.has(c)).slice(-6).map(([d]) => [d].concat([1, 5, 20].map((H) => {
      const co = coBy[d] && coBy[d]['h' + H]; if (!co || co.pending) return null; const v = between(c, d, co.end); return v == null || co.mkt == null ? null : +((v - co.mkt) * 100).toFixed(2); })));
    items[c] = { s: sd, n: i - st + 1, now, r: r == null ? null : +(r * 100).toFixed(2), m: m == null ? null : +(m * 100).toFixed(2), h };
  }
  fs.writeFileSync(path.join(ROOT, US ? 'feeds/track-codes-us.json' : 'feeds/track-codes.json'), JSON.stringify({ updated: out.updated, last: lastTd, items }));
  fs.writeFileSync(path.join(ROOT, US ? 'feeds/track-summary-us.json' : 'feeds/track-summary.json'), JSON.stringify(out));
  console.log(`기록 ${days.length}일 (${out.start}~) · ` + HS.map((H) => `${H}일 결과 ${agg['h' + H].n}건`).join(' · '));
}

const mode = process.argv[2];
if (mode === 'record') await record(); else if (mode === 'eval') await evaluate(); else { console.error('사용: node scripts/track.mjs record | eval'); process.exit(1); }
