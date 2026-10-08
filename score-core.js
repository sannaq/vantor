/* VANTOR 종합 평점 v2 — 백테스트(scripts/backtest.mjs)로 고른 공식
   안정성 40 (20일 변동성이 낮을수록) · 고점 근접 30 (52주 최고가에 가까울수록) · 이익 30 (이익 대비 주가가 쌀수록, 적자는 최하)
   점수 = 세 지표를 그날 전 종목(거래대금 5억↑) 안에서 줄 세운 위치(0~1)의 가중합 × 100
   → 그날 전 종목 상위 20% 점수 이상 추천 · 하위 20% 점수 미만 매수 금지 · 그 사이 중립 (경계 점수는 매일 기준표 bp.cut 에 담긴다)
   2025-09~2026-09 주간 검증: 상위 20% 는 이후 20일 평균 +0.8%p, 하위 20% 는 −1.7%p (같은 날 전체 평균 대비).
   추세(이평·RSI)·외국인·기관 수급은 같은 검증에서 예측력이 없어 점수에서 빼고 참고 정보로만 보여준다.
   사이트(브라우저)와 매일 채점(scripts/score_all.mjs)·백테스트가 이 파일 하나를 같이 쓴다.
   교육용 참고 지표이며 매매 신호가 아니다. */
(function (root) {
  var W = { stab: 40, high: 30, earn: 30 }, CUT = { buy: 68, ban: 33 }; // CUT 은 기준표가 없을 때만 쓰는 대략값
  function num(v) { return v == null || v === '' || isNaN(+v) ? null : +v; }
  function avg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function ma(c, n) { return c.length >= n ? avg(c.slice(-n)) : null; }
  function pct(a, b) { return a && b ? (a / b - 1) * 100 : null; }

  /* 원자료 → 지표. candles=[[t,o,h,l,c,v],...] 오래된→최근, flows=[{f,i,v}] (참고용) */
  function features(d) {
    var cs = (d.candles || []).filter(function (x) { return x && x[4] > 0; });
    if (cs.length < 30) return null;
    var c = cs.map(function (x) { return +x[4]; }), n = c.length, px = c[n - 1];
    var rets = []; for (var i = Math.max(1, n - 20); i < n; i++) rets.push(c[i] / c[i - 1] - 1);
    var m = avg(rets), vol = Math.sqrt(avg(rets.map(function (x) { return (x - m) * (x - m); })));
    var w = c.slice(-250), hi = num(d.h52) || Math.max.apply(null, w), lo = num(d.l52) || Math.min.apply(null, w);
    hi = Math.max(hi, px);
    var per = num(d.per);
    var tv20 = avg(cs.slice(-20).map(function (x) { return x[4] * x[5]; })) / 1e8;
    // 참고 정보(점수 미반영)
    var m20 = ma(c, 20), m60 = ma(c, 60), fl = (d.flows || []).slice(-5), f5 = 0, i5 = 0;
    fl.forEach(function (x) { f5 += +x.f || 0; i5 += +x.i || 0; });
    return {
      vol: vol, hiGap: px / hi - 1, ep: per != null && per > 0 ? 1 / per : -1, per: per,
      tv20: tv20, px: px, day: pct(px, c[n - 2]), ret20: pct(px, c[Math.max(0, n - 21)]), date: cs[n - 1][0],
      trend: m20 && m60 ? (px > m20 && m20 > m60 ? '상승 추세' : px < m20 && m20 < m60 ? '하락 추세' : '횡보') : null,
      flow5: fl.length >= 5 ? (f5 > 0 && i5 > 0 ? '외국인·기관 동반 순매수' : f5 < 0 && i5 < 0 ? '외국인·기관 동반 순매도' : '외국인·기관 엇갈림') : null
    };
  }

  /* 기준표: 지표마다 0~100 분위 경계값 (그날 전 종목에서) */
  function breakpoints(list) {
    function q(arr) { arr = arr.filter(function (x) { return x != null && isFinite(x); }).sort(function (a, b) { return a - b; });
      var out = []; for (var k = 0; k <= 100; k++) out.push(arr.length ? arr[Math.min(arr.length - 1, Math.round(k / 100 * (arr.length - 1)))] : 0); return out; }
    return { vol: q(list.map(function (f) { return f.vol; })), hiGap: q(list.map(function (f) { return f.hiGap; })), ep: q(list.map(function (f) { return f.ep; })) };
  }
  function rankIn(bp, v) { // 기준표 안 위치 0~1
    if (v == null || !bp || !bp.length) return 0.5;
    var lo = 0, hi = bp.length - 1;
    if (v <= bp[0]) return 0; if (v >= bp[hi]) return 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (bp[mid] <= v) lo = mid; else hi = mid; }
    var span = bp[hi] - bp[lo]; return (lo + (span ? (v - bp[lo]) / span : 0.5)) / (bp.length - 1);
  }

  function score(f, bp) {
    if (!f || !bp) return null;
    var rs = 1 - rankIn(bp.vol, f.vol), rh = rankIn(bp.hiGap, f.hiGap), re = f.ep < 0 ? 0 : rankIn(bp.ep, f.ep);
    var parts = [Math.round(W.stab * rs), Math.round(W.high * rh), Math.round(W.earn * re)];
    var total = Math.round(W.stab * rs + W.high * rh + W.earn * re);
    var cut = bp.cut || CUT, view = total >= cut.buy ? '추천' : total < cut.ban ? '매수 금지' : '중립';
    var good = [], bad = [], gp = (f.hiGap * 100).toFixed(1);
    if (rs >= 0.7) good.push('주가 흔들림 작음(하루 ±' + (f.vol * 100).toFixed(1) + '%)'); else if (rs <= 0.3) bad.push('변동성 큼(하루 ±' + (f.vol * 100).toFixed(1) + '%)');
    if (rh >= 0.7) good.push('52주 고점 대비 덜 빠짐(' + gp + '%)'); else if (rh <= 0.3) bad.push('52주 고점 대비 ' + gp + '%');
    if (f.ep < 0) bad.push('적자(PER 없음)'); else if (re >= 0.7) good.push('이익 대비 주가 쌈(PER ' + f.per.toFixed(1) + '배)'); else if (re <= 0.3) bad.push('이익 대비 비쌈(PER ' + f.per.toFixed(1) + '배)');
    return { total: total, view: view, cut: cut, parts: parts, good: good, bad: bad, ref: [f.trend, f.flow5].filter(Boolean), m: f };
  }

  /* 채점한 점수들로 추천·매수 금지 경계(상위·하위 20%)를 정한다 */
  function cuts(totals) { var a = totals.slice().sort(function (x, y) { return x - y; }); if (!a.length) return CUT;
    return { buy: a[Math.floor(a.length * 0.8)], ban: a[Math.floor(a.length * 0.2)] }; }
  var api = { features: features, breakpoints: breakpoints, score: score, cuts: cuts, W: W, CUT: CUT,
    PARTS: [['안정성', W.stab], ['고점 근접', W.high], ['이익', W.earn]],
    VIEW_DESC: { '추천': '전 종목 상위 20% — 검증 기간에 시장보다 나았던 구간', '중립': '뚜렷한 우위 없음', '매수 금지': '전 종목 하위 20% — 검증 기간에 시장보다 못했던 구간' } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VScore = api;
})(typeof window !== 'undefined' ? window : globalThis);
