/* Dedicated read-only paper trading dashboard. Account decisions remain in the runner. */
var _quantMarket='KR', _quantTab='overview', _quantFilter='all';
var _quantData={}, _quantBusy={}, _quantError={};
function quantOpen(m){ if(m==='KR'||m==='US')_quantMarket=m; showView('quant'); }
function quantSet(kind,value){
  if(kind==='market'&&['KR','US'].includes(value))_quantMarket=value;
  if(kind==='tab'&&['overview','positions','orders','trades','reviews'].includes(value))_quantTab=value;
  if(kind==='filter'&&['all','pass','hold','evidence'].includes(value))_quantFilter=value;
  renderQuant();
}
function quantLoad(m,force){
  if(_quantBusy[m]||(!force&&_quantData[m]))return;
  _quantBusy[m]=true; _quantError[m]='';
  var controller=new AbortController(), timer=setTimeout(function(){controller.abort();},20000);
  fetch('feeds/paper-'+m.toLowerCase()+'.json',{cache:'no-store',signal:controller.signal})
    .then(function(r){if(!r.ok)throw Error();return r.json();})
    .then(function(p){
      var a=p&&p.account;
      if(!a||a.market!==m||a.mode!=='paper'||!Number.isFinite(a.equity)||!Number.isFinite(a.cash)||!(a.initialCapital>0)||!['positions','pending','trades','history'].every(function(k){return Array.isArray(a[k]);}))throw Error();
      _quantData[m]=p; if(typeof _PAPER!=='undefined')_PAPER[m]=p;
    }).catch(function(){_quantError[m]='계좌 자료를 불러오지 못했어요. 다시 불러오기를 눌러주세요.';})
    .finally(function(){clearTimeout(timer);_quantBusy[m]=false;if(_quantMarket===m)renderQuant(false);});
}
function quantDate(d){return /^\d{8}$/.test(String(d||''))?String(d).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1.$2.$3'):'—';}
function quantTime(d){return d&&Number.isFinite(Date.parse(d))?new Date(d).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'medium',hourCycle:'h23'}):'—';}
function quantTable(headers,rows,empty){
  if(!rows.length)return '<p class="qt-empty">'+esc(empty)+'</p>';
  return '<div class="qt-scroll" tabindex="0"><table><thead><tr>'+headers.map(function(x){return '<th>'+esc(x)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(x){return '<td>'+x+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
}
function quantReview(r){
  var labels={review_pass:'AI 검토 통과',risk_hold:'AI 위험 보류',waiting_evidence:'자료 부족',quota_wait:'무료 한도 대기',api_error:'AI 연결 오류',api_or_parse_error:'AI 응답 확인 대기',review_invalid:'근거 검증 실패',review_incomplete:'AI 응답 미완료'};
  var reasons={ir_unsupported:'공식 IR 수집 미지원',sec_access_denied:'SEC 접근 거부',already_pending:'이미 주문 대기 중',position_already_allocated:'이미 보유 중',drawdown_pause:'계좌 하락 한도 도달',budget_below_one_share:'배정 금액 부족',quant_conditions_not_met:'선정 조건 미충족',quote_or_costs_invalid:'가격·비용 확인 필요'};
  var v=r.review||{};
  return '<details class="qt-review"><summary><b>'+esc(r.name||r.symbol)+'</b> <span>'+esc(r.symbol)+' · '+esc(labels[r.status]||'검토 대기')+' · 추천 '+quantDate(r.sourceDate)+'</span></summary>'
    +'<p>'+esc(v.company||'회사 설명 미확보')+'</p><p>'+esc(v.reason||reasons[r.evidenceReason]||'충분한 근거를 확보하지 못해 검토를 보류했어요.')+'</p>'
    +(r.secReason?'<p>'+esc(reasons[r.secReason]||'SEC 자료 확인 대기')+'</p>':'')
    +(r.entryStatus?'<p>검토 당시 주문 판단: '+esc(r.entryStatus==='ready'?'모의주문 준비':reasons[r.entryReason]||'매수 조건 확인 대기')+' · 현재 상태는 보유·주문 탭에서 확인하세요.</p>':'')
    +'<p class="qt-muted">검토 '+esc(quantTime(v.createdAt))+' · 근거 유효기한 '+esc(quantTime(v.expiresAt))+' (한국시간)</p>'
    +'<ul>'+(r.sources||[]).filter(function(s){try{return new URL(s.url).protocol==='https:';}catch(e){return false;}}).map(function(s){return '<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title||'확인한 자료')+'</a> · '+esc(s.provider==='official_ir'?'공식 IR':s.type==='filing'?'공시':'기사')+' · '+esc(quantTime(s.publishedAt))+'</li>';}).join('')+'</ul></details>';
}
function quantChart(a,money){
  var rows=a.history.filter(function(x){return Number.isFinite(x.equity);});
  if(!rows.length)return '<p class="qt-empty">평가 기록이 쌓이면 수익 추이가 표시돼요.</p>';
  var vals=rows.map(function(x){return x.equity;}).concat([a.initialCapital]);
  var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),pad=Math.max((hi-lo)*.15,a.initialCapital*.001);lo-=pad;hi+=pad;
  var y=function(n){return 20+(hi-n)/(hi-lo)*130;};
  var pts=rows.map(function(x,i){return [20+(rows.length===1?280:i/(rows.length-1)*560),y(x.equity)];});
  return '<svg class="qt-chart" viewBox="0 0 600 190" role="img" aria-label="모의계좌 평가액 추이, 아래 표에서 날짜별 수치를 확인할 수 있어요"><line x1="20" y1="'+y(a.initialCapital)+'" x2="580" y2="'+y(a.initialCapital)+'" class="qt-base"/><polyline points="'+pts.map(function(p){return p.join(',');}).join(' ')+'"/>'+pts.map(function(p,i){return '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3"><title>'+quantDate(rows[i].date)+' '+money(rows[i].equity)+'</title></circle>';}).join('')+'<text x="20" y="183">'+quantDate(rows[0].date)+'</text><text x="580" y="183" text-anchor="end">'+quantDate(rows[rows.length-1].date)+'</text></svg><p class="qt-muted">점선은 시작 자금 · 거래일별 평가액, 실시간 시세가 아니에요.</p><details><summary>날짜별 평가액 보기</summary>'+quantTable(['거래일','평가액','현금','시작 대비'],rows.slice().reverse().map(function(x){return [quantDate(x.date),money(x.equity),money(x.cash),((x.equity/a.initialCapital-1)*100).toFixed(2)+'%'];}),'평가 기록 없음')+'</details>';
}
function renderQuant(load){
  var el=document.getElementById('quantBoard');if(!el)return;
  var m=_quantMarket, p=_quantData[m];if(load!==false&&!p&&!_quantBusy[m]&&!_quantError[m])quantLoad(m);
  var btn=function(kind,key,label,active){return '<button type="button" aria-pressed="'+active+'" class="qt-btn'+(active?' on':'')+'" data-qt-'+kind+'="'+key+'">'+esc(label)+'</button>';};
  var h='<div class="qt-head"><div><h1>퀀트 트레이딩</h1><p class="qt-muted">가상 자금으로 운용하는 AI·퀀트 모의계좌</p></div><button class="qt-btn" data-qt-refresh '+(_quantBusy[m]?'disabled':'')+'>'+(_quantBusy[m]?'불러오는 중…':'다시 불러오기')+'</button></div><div class="qt-controls">'+btn('market','KR','국내 · 원화',m==='KR')+btn('market','US','미국 · 달러',m==='US')+'</div>';
  if(_quantError[m])h+='<p role="alert" class="qt-status">'+esc(_quantError[m])+(p?' 아래는 마지막으로 불러온 자료예요.':'')+'</p>';
  if(!p)h+='<div class="card qt-box">'+(_quantBusy[m]?'모의계좌를 불러오고 있어요.':'계좌 자료 확인 대기')+'</div>';
  else {
    var a=p.account, money=function(n){return Number.isFinite(n)?(m==='US'?'$':'₩')+n.toLocaleString('ko-KR',{maximumFractionDigits:m==='US'?2:0}):'—';};
    var pct=function(n){return Number.isFinite(n)?n.toFixed(2)+'%':'—';};
    var pnl=a.equity-a.initialCapital, unreal=a.positions.reduce(function(s,x){return s+x.quantity*(x.lastPrice-x.costBasis);},0), realized=a.trades.reduce(function(s,t){return s+(t.side==='sell'&&Number.isFinite(t.pnl)?t.pnl:0);},0), costs=a.trades.reduce(function(s,t){return s+(t.cost||0);},0);
    var reserved=a.pending.reduce(function(s,x){return s+(x.reserved||0);},0), cov=p.filingCoverage||{};
    h+='<div class="qt-status" role="status"><b>'+esc(p.message||'계좌 상태 확인 대기')+'</b>'+(a.paused?'<p>신규 매수 중단 · 보유 종목의 보호 매도는 계속돼요.</p>':'')+'<p class="qt-muted">추천 기준 '+quantDate(p.sourceDate)+' · 평가 기준 '+quantDate(p.valuationDate||a.lastDate)+' · 마지막 실행 '+esc(quantTime(p.updatedAt))+' (한국시간)</p></div>';
    h+='<div class="qt-controls qt-tabs">'+[['overview','운용 현황'],['positions','보유 종목 '+a.positions.length],['orders','대기 주문 '+a.pending.length],['trades','매매 기록 '+a.trades.length],['reviews','AI 검토']].map(function(x){return btn('tab',x[0],x[1],_quantTab===x[0]);}).join('')+'</div>';
    if(_quantTab==='overview'){
      var stats=[['총 평가액',money(a.equity)],['누적 손익',money(pnl)+' / '+pct(pnl/a.initialCapital*100)],['현금',money(a.cash)],['보유 평가손익',money(unreal)],['실현 손익',money(realized)],['최고점 대비 하락',pct(Math.max(0,1-a.equity/a.peakEquity)*100)]];
      h+='<div class="qt-grid">'+stats.map(function(x){return '<div class="card qt-box"><span class="qt-muted">'+x[0]+'</span><strong>'+x[1]+'</strong></div>';}).join('')+'</div><section class="card qt-box"><h2>평가액 추이</h2>'+quantChart(a,money)+'</section>';
      h+='<section class="card qt-box"><h2>자금과 수집 상태</h2><p>시작 자금 '+money(a.initialCapital)+' · 주문 예약액 '+money(reserved)+' · 예약 제외 현금 '+money(Math.max(0,a.cash-reserved))+'</p><p>누적 모의 비용 '+money(costs)+' · 매매 금액당 비용 가정 '+pct(a.costRate*100)+'</p><p class="qt-muted">실현 손익은 매수·매도 비용 반영, 보유 평가손익은 매수 비용 반영·향후 매도 비용 제외예요. 예약액은 현금에서 아직 출금되지 않았어요.</p><p>추천 기준일 검토 '+(cov.checked||0)+'건 · 공시 확보 '+(cov.verified||0)+'건 · 공식 IR '+(cov.officialIr||0)+'건 · 자료 부족 '+(cov.held||0)+'건</p></section>';
      h+='<section class="card qt-box"><h2>운용 규칙</h2><p>거래대금·재무·가격 조건 → 기사·공시 확보 → AI 위험 검토 → 다음 거래일 모의주문 → 보유 관리</p><p>20~60거래일 중기 검증 · 종목당 최대 15% · 손절 계획 손실 1% · 최고 평가액 대비 15% 하락 시 신규 매수 중단</p><p>Gemini 무료 한도 · 시장별 UTC 날짜당 최대 3회 검토 · 자료 부족·AI 오류·한도 소진 시 신규 검토와 매수 대기</p><p class="qt-muted">일봉 기반 모의 체결이에요. 가격 급변 시 계획 손실을 넘을 수 있어요. GitHub Actions에서 자동 실행되며 이 화면의 새로고침은 자료만 다시 읽어요.</p></section>';
    }
    var name=function(x){return '<b>'+esc(x.name||x.symbol)+'</b><br><small>'+esc(x.symbol)+'</small>';};
    if(_quantTab==='positions')h+='<section class="card qt-box"><h2>보유 종목</h2>'+quantTable(['종목','수량·보유일','비용 포함 매입단가','평가 기준 종가','평가손익','계좌 비중','손절가','1차 / 최종 목표','매수일'],a.positions.map(function(x){return [name(x),x.quantity+'주 / '+x.heldDays+'거래일',money(x.costBasis),money(x.lastPrice),money(x.quantity*(x.lastPrice-x.costBasis)),pct(x.quantity*x.lastPrice/a.equity*100),money(x.stop),money(x.target1)+' / '+money(x.target)+(x.firstTargetDone?'<br>1차 매도 완료':''),quantDate(x.entryDate)];}),'현재 보유 종목이 없어요.')+'</section>';
    if(_quantTab==='orders')h+='<section class="card qt-box"><h2>다음 거래일 대기 주문</h2><p class="qt-muted">검토 통과가 체결을 보장하지는 않아요. 다음 관측 거래일의 가격·유효기한·계좌 한도를 다시 검사하고, 조건이 맞지 않으면 주문을 제거해요.</p>'+quantTable(['종목','예정 수량','지정 매수가','손절가','예약액','계획 손실·비중','추천 기준일','AI 근거 유효기한 (한국시간)'],a.pending.map(function(x){var risk=x.quantity*(x.entry-x.stop+(x.entry+x.stop)*a.costRate);return [name(x),x.quantity+'주',money(x.entry),money(x.stop),money(x.reserved),money(risk)+' / '+pct(risk/a.equity*100),quantDate(x.signalDate),esc(quantTime(x.reviewExpiresAt))];}),'대기 중인 모의주문이 없어요.')+'</section>';
    if(_quantTab==='trades'){
      var reasons={reviewed_limit_entry:'AI 검토 후 지정가 매수',stop:'손절',target:'최종 목표가',first_target:'1차 목표가 분할 매도',max_holding:'최대 보유기간 도달'};
      h+='<section class="card qt-box"><h2>매매 기록</h2>'+quantTable(['거래일','종목','구분','수량','체결가','모의 비용','실현 손익','체결 사유'],a.trades.slice().reverse().map(function(t){return [quantDate(t.date),name(t),t.side==='buy'?'매수':'매도',t.quantity+'주',money(t.price),money(t.cost),t.side==='sell'?money(t.pnl):'—',esc(reasons[t.reason]||'기록 확인 필요')];}),'아직 모의 체결 기록이 없어요.')+'</section>';
    }
    if(_quantTab==='reviews'){
      var reviews=(p.reviews||[]).slice().reverse(), filters=[['all','전체 이력'],['pass','검토 통과'],['hold','위험 보류'],['evidence','자료 부족']];
      h+='<section class="card qt-box"><h2>AI 검토 이력</h2><p class="qt-muted">이전 추천일의 판단도 포함돼요. 통과 후에도 계좌·가격 조건으로 주문이 보류될 수 있어요.</p><div class="qt-controls">'+filters.map(function(x){return btn('filter',x[0],x[1],_quantFilter===x[0]);}).join('')+'</div>';
      reviews=reviews.filter(function(r){return _quantFilter==='all'||r.status===({pass:'review_pass',hold:'risk_hold',evidence:'waiting_evidence'})[_quantFilter];});
      h+='<p>'+reviews.length+'건 · 종목을 펼치면 이유와 출처를 볼 수 있어요.</p>'+reviews.map(quantReview).join('')+(!reviews.length?'<p class="qt-empty">해당 검토 이력이 없어요.</p>':'')+'</section>';
    }
  }
  el.innerHTML=h;
  el.querySelectorAll('[data-qt-market],[data-qt-tab],[data-qt-filter]').forEach(function(b){b.onclick=function(){['market','tab','filter'].forEach(function(k){if(b.hasAttribute('data-qt-'+k))quantSet(k,b.getAttribute('data-qt-'+k));});};});
  el.querySelector('[data-qt-refresh]').onclick=function(){quantLoad(m,true);renderQuant(false);};
}
