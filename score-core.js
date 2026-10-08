/* VANTOR 종합 평점 — 추세 40 · 수급 25 · 가치 20 · 위험 15 = 100점
   사이트(브라우저)와 매일 장마감 채점(scripts/score_all.mjs, Node)이 같은 공식을 쓰도록 이 파일 하나만 둔다.
   입력: { candles:[[t,o,h,l,c,v],...] 오래된→최근, per, pbr, div, h52, l52,
           flows:[{f:외국인순매수수량, i:기관순매수수량, v:거래량}, ...] 오래된→최근 }
   교육용 참고 지표이며 매매 신호가 아니다. */
(function (root) {
  function num(v) { return v == null || v === '' || isNaN(+v) ? null : +v; }
  function avg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function ma(c, n, end) { end = end == null ? c.length : end; return end >= n ? avg(c.slice(end - n, end)) : null; }
  function rsi(c, n) {
    n = n || 14; if (c.length <= n) return null;
    var g = 0, l = 0;
    for (var i = 1; i <= n; i++) { var d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n;
    for (var j = n + 1; j < c.length; j++) { var e = c[j] - c[j - 1]; g = (g * (n - 1) + Math.max(e, 0)) / n; l = (l * (n - 1) + Math.max(-e, 0)) / n; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  function ema(a, n) { var k = 2 / (n + 1), out = [], p = a[0]; a.forEach(function (x) { p = x * k + p * (1 - k); out.push(p); }); return out; }
  function pct(a, b) { return a && b ? (a / b - 1) * 100 : null; }
  function f1(v) { return (v >= 0 ? '+' : '') + v.toFixed(1); }

  function score(d) {
    var cs = (d.candles || []).filter(function (x) { return x && x[4] > 0; });
    if (cs.length < 30) return null;
    var c = cs.map(function (x) { return +x[4]; }), v = cs.map(function (x) { return +x[5] || 0; });
    var n = c.length, px = c[n - 1];
    var m20 = ma(c, 20), m60 = ma(c, 60), m120 = ma(c, 120), m20p = ma(c, 20, n - 5);
    var r = rsi(c, 14);
    var e12 = ema(c, 12), e26 = ema(c, 26), macd = c.map(function (_, i) { return e12[i] - e26[i]; }), sig = ema(macd, 9);
    var hist = macd[n - 1] - sig[n - 1], histP = macd[n - 2] - sig[n - 2];
    var v5 = avg(v.slice(-5)), v20 = avg(v.slice(-20));
    var ret5 = pct(px, c[n - 6]), ret20 = pct(px, c[n - 21] || c[0]), day = pct(px, c[n - 2]);
    var rets = []; for (var i = Math.max(1, n - 20); i < n; i++) rets.push((c[i] / c[i - 1] - 1) * 100);
    var vol = Math.sqrt(avg(rets.map(function (x) { return x * x; })) - Math.pow(avg(rets), 2));
    var tv20 = avg(cs.slice(-20).map(function (x) { return x[4] * x[5]; })) / 1e8; // 20일 평균 거래대금(억)
    var good = [], bad = [];

    /* 추세 40 */
    var t = 0;
    if (m20 && px > m20) t += 6; if (m20 && m60 && m20 > m60) t += 6; if (m120 && px > m120) t += 4;
    var slope = pct(m20, m20p);
    if (slope != null) t += slope >= 1 ? 6 : slope > 0 ? 3 : 0;
    if (r != null) t += (r >= 50 && r <= 65) ? 8 : ((r >= 45 && r < 50) || (r > 65 && r <= 70)) ? 5 : ((r >= 40 && r < 45) || (r > 70 && r <= 75)) ? 2 : 0;
    t += hist > 0 && hist > histP ? 5 : hist > 0 ? 3 : 0;
    var vr = v20 ? v5 / v20 : null;
    t += vr != null && vr >= 1.2 && ret5 > 0 ? 5 : vr != null && vr >= 1 ? 3 : 0;
    if (m20 && m60 && m120 && px > m20 && m20 > m60 && m60 > m120) good.push('이평선 정배열(20>60>120일)');
    else if (m20 && m60 && px < m20 && m20 < m60) bad.push('20일선 아래·역배열');
    if (slope != null && slope >= 1) good.push('20일선 상승 중(' + f1(slope) + '%/주)');
    if (hist > 0 && histP <= 0) good.push('MACD 상향 전환');
    if (vr != null && vr >= 1.5 && ret5 > 0) good.push('거래량 증가 동반 상승(' + vr.toFixed(1) + '배)');

    /* 수급 25 */
    var fl = (d.flows || []).filter(function (x) { return x && x.v != null; }), f = null, fbuy = 0, ibuy = 0;
    if (fl.length >= 5) {
      var last = fl.slice(-20), sumFI = 0, sumV = 0;
      last.forEach(function (x) { sumFI += (+x.f || 0) + (+x.i || 0); sumV += +x.v || 0; });
      var ratio = sumV ? sumFI / sumV : 0;
      f = ratio >= 0.10 ? 15 : ratio >= 0.05 ? 12 : ratio >= 0.02 ? 9 : ratio >= 0 ? 6 : ratio >= -0.05 ? 3 : 0;
      var l5 = fl.slice(-5), f5 = 0, i5 = 0;
      l5.forEach(function (x) { f5 += +x.f || 0; i5 += +x.i || 0; });
      f += f5 > 0 && i5 > 0 ? 5 : (f5 > 0 || i5 > 0) ? 3 : 0;
      for (var k = fl.length - 1; k >= 0 && (+fl[k].f || 0) > 0; k--) fbuy++;
      for (var q = fl.length - 1; q >= 0 && (+fl[q].i || 0) > 0; q--) ibuy++;
      f += Math.max(fbuy, ibuy) >= 3 ? 5 : Math.max(fbuy, ibuy) >= 1 ? 2 : 0;
      if (f5 > 0 && i5 > 0) good.push('최근 5일 외국인·기관 동반 순매수');
      else if (f5 < 0 && i5 < 0) bad.push('최근 5일 외국인·기관 동반 순매도');
      if (fbuy >= 3) good.push('외국인 ' + fbuy + '일 연속 순매수');
      if (ibuy >= 3) good.push('기관 ' + ibuy + '일 연속 순매수');
      if (ratio <= -0.05) bad.push('20일 외국인·기관 순매도 우위');
    }
    var fMiss = f == null; if (fMiss) f = 12.5;

    /* 가치 20 */
    var per = num(d.per), pbr = num(d.pbr), dv = num(d.div), val = 0, vMiss = per == null && pbr == null;
    if (vMiss) val = 10;
    else {
      val += per == null ? 5 : per <= 0 ? 2 : per < 8 ? 10 : per < 12 ? 8 : per < 20 ? 6 : per < 35 ? 3 : 1;
      val += pbr == null ? 3 : pbr < 0.7 ? 6 : pbr < 1 ? 5 : pbr < 1.5 ? 4 : pbr < 3 ? 2 : 1;
      val += dv == null ? 0 : dv >= 4 ? 4 : dv >= 2 ? 3 : dv >= 1 ? 2 : dv > 0 ? 1 : 0;
      if (per != null && per > 0 && per < 10) good.push('PER ' + per.toFixed(1) + '배 (낮음)');
      if (per != null && per <= 0) bad.push('적자(PER 음수)');
      if (pbr != null && pbr < 1) good.push('PBR ' + pbr.toFixed(2) + '배 (자산가치 이하)');
      if (dv != null && dv >= 3) good.push('배당수익률 ' + dv.toFixed(1) + '%');
    }

    /* 위험 15 — 높을수록 안전 */
    var rk = 0;
    rk += vol < 1.5 ? 6 : vol < 2.5 ? 5 : vol < 3.5 ? 3 : vol < 5 ? 1 : 0;
    var h52 = num(d.h52) || Math.max.apply(null, c.slice(-250)), l52 = num(d.l52) || Math.min.apply(null, c.slice(-250));
    var pos = h52 > l52 ? (px - l52) / (h52 - l52) : 0.5;
    rk += pos >= 0.4 && pos <= 0.85 ? 5 : pos > 0.85 ? 3 : pos >= 0.2 ? 3 : 1;
    var hot = (r != null && r > 75) || (ret5 != null && ret5 > 20) || (day != null && day > 15);
    rk += hot ? 0 : 4;
    if (vol >= 5) bad.push('변동성 큼(하루 ±' + vol.toFixed(1) + '%)');
    if (hot) bad.push(r > 75 ? 'RSI ' + Math.round(r) + ' 과열' : '단기 급등(5일 ' + f1(ret5) + '%)');
    if (pos < 0.2) bad.push('52주 최저가 부근');

    var total = Math.round(t + f + val + rk);
    var grade = total >= 75 ? 'A' : total >= 62 ? 'B' : total >= 50 ? 'C' : total >= 38 ? 'D' : 'E';
    var view = total >= 62 ? '긍정' : total >= 50 ? '중립' : '주의';
    return {
      total: total, grade: grade, view: view,
      parts: { trend: [t, 40], flow: [Math.round(f), 25], value: [val, 20], risk: [rk, 15] },
      miss: { flow: fMiss, value: vMiss },
      good: good.slice(0, 4), bad: bad.slice(0, 3),
      m: { px: px, day: day, ret5: ret5, ret20: ret20, rsi: r, vol: vol, pos: pos, per: per, pbr: pbr, div: dv, tv20: tv20,
           ma20: m20, ma60: m60, date: cs[n - 1][0] }
    };
  }
  var api = { score: score, VIEW_DESC: { '긍정': '추세·수급이 받쳐주는 편', '중립': '방향이 뚜렷하지 않음', '주의': '추세·수급·위험 중 약한 곳이 많음' } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VScore = api;
})(typeof window !== 'undefined' ? window : globalThis);
