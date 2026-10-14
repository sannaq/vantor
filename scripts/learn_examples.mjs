#!/usr/bin/env node
/* 스터디 '실전 차트' 탭의 실제 종목 예시를 고른다 (2026-10-14 사용자 결정: 개념 모양 그림 + 실제 종목 예시, 차트 분석 전반 + 우리 추천 읽는 법).
   시가총액 상위(코스피 200 · 코스닥 100) 종목의 최근 2년 일봉에서 개념마다 조건에 딱 맞는 장면을 찾아,
   가장 또렷한 한 장면(종목이 겹치지 않게)을 feeds/learn-examples.json 에 담는다. 사이트 app.js 의 learnReal() 이 그린다.
   - 차트 분석 전반: 추세 · 지지·저항(박스권) · 거래량 실린 돌파 · 거래량 없는 가짜 돌파 · 저항→지지 · 골든크로스 · 데드크로스 · 쌍바닥 · 매물대 · RSI 과매도 · 지지 이탈
   - 우리 추천 읽는 법: 오늘 추천 1위 종목에 1차·2차·손절·목표·예상 경로 + 같은 규칙을 과거 차트에 적용한 결과(목표 도달 / 손절)
   예시는 결과를 알고 고른 '교과서 장면'이다 — 같은 모양이 늘 같은 결과로 끝난다는 뜻이 아니다(화면에 그렇게 적는다).
   levels-study.yml 이 매주 토요일 다시 고른다. 사용: node scripts/learn_examples.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const V = require(path.join(ROOT, 'score-core.js'));
const API = 'https://m.stock.naver.com/api';
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
async function candles(code, count) {
  const xml = await get(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${count}&requestType=0`, true);
  return [...xml.matchAll(/data="(\d{8})\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)"/g)].map((m) => [m[1], +m[2], +m[3], +m[4], +m[5], +m[6]]).filter((x) => x[4] > 0);
}

/* ── 지표 ── */
const sma = (a, n) => a.map((_, i) => (i + 1 < n ? null : a.slice(i + 1 - n, i + 1).reduce((s, x) => s + x, 0) / n));
function rsi14(c) {
  const out = c.map(() => null); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= 14) { g += up / 14; l += dn / 14; if (i === 14) out[i] = l ? 100 - 100 / (1 + g / l) : 100; continue; }
    g = (g * 13 + up) / 14; l = (l * 13 + dn) / 14; out[i] = l ? 100 - 100 / (1 + g / l) : 100;
  }
  return out;
}
function prep(cs) {
  cs = cs.map((x) => { const c = x[4], o = x[1] > 0 ? x[1] : c; return [x[0], o, x[2] > 0 ? x[2] : Math.max(o, c), x[3] > 0 ? x[3] : Math.min(o, c), c, x[5]]; }); // 거래 없던 날 0 → 종가
  const C = cs.map((x) => x[4]), H = cs.map((x) => x[2]), L = cs.map((x) => x[3]), Vo = cs.map((x) => x[5]);
  const m20 = sma(C, 20), m60 = sma(C, 60), av = Vo.map((_, i) => (i < 20 ? null : Vo.slice(i - 20, i).reduce((s, x) => s + x, 0) / 20));
  return { cs, C, H, L, Vo, m20, m60, av, rsi: rsi14(C), n: cs.length };
}
const maxOf = (a, i0, i1) => Math.max(...a.slice(i0, i1 + 1)), minOf = (a, i0, i1) => Math.min(...a.slice(i0, i1 + 1));
const pivLow = (d, j, k = 5) => j - k >= 0 && j + k < d.n && d.L[j] === minOf(d.L, j - k, j + k);
const pivHigh = (d, j, k = 5) => j - k >= 0 && j + k < d.n && d.H[j] === maxOf(d.H, j - k, j + k);
const pct = (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
const won = (p) => Math.round(p).toLocaleString('en-US') + '원';
const md = (s) => `${+s.slice(2, 4)}년 ${+s.slice(4, 6)}월 ${+s.slice(6, 8)}일`;

/* 장면 → 저장 형식. 창은 [a, b] (포함). 지표는 창 안 값만, 원 단위 반올림. */
function scene(d, a, b, extra) {
  const r = (v) => (v == null ? null : Math.round(v));
  const sl = (arr) => arr.slice(a, b + 1);
  const o = { cs: sl(d.cs).map((x) => [x[0], x[1], x[2], x[3], x[4], x[5]]), m20: sl(d.m20).map(r), m60: sl(d.m60).map(r) };
  if (extra.rsi) o.rsi = sl(d.rsi).map((v) => (v == null ? null : Math.round(v * 10) / 10));
  const at = (i) => i - a; // 창 안 위치로
  o.lines = (extra.lines || []).map((z) => ({ ...z, i0: z.i0 == null ? 0 : Math.max(0, at(z.i0)), i1: z.i1 == null ? b - a : Math.min(b - a, at(z.i1)) }));
  o.pts = (extra.pts || []).map((z) => ({ ...z, i: at(z.i) }));
  o.vhl = (extra.vhl || []).map(at);
  if (extra.zone) o.zone = extra.zone;
  if (extra.vp) o.vp = extra.vp;
  if (extra.shade) o.shade = extra.shade.map((z) => ({ ...z, i0: at(z.i0), i1: at(z.i1) }));
  return o;
}

/* ── 개념별 장면 찾기: 후보마다 score(클수록 또렷), 만드는 함수 mk ── */
const FIND = {
  trend(d) {
    const out = [];
    for (let s = 60; s + 80 < d.n; s += 5) {
      const e = s + 79; let ok = 0;
      for (let i = s; i <= e; i++) if (d.C[i] > d.m20[i] && d.m20[i] > d.m60[i]) ok++;
      const fr = ok / 80, ret = d.C[e] / d.C[s] - 1;
      if (fr < 0.85 || ret < 0.2 || ret > 0.6 || d.m60[e] <= d.m60[s]) continue;
      const lows = [], highs = [];
      for (let j = s + 3; j <= e - 3; j++) { if (pivLow(d, j)) lows.push(j); if (pivHigh(d, j)) highs.push(j); }
      const hl = lows.every((j, k) => !k || d.L[j] > d.L[lows[k - 1]]), hh = highs.every((j, k) => !k || d.H[j] > d.H[highs[k - 1]]);
      if (lows.length < 2 || highs.length < 2 || !hl || !hh) continue;
      out.push({ score: fr * Math.min(ret, 0.6) * (lows.length + highs.length), s, e, lows, highs, ret });
    }
    const pick3 = (a) => (a.length <= 3 ? a : [a[0], a[Math.floor(a.length / 2)], a[a.length - 1]]); // 표시점이 많으면 글씨가 겹친다
    return out.map((x) => ({ score: x.score, a: x.s - 10, b: x.e + 5, mk: () => ({
      res: `${x.e - x.s + 1}거래일 동안 ${pct(x.ret)} — 고점과 저점이 함께 높아졌어요.`,
      sc: scene(d, x.s - 10, x.e + 5, { pts: [...pick3(x.lows).map((j) => ({ i: j, p: d.L[j], t: '저점↑', dir: 'below', c: 'up' })), ...pick3(x.highs).map((j) => ({ i: j, p: d.H[j], t: '고점↑', dir: 'above', c: 'gold' }))] }) }) }));
  },
  box(d) {
    const out = [];
    for (let s = 60; s + 80 < d.n; s += 3) {
      const e = s + 59, top = maxOf(d.H, s, e), bot = minOf(d.L, s, e), rg = top / bot - 1;
      if (rg < 0.08 || rg > 0.2) continue;
      let tt = 0, tb = 0, lt = -9, lb = -9;
      for (let i = s; i <= e; i++) {
        if (d.H[i] >= top * 0.985 && i - lt >= 6) { tt++; lt = i; }
        if (d.L[i] <= bot * 1.015 && i - lb >= 6) { tb++; lb = i; }
      }
      if (tt < 3 || tb < 3) continue;
      out.push({ score: Math.min(tt, 4) + Math.min(tb, 4) + (rg > 0.1 ? 1 : 0), s, e, top, bot, tt, tb });
    }
    return out.map((x) => ({ score: x.score, a: x.s - 5, b: x.e + 20, mk: () => ({
      res: `60거래일 동안 ${won(x.bot)} ~ ${won(x.top)} 사이에서 위로 ${x.tt}번, 아래로 ${x.tb}번 막혔어요.`,
      sc: scene(d, x.s - 5, x.e + 20, { lines: [{ p: x.top, t: '저항 ' + won(x.top), c: 'res', i0: x.s, i1: x.e }, { p: x.bot, t: '지지 ' + won(x.bot), c: 'sup', i0: x.s, i1: x.e }] }) }) }));
  },
  breakout(d) {
    const out = [];
    for (let i = 70; i + 25 < d.n; i++) {
      const lv = maxOf(d.H, i - 40, i - 1), vr = d.Vo[i] / d.av[i];
      if (!(d.C[i] > lv * 1.02 && vr >= 3)) continue;
      const g = d.C[i + 20] / d.C[i] - 1;
      if (g < 0.08 || g > 0.35 || minOf(d.L, i + 1, i + 20) < lv * 0.97) continue;
      out.push({ score: Math.min(vr, 6) * g, i, lv, vr, g });
    }
    return out.map((x) => ({ score: x.score, a: x.i - 60, b: x.i + 30, mk: () => ({
      res: `거래량이 평소의 ${x.vr.toFixed(1)}배 실린 돌파 뒤 20거래일 ${pct(x.g)}, 돌파한 선 아래로 다시 내려가지 않았어요.`,
      sc: scene(d, x.i - 60, x.i + 30, { lines: [{ p: x.lv, t: '40일 고점(저항) ' + won(x.lv), c: 'res', i0: x.i - 40 }], pts: [{ i: x.i, p: d.H[x.i], t: '거래량 실린 돌파', dir: 'above', c: 'up' }], vhl: [x.i] }) }) }));
  },
  fake(d) {
    const out = [];
    for (let i = 70; i + 25 < d.n; i++) {
      const lv = maxOf(d.H, i - 40, i - 1), vr = d.Vo[i] / d.av[i];
      if (!(d.C[i] > lv * 1.01 && vr < 1.0)) continue;
      let back = -1; for (let k = 1; k <= 10; k++) if (d.C[i + k] < lv * 0.97) { back = i + k; break; }
      const g = d.C[i + 20] / d.C[i] - 1;
      if (back < 0 || g > -0.08 || g < -0.3) continue;
      out.push({ score: -g * (1.2 - vr), i, lv, vr, g, back });
    }
    return out.map((x) => ({ score: x.score, a: x.i - 60, b: x.i + 30, mk: () => ({
      res: `거래량이 평소의 ${x.vr.toFixed(1)}배뿐인 돌파였고, ${x.back - x.i}거래일 만에 선 아래로 돌아와 20거래일 ${pct(x.g)}.`,
      sc: scene(d, x.i - 60, x.i + 30, { lines: [{ p: x.lv, t: '40일 고점(저항) ' + won(x.lv), c: 'res', i0: x.i - 40 }], pts: [{ i: x.i, p: d.H[x.i], t: '거래량 없는 돌파', dir: 'above', c: 'gold' }, { i: x.back, p: d.L[x.back], t: '다시 아래로', dir: 'below', c: 'down' }], vhl: [x.i] }) }) }));
  },
  retest(d) {
    const out = [];
    for (let i = 70; i + 45 < d.n; i++) {
      const lv = maxOf(d.H, i - 40, i - 1);
      if (!(d.C[i] > lv * 1.02 && d.Vo[i] / d.av[i] >= 2)) continue;
      for (let j = i + 3; j <= i + 25; j++) {
        if (d.L[j] <= lv * 1.02 && d.L[j] >= lv * 0.97 && d.C[j] >= lv * 0.99 && minOf(d.L, i + 1, j) >= lv * 0.97) {
          const g = d.C[j + 15] / d.C[j] - 1;
          if (g >= 0.08 && g <= 0.35) out.push({ score: g, i, j, lv, g });
          break;
        }
      }
    }
    return out.map((x) => ({ score: x.score, a: x.i - 50, b: x.j + 25, mk: () => ({
      res: `돌파한 선(${won(x.lv)})까지 되돌아와 지지받은 뒤 15거래일 ${pct(x.g)}.`,
      sc: scene(d, x.i - 50, x.j + 25, { lines: [{ p: x.lv, t: '저항 → 지지 ' + won(x.lv), c: 'gold', i0: x.i - 40 }], pts: [{ i: x.i, p: d.H[x.i], t: '돌파', dir: 'above', c: 'up' }, { i: x.j, p: d.L[x.j], t: '되돌림 지지', dir: 'below', c: 'up' }], vhl: [x.i] }) }) }));
  },
  golden(d) { return cross(d, 1); },
  dead(d) { return cross(d, -1); },
  dbottom(d) {
    const out = [], lows = []; for (let j = 60; j < d.n - 25; j++) if (pivLow(d, j, 4)) lows.push(j);
    for (let a = 0; a < lows.length; a++) for (let b = a + 1; b < lows.length; b++) {
      const p1 = lows[a], p2 = lows[b]; if (p2 - p1 < 15 || p2 - p1 > 45) continue;
      if (Math.abs(d.L[p2] / d.L[p1] - 1) > 0.03) continue;
      const nk = maxOf(d.H, p1, p2); if (nk < Math.min(d.L[p1], d.L[p2]) * 1.08) continue;
      if (minOf(d.L, p1, p2) < Math.min(d.L[p1], d.L[p2]) * 0.995) continue;
      let bo = -1; for (let k = p2 + 1; k <= p2 + 20 && k < d.n; k++) if (d.C[k] > nk) { bo = k; break; }
      if (bo < 0 || bo + 15 >= d.n || d.C[bo + 15] < nk * 1.03 || d.C[bo + 15] > nk * 1.35 || d.C[bo + 15] < d.C[bo] * 1.03) continue;
      const before = d.C[p1 - 20] / d.L[p1] - 1; // 앞에 하락이 있어야 '바닥'
      if (before < 0.08) continue;
      out.push({ score: (d.C[bo + 15] / nk - 1) + before * 0.5, p1, p2, nk, bo });
    }
    return out.map((x) => ({ score: x.score, a: x.p1 - 30, b: x.bo + 20, mk: () => ({
      res: `두 바닥(${won(d.L[x.p1])} · ${won(d.L[x.p2])})이 같은 높이에서 받쳐 준 뒤 목선을 넘고 15거래일 ${pct(d.C[x.bo + 15] / d.C[x.bo] - 1)}.`,
      sc: scene(d, x.p1 - 30, x.bo + 20, { lines: [{ p: x.nk, t: '목선 ' + won(x.nk), c: 'gold', i0: x.p1 }], pts: [{ i: x.p1, p: d.L[x.p1], t: '첫 바닥', dir: 'below', c: 'up' }, { i: x.p2, p: d.L[x.p2], t: '둘째 바닥', dir: 'below', c: 'up' }, { i: x.bo, p: d.H[x.bo], t: '목선 돌파', dir: 'above', c: 'up' }] }) }) }));
  },
  vp(d) {
    const out = [];
    for (let i = 140; i + 20 < d.n; i++) {
      const L = V.levels(d.cs.slice(0, i), {}); if (!L) continue;
      const z = L.zones[0]; if (z.share < 0.12) continue;
      if (!(d.C[i - 10] > z.hi * 1.05 && d.L[i] <= z.hi && d.L[i] >= z.lo * 0.995 && d.C[i] >= z.lo)) continue;
      const g = d.C[i + 15] / d.C[i] - 1; if (g < 0.07 || g > 0.35) continue;
      out.push({ score: g * z.share, i, z, L });
      i += 10;
    }
    return out.map((x) => ({ score: x.score, a: x.i - 100, b: x.i + 20, mk: () => ({
      res: `직전 120일 거래의 ${Math.round(x.z.share * 100)}%가 몰린 ${won(x.z.lo)} ~ ${won(x.z.hi)} 구간까지 내려와 멈춘 뒤 15거래일 ${pct(d.C[x.i + 15] / d.C[x.i] - 1)}.`,
      sc: scene(d, x.i - 100, x.i + 20, { vp: { lo: x.L.lo, step: x.L.step, v: x.L.vp.map((v) => Math.round(v / 1000)) }, zone: { p0: x.z.lo, p1: x.z.hi, t: '가장 큰 매물대', c: 'info' }, pts: [{ i: x.i, p: d.L[x.i], t: '매물대에서 멈춤', dir: 'below', c: 'up' }] }) }) }));
  },
  rsi(d) {
    const out = [];
    for (let i = 70; i + 20 < d.n; i++) {
      if (!(d.rsi[i] < 25 && d.rsi[i - 1] >= 25)) continue;
      let k = -1; for (let j = i + 1; j <= i + 8; j++) if (d.rsi[j] > 30) { k = j; break; }
      if (k < 0) continue;
      const g = d.C[k + 15] / d.C[k] - 1; if (g < 0.08 || g > 0.35) continue;
      out.push({ score: g * (30 - Math.min(...d.rsi.slice(i, k + 1))) / 10, i, k, g });
      i += 20;
    }
    return out.map((x) => ({ score: x.score, a: x.i - 60, b: x.k + 25, mk: () => ({
      res: `RSI가 ${Math.min(...d.rsi.slice(x.i, x.k + 1)).toFixed(0)}까지 내려갔다가 30 위로 돌아온 날부터 15거래일 ${pct(x.g)}.`,
      sc: scene(d, x.i - 60, x.k + 25, { rsi: true, pts: [{ i: x.i, p: d.L[x.i], t: 'RSI 25 아래', dir: 'below', c: 'down' }, { i: x.k, p: d.L[x.k], t: 'RSI 30 회복', dir: 'below', c: 'up' }] }) }) }));
  },
  breakdown(d) {
    const out = [];
    for (let i = 70; i + 25 < d.n; i++) {
      const lv = minOf(d.L, i - 40, i - 1), vr = d.Vo[i] / d.av[i];
      if (!(d.C[i] < lv * 0.98 && vr >= 1.5)) continue;
      if (maxOf(d.H, i - 40, i - 1) / lv - 1 > 0.25) continue; // 박스·횡보 뒤 이탈만
      const g = d.C[i + 20] / d.C[i] - 1; if (g > -0.08 || g < -0.35) continue;
      out.push({ score: -g * Math.min(vr, 6), i, lv, vr, g });
      i += 20;
    }
    return out.map((x) => ({ score: x.score, a: x.i - 60, b: x.i + 30, mk: () => ({
      res: `40일 동안 지켜 온 바닥(${won(x.lv)})을 거래량 ${x.vr.toFixed(1)}배로 깨고 20거래일 ${pct(x.g)} 더 빠졌어요.`,
      sc: scene(d, x.i - 60, x.i + 30, { lines: [{ p: x.lv, t: '40일 바닥(지지) ' + won(x.lv), c: 'sup', i0: x.i - 40 }], pts: [{ i: x.i, p: d.L[x.i], t: '지지 이탈', dir: 'below', c: 'down' }], vhl: [x.i] }) }) }));
  },
};
function cross(d, sg) {
  const out = [];
  for (let i = 70; i + 35 < d.n; i++) {
    const a0 = d.m20[i - 1] - d.m60[i - 1], a1 = d.m20[i] - d.m60[i];
    if (!(sg > 0 ? a0 <= 0 && a1 > 0 : a0 >= 0 && a1 < 0)) continue;
    let keep = true; for (let j = i + 1; j <= i + 30; j++) if ((d.m20[j] - d.m60[j]) * sg <= 0) { keep = false; break; }
    const g = d.C[i + 30] / d.C[i] - 1;
    if (!keep || g * sg < 0.12 || g * sg > 0.4) continue;
    out.push({ score: g * sg, i, g });
  }
  return out.map((x) => ({ score: x.score, a: x.i - 60, b: x.i + 35, mk: () => ({
    res: `20일선이 60일선을 ${sg > 0 ? '위로' : '아래로'} 뚫은 날부터 30거래일 ${pct(x.g)}.`,
    sc: scene(d, x.i - 60, x.i + 35, { pts: [{ i: x.i, p: sg > 0 ? d.L[x.i] : d.H[x.i], t: sg > 0 ? '골든크로스' : '데드크로스', dir: sg > 0 ? 'below' : 'above', c: sg > 0 ? 'up' : 'down' }] }) }) }));
}

/* 우리 규칙을 과거 차트에 적용한 결과 — 목표 도달 한 장면, 손절 한 장면 */
function ruleCases(d, o, want) {
  const out = [];
  for (let i = 130; i + 61 < d.n; i += 3) {
    const L = V.levels(d.cs.slice(0, i + 1), o); if (!L || L.tg == null || L.st == null) continue;
    const r = V.simulate(d.cs, i, L, 60);
    if (want === 'hit' ? !(r.hit && r.f1 && r.f2 && r.day >= 15 && r.day <= 45 && r.ret <= 0.25) : !(r.stopped && r.f1 && r.day >= 10 && r.day <= 40)) continue;
    let f1 = -1, f2 = -1; for (let k = i + 1; k <= i + r.day; k++) { if (f1 < 0 && d.L[k] <= L.b1) f1 = k; if (f2 < 0 && d.L[k] <= L.b2) f2 = k; }
    out.push({ score: want === 'hit' ? (d.cs[i][4] * d.cs[i][5] > 3e10 ? 2 : 1) / r.day : (d.cs[i][4] * d.cs[i][5] > 3e10 ? 2 : 1) * (r.ret > -0.15 ? 1 : 0.3), i, L, r, f1, f2 });
  }
  return out.map((x) => ({ score: x.score, a: x.i - 60, b: Math.min(d.n - 1, x.i + x.r.day + 10), mk: () => {
    const ex = x.i + x.r.day, pts = [{ i: x.i, p: d.H[x.i], t: '규칙 계산한 날', dir: 'above', c: 'gold' }];
    if (x.f1 >= 0) pts.push({ i: x.f1, p: x.L.b1, t: '1차 체결', dir: 'below', c: 'ok' });
    if (x.f2 >= 0 && x.f2 !== x.f1) pts.push({ i: x.f2, p: x.L.b2, t: '2차 체결', dir: 'below', c: 'ok' });
    pts.push(want === 'hit' ? { i: ex, p: x.L.tg, t: '목표 도달 → 매도', dir: 'above', c: 'info' } : { i: ex, p: x.L.st, t: '손절', dir: 'below', c: 'stop' });
    return {
      res: (want === 'hit' ? `${x.r.day}거래일 만에 목표에 닿아 팔았어요. 들어간 돈 기준 ${pct(x.r.ret)}.` : `${x.r.day}거래일 만에 손절가에 닿아 정리했어요. 들어간 돈 기준 ${pct(x.r.ret)}.`)
        + (x.f2 >= 0 ? ' 1차·2차 모두 체결.' : ' 1차만 체결.'),
      sc: scene(d, x.i - 60, Math.min(d.n - 1, x.i + x.r.day + 10), { lines: [
        { p: x.L.tg, t: '목표 ' + won(x.L.tg), c: 'info', i0: x.i }, { p: x.L.b1, t: '1차 ' + won(x.L.b1), c: 'ok', i0: x.i },
        { p: x.L.b2, t: '2차 ' + won(x.L.b2), c: 'ok', i0: x.i }, { p: x.L.st, t: '손절 ' + won(x.L.st), c: 'stop', i0: x.i }], pts, shade: [{ i0: x.i, i1: ex, t: '보유' }] }),
    };
  } }));
}

/* ── 실행 ── */
const uni = [];
for (const [mkt, pages] of [['KOSPI', 2], ['KOSDAQ', 1]]) for (let p = 1; p <= pages; p++) {
  const j = await get(`${API}/stocks/marketValue/${mkt}?page=${p}&pageSize=100`);
  for (const s of j.stocks || []) if (s.stockEndType === 'stock') uni.push({ c: s.itemCode, n: s.stockName });
}
console.log('종목', uni.length);
const DATA = []; let idx = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (idx < uni.length) { const s = uni[idx++]; try { const cs = await candles(s.c, 520); if (cs.length > 300) DATA.push({ ...s, d: prep(cs) }); } catch (e) { /* 빠진 종목은 건너뜀 */ } }
}));
console.log('일봉 받음', DATA.length);


/* ── 교과서 신호 직접 검증 (2026-10-14 사용자 요청 '네가 배운 것도 추가'): 같은 300종목 2년에서 신호가 난 모든 날의 20거래일 뒤 결과.
   비교 기준 = 아무 날이나 샀을 때(전체 평균). exp = 교과서가 말하는 방향(+1 오른다 / −1 내린다). ── */
function studyStats() {
  const H = 20, S = {};
  const DM = {}, add = (k, d, i) => { const r = d.C[i + H] / d.C[i] - 1, dt = d.cs[i][0]; (S[k] = S[k] || []).push([dt, r]); if (k === 'all') (DM[dt] = DM[dt] || []).push(r); };
  for (const { d } of DATA) {
    const hi250 = d.H.map((_, i) => (i < 250 ? null : maxOf(d.H, i - 249, i))), lo250 = d.L.map((_, i) => (i < 250 ? null : minOf(d.L, i - 249, i)));
    for (let i = 70; i + H < d.n; i++) {
      add('all', d, i);
      const vr = d.Vo[i] / d.av[i], up40 = maxOf(d.H, i - 40, i - 1), lo40 = minOf(d.L, i - 40, i - 1);
      if (d.C[i] > up40 * 1.02 && vr >= 3) add('boStrong', d, i);
      if (d.C[i] > up40 * 1.01 && vr < 1) add('boWeak', d, i);
      if (d.C[i] < lo40 * 0.98 && vr >= 1.5) add('breakdown', d, i);
      const a0 = d.m20[i - 1] - d.m60[i - 1], a1 = d.m20[i] - d.m60[i];
      if (a0 <= 0 && a1 > 0) add('golden', d, i);
      if (a0 >= 0 && a1 < 0) add('dead', d, i);
      if (d.rsi[i - 1] < 30 && d.rsi[i] >= 30) add('rsiUp', d, i);
      if (d.rsi[i - 1] <= 70 && d.rsi[i] > 70) add('rsiHot', d, i);
      if (d.C[i] > d.m20[i] && d.m20[i] > d.m60[i]) add('aligned', d, i);
      if (d.C[i] < d.m20[i] && d.m20[i] < d.m60[i]) add('reverse', d, i);
      if (hi250[i] && d.C[i] >= hi250[i] * 0.95) add('nearHi', d, i);
      if (lo250[i] && d.C[i] <= lo250[i] * 1.05) add('nearLo', d, i);
      if (d.C[i] / d.C[i - 1] - 1 >= 0.15) add('jump', d, i);
      if (d.C[i] / d.C[i - 1] - 1 <= -0.1) add('plunge', d, i);
    }
  }
  // 같은 날 전체 종목 평균을 빼서 '시장이 다 같이 오르고 내린 것'은 지운다 (폭락 다음 반등 같은 시기 효과 제거)
  const dm = {}; for (const k in DM) dm[k] = DM[k].reduce((t, x) => t + x, 0) / DM[k].length;
  const sum = (a0) => { const a = a0.map(([dt, r]) => r), x = a0.map(([dt, r]) => r - dm[dt]), s2 = a.slice().sort((p, q) => p - q), m = a.reduce((t, v) => t + v, 0) / a.length, xm = x.reduce((t, v) => t + v, 0) / x.length;
    return { n: a.length, avg: +m.toFixed(4), ex: +xm.toFixed(4), beat: +(x.filter((v) => v > 0).length / x.length).toFixed(3), med: +s2[Math.floor(a.length / 2)].toFixed(4), win: +(a.filter((v) => v > 0).length / a.length).toFixed(3), p10: +s2[Math.floor(a.length * 0.1)].toFixed(4) }; };
  const R = {}; for (const k in S) if (S[k].length >= 20) R[k] = sum(S[k]);
  return { h: H, rows: R };
}

const LVM = JSON.parse(fs.readFileSync(path.join(ROOT, 'feeds/levels-model.json'), 'utf8'));
const ruleO = LVM.rule && LVM.rule.o ? LVM.rule.o : {};
const KEYS = ['trend', 'box', 'breakout', 'fake', 'retest', 'golden', 'dead', 'dbottom', 'vp', 'rsi', 'breakdown', 'ruleHit', 'ruleStop'];
const used = new Set(), out = {};
for (const k of KEYS) {
  const cands = [];
  for (const s of DATA) {
    const list = k === 'ruleHit' ? ruleCases(s.d, ruleO, 'hit') : k === 'ruleStop' ? ruleCases(s.d, ruleO, 'stop') : FIND[k](s.d);
    for (const x of list) {
      if (x.a < 0 || x.b >= s.d.n) continue;
      if (maxOf(s.d.H, x.a, x.b) / minOf(s.d.L, x.a, x.b) > 2.2) continue; // 폭락·급등·액면 이상 장면은 교재로 부적합
      cands.push({ ...x, s });
    }
  }
  // 최근 1년 장면을 조금 더 쳐준다(지금 차트와 감이 비슷하도록)
  cands.forEach((x) => { x.rank = x.score * (x.b > x.s.d.n - 250 ? 1.3 : 1); });
  cands.sort((p, q) => q.rank - p.rank);
  const best = cands.find((x) => !used.has(x.s.c)) || cands[0];
  if (!best) { console.log(k, '장면 없음'); continue; }
  used.add(best.s.c);
  const m = best.mk();
  out[k] = { c: best.s.c, n: best.s.n, from: best.s.d.cs[best.a][0], to: best.s.d.cs[best.b][0], res: m.res, ...m.sc };
  console.log(k, best.s.n, md(out[k].from), '~', md(out[k].to), '후보', cands.length, '|', m.res);
}

// 오늘 추천 1위 — 사이트 추천 화면과 같은 1차·2차·손절·목표·예상 경로
try {
  const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'feeds/stock-picks.json'), 'utf8')), t = (P.top || []).find((x) => x.lv && x.ex);
  if (t) {
    const cs = await candles(t.c, 200), d = prep(cs), a = d.n - 80, b = d.n - 1;
    const L = V.levels(cs, ruleO);
    out.today = { c: t.c, n: t.n, date: P.date, from: cs[a][0], to: cs[b][0], lv: t.lv, ex: t.ex, good: t.good, bad: t.bad,
      ...scene(d, a, b, { vp: L ? { lo: L.lo, step: L.step, v: L.vp.map((v) => Math.round(v / 1000)) } : null,
        lines: [{ p: t.lv.tg, t: '목표 ' + won(t.lv.tg), c: 'info' }, { p: t.lv.b1, t: '1차 ' + won(t.lv.b1), c: 'ok' }, { p: t.lv.b2, t: '2차 ' + won(t.lv.b2), c: 'ok' }, { p: t.lv.st, t: '손절 ' + won(t.lv.st), c: 'stop' }] }) };
    console.log('오늘 추천', t.n, P.date);
  }
} catch (e) { console.log('오늘 추천 예시 실패', e.message); }

out.stats = studyStats();
console.log('신호 검증', JSON.stringify(out.stats.rows));
out.rule = LVM.rule ? LVM.rule.key : null;
out.updated = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
fs.writeFileSync(path.join(ROOT, 'feeds/learn-examples.json'), JSON.stringify(out));
console.log('저장 feeds/learn-examples.json', Math.round(fs.statSync(path.join(ROOT, 'feeds/learn-examples.json')).size / 1024) + 'KB');
