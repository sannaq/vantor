/* Dedicated read-only paper trading dashboard. Account decisions remain in the runner. */
var _quantMarket='KR', _quantTab='overview', _quantFilter='all';
var _quantData={}, _quantBusy={}, _quantError={};
function quantOpen(m){ if(m==='KR'||m==='US')_quantMarket=m; showView('quant'); }
function quantSet(kind,value){
  if(kind==='market'&&['KR','US'].includes(value))_quantMarket=value;
  if(kind==='tab'&&['overview','positions','orders','trades','reviews','trainer'].includes(value))_quantTab=value;
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
var _quantReviewLabels={review_pass:'AI 검토 통과',risk_hold:'AI 위험 보류',waiting_evidence:'자료 부족',quota_wait:'무료 한도 대기',api_error:'AI 연결 오류',api_or_parse_error:'AI 응답 확인 대기',review_invalid:'근거 검증 실패',review_incomplete:'AI 응답 미완료'};
var _quantReasons={
  trend_not_positive:'최근 20거래일 수익률이 0% 초과가 아니라 상승추세 전략에서 제외했어요.',trend_data_missing:'20거래일 수익률 자료가 없어 상승추세 전략에서 제외했어요.',outside_low_vol_half:'공통 후보 중 변동성이 낮은 절반에 들지 않아 저변동 전략에서 제외했어요.',vol_data_missing:'변동성 자료가 없어 저변동 전략에서 제외했어요.',
  ir_unsupported:'이 기업의 공식 IR 원문 수집을 아직 지원하지 않아요.',sec_access_denied:'SEC가 자료 요청을 거부했어요.',
  already_pending:'같은 종목의 주문이 이미 대기 중이에요.',position_already_allocated:'같은 종목을 이미 보유하고 있어요.',
  drawdown_pause:'계좌 하락 한도에 도달해 신규 매수를 중단했어요.',budget_below_one_share:'현금·종목 비중·계획 손실 한도 안에서 1주를 배정할 수 없어요.',
  entry_capacity_insufficient:'체결 시점의 현금·비중·위험 한도에서 유효한 매수 수량을 확보하지 못했어요.',
  quant_conditions_not_met:'퀀트 선정 조건을 충족하지 못했어요.',quote_or_costs_invalid:'가격 또는 모의 비용 정보를 확인할 수 없어요.',
  review_time_invalid:'AI 검토 시각 또는 유효기한이 유효하지 않아요.',review_expired:'거래 시작 전에 AI 근거 유효기한이 지났어요.',
  open_below_stop:'시가가 손절가 이하라 매수하지 않았어요.',limit_not_reached:'다음 관측 거래일의 저가가 지정 매수가보다 높아 체결되지 않았어요.',
  news_list_unavailable:'뉴스 목록 서버에 접근하지 못했어요.',news_list_invalid:'뉴스 목록 응답 형식을 확인해야 해요.',
  news_empty:'현재 뉴스 수집처에 이 종목의 기사 목록이 없어요.',news_stale:'수집한 기사들이 허용 기간을 지나 보류했어요.',
  news_date_invalid:'기사 발행 시각이 없거나 미래라 검토에 쓰지 않았어요.',news_url_invalid:'검증된 기사 주소 형식이 아니라 보류했어요.',
  news_body_unavailable:'뉴스 목록은 있지만 기사 본문을 가져오지 못했어요.',news_body_short:'확보한 기사 본문이 검토에 필요한 최소 길이보다 짧아요.',
  news_missing:'공시는 확보했지만 검토에 필요한 기사를 확보하지 못했어요.',waiting_sec_contact:'SEC 요청용 연락처 설정을 확인해야 해요.',
  sec_issuer_missing:'SEC 기업 식별 정보를 찾지 못했어요.',sec_issuer_mismatch:'SEC 자료의 기업 정보가 일치하지 않아요.',
  sec_filing_missing:'검토에 쓸 SEC 공시를 확보하지 못했어요.',sec_document_invalid:'SEC 원문 검증을 통과하지 못했어요.',sec_rate_limited:'SEC 요청 한도에 도달했어요.',
  ir_source_mismatch:'공식 IR 출처가 해당 기업과 일치하지 않아요.',ir_unavailable:'공식 IR 자료에 접근하지 못했어요.',
  ir_document_too_large:'공식 IR 원문이 수집 크기 한도를 초과했어요.',ir_issuer_mismatch:'공식 IR 원문의 기업 정보가 일치하지 않아요.',
  ir_filing_stale:'공식 IR 공시가 검토에 필요한 최신성 기준을 충족하지 못했어요.',ir_document_invalid:'공식 IR 원문 검증을 통과하지 못했어요.',ir_document_unavailable:'공식 IR 원문을 가져오지 못했어요.',
  ai_risk_hold:'AI가 위험 요인을 확인해 매수를 보류했어요.',review_missing_or_mismatched:'해당 종목·추천 자료와 일치하는 AI 검토가 없어요.',
  review_expired_or_invalid:'AI 검토가 만료됐거나 유효하지 않아요.',review_invalid:'AI 근거 검증을 통과하지 못했어요.',
  evidence_missing:'필수 근거 자료가 없어요.',evidence_unverified:'근거 자료 검증을 통과하지 못했어요.',evidence_date_invalid:'근거 자료의 날짜가 유효하지 않아요.',evidence_url_invalid:'근거 자료의 주소가 유효하지 않아요.'
};
function quantReason(code){return _quantReasons[code]||'구체적인 사유 기록을 확인해야 해요.';}
// Review identity is essential: another recommendation cycle for the same ticker is not proof of a fill.
function quantOutcome(r,a,money){
  var id=r.review&&r.review.id, same=function(x){return !!id&&x.reviewId===id&&x.symbol===r.symbol;};
  var pos=a.positions.find(same), pending=a.pending.find(same), buys=a.trades.filter(function(t){return same(t)&&t.side==='buy';});
  var purchase=buys.length?{quantity:buys.reduce(function(s,t){return s+t.quantity;},0),amount:buys.reduce(function(s,t){return s+t.price*t.quantity;},0)}:pos?quantPurchase(a,pos):null;
  if(purchase)return {kind:'bought',label:'모의매수 체결',text:quantDate(buys.length?buys[0].date:pos.entryDate)+' · '+money(purchase.amount/purchase.quantity)+' × '+purchase.quantity+'주 · 매수 금액 '+money(purchase.amount)+' (비용 별도). '+(pos?'현재 '+pos.quantity+'주 보유 중이에요.':'현재 이 검토로 매수한 보유분은 없어요.')};
  if(pos)return {kind:'bought',label:'모의매수·보유 확인',text:'현재 '+pos.quantity+'주 보유 중이며, 원래 체결 가격·수량 기록은 확인이 필요해요.'};
  if(pending)return {kind:'pending',label:'모의주문 대기',text:'지정 매수가 '+money(pending.entry)+' × '+pending.quantity+'주 예정'+(pending.sizeReason==='earnings_soon'?'(실적 발표 전 절반 비중)':'')+'. 다음 관측 거래일의 가격·유효기한·계좌 한도를 확인한 뒤 체결 여부가 정해져요.'};
  var event=(a.orderEvents||[]).slice().reverse().find(same);
  if(event)return {kind:'not_bought',label:'미매수 · 주문 종료',text:quantDate(event.date)+' · '+quantReason(event.reason)};
  if(r.status==='risk_hold')return {kind:'not_bought',label:'미매수 · AI 위험 보류',text:'이 검토에서는 AI 위험 판단으로 신규 주문을 만들지 않았어요.'};
  if(r.status==='waiting_evidence')return {kind:'not_bought',label:'미매수 · 자료 부족',text:quantReason(r.evidenceReason)};
  if(r.entryStatus&&r.entryStatus!=='ready')return {kind:'not_bought',label:'미매수 · 주문 조건 미충족',text:quantReason(r.entryReason)};
  if(r.status==='review_pass')return {kind:'unknown',label:'체결 결과 확인 필요',text:'AI 검토는 통과했지만 이 검토에 연결된 체결·대기·종료 기록을 찾지 못했어요. 과거 주문의 종료 사유는 추측하지 않아요.'};
  return {kind:'not_bought',label:'미매수 · 검토 미완료',text:(_quantReviewLabels[r.status]||'검토 상태 확인 필요')+' 상태라 이 검토를 근거로 매수하지 않았어요.'};
}
function quantReview(r,a,money){
  var v=r.review||{}, o=quantOutcome(r,a,money), reason=v.reason||quantReason(r.evidenceReason||r.entryReason);
  var excerpt=reason.length>160?reason.slice(0,160)+'…':reason;
  return '<details class="qt-review"><summary><b>'+esc(r.name||r.symbol)+'</b> <span>'+esc(r.symbol)+' · '+esc(_quantReviewLabels[r.status]||'검토 대기')+' · 추천 '+quantDate(r.sourceDate)+'</span>'
    +'<span class="qt-review-outcome">'+esc(o.label)+'</span><span class="qt-review-excerpt">'+esc(v.reason?'AI 근거 발췌: ':'보류 사유: ')+esc(excerpt)+'</span><span>상세 근거·주문 결과 펼치기</span></summary>'
    +'<div class="qt-review-detail"><h3>주문 결과 · 왜 샀거나 사지 않았나요?</h3><p><b>'+esc(o.label)+'</b> · '+esc(o.text)+'</p>'
    +(r.sizeReason==='earnings_soon'?'<p><b>실적 발표 전 · 절반 비중</b> · '+(r.earnDate?quantDate(r.earnDate)+' 실적 발표 예정이라 ':'실적 발표를 앞두고 있어 ')+'평소 배정의 절반만 매수해요.</p>':'')
    +(r.entryStatus?'<p>검토 당시 주문 판단: '+esc(r.entryStatus==='ready'?'AI 검토와 주문 생성 조건을 통과해 모의주문을 준비했어요.':quantReason(r.entryReason))+'</p>':'')
    +(r.signal?'<p class="qt-muted">전략 판단 당시: 20거래일 수익률 '+(Number.isFinite(r.signal.ret20)?r.signal.ret20.toFixed(2)+'%':'자료 없음')+' · 변동성 '+(Number.isFinite(r.signal.vol)?(r.signal.vol*100).toFixed(2)+'%':'자료 없음')+' · 저변동 선정 '+esc(r.signal.lowVolCount)+'/'+esc(r.signal.universeSize)+'종목</p>':'')
    +'<h3>AI 검토 근거 전문</h3><p class="qt-reason">'+esc(reason)+'</p><p class="qt-muted">'+esc(v.reason?'검토 당시 저장된 AI 판단이에요. 위 발췌는 원문 앞부분이며, 체결 여부는 주문 결과에 따로 표시해요.':'AI 판단을 생성하기 전 자료 확보 또는 검증 단계에서 보류된 기록이에요.')+'</p>'
    +(v.company?'<p>기업 설명: '+esc(v.company)+'</p>':'')+(r.secReason?'<p>SEC 수집 상태: '+esc(quantReason(r.secReason))+'</p>':'')
    +(r.newsDiagnostics?'<p>뉴스 확인: 최근 '+esc(r.newsDiagnostics.maxAgeDays)+'일 이내 원문 필요 · 목록 '+esc(r.newsDiagnostics.checked)+'건 확인 · 기간 초과 '+esc(r.newsDiagnostics.stale)+'건 · 본문 접근 실패 '+esc(r.newsDiagnostics.unavailable)+'건 · 본문 길이 부족 '+esc(r.newsDiagnostics.shortBody)+'건'+(r.newsDiagnostics.latestPublishedAt?' · 가장 최근 기사 '+esc(quantTime(r.newsDiagnostics.latestPublishedAt))+' (한국시간)':'')+'</p>':'')
    +'<h3>확인한 자료와 검토 시각</h3><p class="qt-muted">검토 '+esc(quantTime(v.createdAt))+' · 근거 유효기한 '+esc(quantTime(v.expiresAt))+' (한국시간)</p>'
    +'<ul>'+(r.sources||[]).filter(function(s){try{return new URL(s.url).protocol==='https:';}catch(e){return false;}}).map(function(s){return '<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title||'확인한 자료')+'</a> · '+esc(s.provider==='official_ir'?'공식 IR':s.type==='filing'?'공시':'기사')+' · '+esc(quantTime(s.publishedAt))+'</li>';}).join('')+'</ul>'+(!(r.sources||[]).length?'<p class="qt-muted">저장된 검토 출처가 없어요.</p>':'')+'</div></details>';
}
function quantReviewSummary(reviews,a,money){
  var counts={bought:0,pending:0,not_bought:0,unknown:0},reasons={},bought=[];
  reviews.forEach(function(r){var o=quantOutcome(r,a,money);counts[o.kind]++;if(o.kind==='bought')bought.push(r.name||r.symbol);if(o.kind==='not_bought')reasons[o.label]=(reasons[o.label]||0)+1;});
  return '<section class="card qt-box qt-review-summary"><h2>검토·매매 요약</h2><p>저장된 검토 '+reviews.length+'건 중 모의매수 '+counts.bought+'건 · 주문 대기 '+counts.pending+'건 · 미매수 '+counts.not_bought+'건 · 결과 확인 필요 '+counts.unknown+'건</p>'
    +(bought.length?'<p><b>매수 확인:</b> '+bought.map(esc).join(', ')+'</p>':'<p>이 검토 이력에 연결된 모의매수는 아직 없어요.</p>')
    +(Object.keys(reasons).length?'<p><b>미매수 사유:</b> '+Object.keys(reasons).map(function(k){return esc(k.replace('미매수 · ',''))+' '+reasons[k]+'건';}).join(' · ')+'</p>':'')
    +'<p class="qt-muted">현재 시장의 전체 저장 이력 기준이며 아래 필터와 무관해요. 종목 수가 아닌 검토 건수로, 같은 종목의 다른 날짜 검토도 포함해요. AI 통과와 모의매수 체결을 구분하며 연결 기록이 없는 과거 결과는 확인 필요로 표시해요.</p></section>';
}
function quantTrainerMetrics(a){
  var peak=a.initialCapital,mdd=0;
  a.history.forEach(function(h){peak=Math.max(peak,h.equity);mdd=Math.max(mdd,1-h.equity/peak);});
  var buys=a.trades.filter(function(x){return x.side==='buy';}),closed=0,wins=0;
  var ids=Array.from(new Set(buys.map(function(x){return x.reviewId;}).filter(Boolean)));
  ids.forEach(function(id){var bought=buys.filter(function(x){return x.reviewId===id;}).reduce(function(s,x){return s+x.quantity;},0),sold=a.trades.filter(function(x){return x.side==='sell'&&x.reviewId===id;});
    if(sold.reduce(function(s,x){return s+x.quantity;},0)>=bought){closed++;if(sold.reduce(function(s,x){return s+(x.pnl||0);},0)>0)wins++;}
  });
  return {pnl:a.equity-a.initialCapital,rate:(a.equity/a.initialCapital-1)*100,mdd:mdd*100,days:Math.max(0,a.history.length-1),closed:closed,wins:wins,buys:buys.length};
}
function quantTrainer(p,money){
  var t=p.trainer;
  if(!t||!Array.isArray(t.accounts))return '<section class="card qt-box"><h2>전략 비교</h2><p>첫 비교 계좌 생성 대기 중이에요. 자동 실행이 완료되면 기존·상승추세·저변동 계좌가 표시돼요.</p></section>';
  var error=p.trainerStatus||p.status==='price_data_missing',valid=t.version===1&&t.accounts.length===3&&t.accounts.every(function(s){return s.account&&Array.isArray(s.reviews)&&['history','positions','pending','trades'].every(function(k){return Array.isArray(s.account[k]);});});
  if(!valid)return '<section class="card qt-box" role="alert">비교 계좌 자료를 확인해야 해요. 기존 기록을 초기화하지 않고 보존 중이에요.</section>';
  var h='<section class="card qt-box"><h2>전략 비교 요약</h2><p>기존 · 상승추세 · 저변동을 같은 시작 자금·비용·위험 한도로 비교해요. <b>운용 전략은 자동으로 바뀌지 않아요.</b></p><p>비교 시작 '+esc(quantTime(t.startedAt))+' (한국시간) · 평가 기준 '+quantDate(t.valuationDate)+'</p>'
    +(error?'<p role="alert">비교 자료 갱신 확인이 필요해요. 아래는 마지막으로 보존한 결과예요.</p>':'')
    +'<p class="qt-muted">과거 수익을 재현한 백테스트가 아니라 시작 이후 관찰 결과예요. 기존 운용에서 새로 수집하는 AI 검토 자료를 공유하며, 검토되지 않은 종목은 비교 계좌도 매수하지 않아요. 무료 검토 한도와 공시 수집 범위에 따라 거래가 적거나 전략 간 결과가 같을 수 있어요.</p>'
    +quantTable(['전략','누적 손익','수익률','최대 하락폭','관찰 거래일','매수 체결','보유 / 대기','완료 거래 / 승률'],t.accounts.map(function(s){var a=s.account,g=quantTrainerMetrics(a);return ['<b>'+esc(s.name)+'</b>',money(g.pnl),g.rate.toFixed(2)+'%',g.mdd.toFixed(2)+'%',g.days+'일',g.buys+'건',a.positions.length+' / '+a.pending.length,g.closed+'건 / '+(g.closed?(g.wins/g.closed*100).toFixed(1)+'%':'—')];}),'비교 기록 없음')
    +'<p class="qt-muted">최대 하락폭은 비교 시작 이후 평가액 고점 대비 최대 하락률이에요. 승률은 전량 매도된 거래만 집계하며 분할 매도는 완료 거래로 세지 않아요. 표본이 적을 때는 수익률만으로 우열을 확정하지 않고 거래 내역을 함께 확인하세요.</p></section>';
  t.accounts.forEach(function(s){
    var a=s.account,g=quantTrainerMetrics(a),unreal=a.positions.reduce(function(sum,x){return sum+x.quantity*(x.lastPrice-x.costBasis);},0),real=a.trades.reduce(function(sum,x){return sum+(x.side==='sell'&&Number.isFinite(x.pnl)?x.pnl:0);},0);
    h+='<section class="card qt-box qt-trainer-account"><h2>'+esc(s.name)+'</h2><p>'+esc(s.rule)+'</p><p>시작 '+money(a.initialCapital)+' · 평가 '+money(a.equity)+' · 현금 '+money(a.cash)+'</p><p>실현 손익 '+money(real)+' · 보유 평가손익 '+money(unreal)+(a.paused?' · 신규 매수 중단':'')+'</p>'
      +'<details><summary>보유·주문·매매·검토 상세 보기</summary><h3>평가액 추이</h3>'+quantChart(a,money)
      +'<h3>보유 종목과 손익</h3>'+quantTable(['종목','매수가 × 수량','현재 보유','평가 기준가','주당 손익','평가손익 / 수익률'],a.positions.map(function(x){var b=quantPurchase(a,x),v=quantPositionPnl(x);return [esc(x.name||x.symbol),b?money(b.price)+' × '+b.quantity+'주':'체결 기록 확인 필요',x.quantity+'주',money(x.lastPrice),v?money(v.unit):'—',v?money(v.total)+' / '+v.rate.toFixed(2)+'%':'—'];}),'보유 종목이 없어요.')
      +'<h3>대기 주문</h3>'+quantTable(['종목','지정 매수가','예정 수량','예약액','근거 유효기한 (한국시간)'],a.pending.map(function(x){return [esc(x.name||x.symbol),money(x.entry),x.quantity+'주',money(x.reserved),esc(quantTime(x.reviewExpiresAt))];}),'대기 주문이 없어요.')
      +'<h3>매매 기록 · 최근 30건</h3>'+quantTable(['거래일','종목','구분','체결가 × 수량','모의 비용','실현 손익'],a.trades.slice(-30).reverse().map(function(x){return [quantDate(x.date),esc(x.name||x.symbol),x.side==='buy'?'매수':'매도',money(x.price)+' × '+x.quantity+'주',money(x.cost),x.side==='sell'?money(x.pnl):'—'];}),'체결 기록이 없어요.')
      +'<h3>매수·미매수 검토 · 최근 30건</h3>'+(s.reviews.length?s.reviews.slice(-30).reverse().map(function(r){return quantReview(r,a,money);}).join(''):'<p>비교 시작 이후 새 AI 검토 자료를 기다리고 있어요.</p>')+'</details></section>';
  });
  return h;
}
function quantPurchase(account,position){
  var buys=account.trades.filter(function(t){return t.side==='buy'&&t.symbol===position.symbol&&t.date===position.entryDate&&Number.isFinite(t.price)&&t.price>0&&Number.isFinite(t.quantity)&&t.quantity>0&&Number.isFinite(t.cost);});
  if(!buys.length)return null;
  var quantity=buys.reduce(function(s,t){return s+t.quantity;},0),amount=buys.reduce(function(s,t){return s+t.price*t.quantity;},0),cost=buys.reduce(function(s,t){return s+t.cost;},0);
  return {quantity:quantity,price:amount/quantity,amount:amount,cost:cost};
}
function quantPositionPnl(x){
  if(![x.quantity,x.lastPrice,x.costBasis].every(Number.isFinite)||x.quantity<=0||x.costBasis<=0||x.lastPrice<=0)return null;
  var unit=x.lastPrice-x.costBasis;if(Math.abs(unit)<1e-9)unit=0;
  return {unit:unit,total:unit*x.quantity,rate:unit/x.costBasis*100,state:unit>0?'수익':unit<0?'손실':'보합',tone:unit>0?'qt-profit':unit<0?'qt-loss':'qt-flat'};
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
    h+='<div class="qt-controls qt-tabs">'+[['overview','운용 현황'],['positions','보유 종목 '+a.positions.length],['orders','대기 주문 '+a.pending.length],['trades','매매 기록 '+a.trades.length],['reviews','AI 검토'],['trainer','전략 비교']].map(function(x){return btn('tab',x[0],x[1],_quantTab===x[0]);}).join('')+'</div>';
    if(_quantTab==='overview'){
      var stats=[['총 평가액',money(a.equity)],['누적 손익',money(pnl)+' / '+pct(pnl/a.initialCapital*100)],['현금',money(a.cash)],['보유 평가손익',money(unreal)],['실현 손익',money(realized)],['최고점 대비 하락',pct(Math.max(0,1-a.equity/a.peakEquity)*100)]];
      h+='<div class="qt-grid">'+stats.map(function(x){return '<div class="card qt-box"><span class="qt-muted">'+x[0]+'</span><strong>'+x[1]+'</strong></div>';}).join('')+'</div><section class="card qt-box"><h2>평가액 추이</h2>'+quantChart(a,money)+'</section>';
      h+='<section class="card qt-box"><h2>자금과 수집 상태</h2><p>시작 자금 '+money(a.initialCapital)+' · 주문 예약액 '+money(reserved)+' · 예약 제외 현금 '+money(Math.max(0,a.cash-reserved))+'</p><p>누적 모의 비용 '+money(costs)+' · 매매 금액당 비용 가정 '+pct(a.costRate*100)+'</p><p class="qt-muted">실현 손익은 매수·매도 비용 반영, 보유 평가손익은 매수 비용 반영·향후 매도 비용 제외예요. 예약액은 현금에서 아직 출금되지 않았어요.</p><p>추천 기준일 검토 '+(cov.checked||0)+'건 · 공시 확보 '+(cov.verified||0)+'건 · 공식 IR '+(cov.officialIr||0)+'건 · 자료 부족 '+(cov.held||0)+'건</p></section>';
      h+='<section class="card qt-box"><h2>운용 규칙</h2><p>거래대금·재무·가격 조건 → 기사·공시 확보 → AI 위험 검토 → 다음 거래일 모의주문 → 보유 관리</p><p>20~60거래일 중기 검증 · 종목당 최대 15% · 손절 계획 손실 1% · 최고 평가액 대비 15% 하락 시 신규 매수 중단</p><p>Gemini 무료 한도 · 시장별 UTC 날짜당 최대 10회 검토 · 자료 부족·AI 오류·한도 소진 시 신규 검토와 매수 대기</p><p class="qt-muted">일봉 기반 모의 체결이에요. 가격 급변 시 계획 손실을 넘을 수 있어요. GitHub Actions에서 자동 실행되며 이 화면의 새로고침은 자료만 다시 읽어요.</p></section>';
    }
    var name=function(x){return '<b>'+esc(x.name||x.symbol)+'</b><br><small>'+esc(x.symbol)+'</small>';};
    if(_quantTab==='positions'){
      var purchaseCell=function(x){var b=quantPurchase(a,x);return name(x)+(b?'<div class="qt-entry"><b>매수가 '+money(b.price)+' × '+b.quantity+'주</b><br>매수 금액 '+money(b.amount)+'<br><span class="qt-muted">매수 비용 '+money(b.cost)+' · 총 차감 '+money(b.amount+b.cost)+'</span></div>':'<div class="qt-muted">매수 체결 기록 확인 대기</div>');};
      var signed=function(n,percent){return (n>0?'+':n<0?'−':'')+(percent?pct(Math.abs(n)):money(Math.abs(n)));};
      var gain=function(n,tone,percent){return '<b class="qt-pnl '+tone+'">'+signed(n,percent)+'</b>';};
      var basis=a.positions.reduce(function(sum,x){return sum+x.quantity*x.costBasis;},0), value=a.positions.reduce(function(sum,x){return sum+x.quantity*x.lastPrice;},0), totalTone=unreal>0?'qt-profit':unreal<0?'qt-loss':'qt-flat';
      h+='<section class="card qt-box"><h2>보유 종목</h2>';
      if(a.positions.length)h+='<div class="qt-position-summary"><div><span class="qt-muted">현재 보유 손익</span><strong>'+gain(unreal,totalTone,false)+'</strong></div><div><span class="qt-muted">보유 수익률</span><strong>'+(basis>0?gain(unreal/basis*100,totalTone,true):'—')+'</strong></div><div><span class="qt-muted">현재 보유분 원가 → 평가 금액</span><strong>'+money(basis)+' → '+money(value)+'</strong></div></div>';
      h+='<p class="qt-muted">'+quantDate(p.valuationDate||a.lastDate)+' 평가 종가 기준 · 실시간 시세가 아니에요. 주당 손익 = 평가 기준가 − 비용 포함 매입단가, 총 손익 = 주당 손익 × 보유 수량. 향후 매도 비용은 제외돼요. 매수가는 모의 체결 기록 기준이고, 분할 매도 후에는 매수 수량과 현재 보유 수량이 달라질 수 있어요.</p><p class="qt-table-hint">표를 좌우로 밀면 매입단가·평가 기준가·손절가도 확인할 수 있어요.</p>'
        +quantTable(['종목·매수 내역','현재 보유 수량','손익 상태','현재 평가손익','수익률','주당 손익','비용 포함 매입단가','평가 기준가','보유일','계좌 비중','손절가','1차 / 최종 목표','매수일'],a.positions.map(function(x){var g=quantPositionPnl(x);return [purchaseCell(x),x.quantity+'주',g?'<span class="qt-pnl-state '+g.tone+'">'+g.state+'</span>':'확인 대기',g?gain(g.total,g.tone,false):'—',g?gain(g.rate,g.tone,true):'—',g?gain(g.unit,g.tone,false):'—',money(x.costBasis),money(x.lastPrice),x.heldDays+'거래일',pct(x.quantity*x.lastPrice/a.equity*100),money(x.stop),money(x.target1)+' / '+money(x.target)+(x.firstTargetDone?'<br>1차 매도 완료':''),quantDate(x.entryDate)];}),'현재 보유 종목이 없어요.')+'</section>';
    }
    if(_quantTab==='orders')h+='<section class="card qt-box"><h2>다음 거래일 대기 주문</h2><p class="qt-muted">검토 통과가 체결을 보장하지는 않아요. 다음 관측 거래일의 가격·유효기한·계좌 한도를 다시 검사하고, 조건이 맞지 않으면 주문을 제거해요.</p>'+quantTable(['종목','예정 수량','지정 매수가','손절가','예약액','계획 손실·비중','추천 기준일','AI 근거 유효기한 (한국시간)'],a.pending.map(function(x){var risk=x.quantity*(x.entry-x.stop+(x.entry+x.stop)*a.costRate);return [name(x),x.quantity+'주',money(x.entry),money(x.stop),money(x.reserved),money(risk)+' / '+pct(risk/a.equity*100),quantDate(x.signalDate),esc(quantTime(x.reviewExpiresAt))];}),'대기 중인 모의주문이 없어요.')+'</section>';
    if(_quantTab==='trades'){
      var reasons={reviewed_limit_entry:'AI 검토 후 지정가 매수',stop:'손절',target:'최종 목표가',first_target:'1차 목표가 분할 매도',max_holding:'최대 보유기간 도달'};
      h+='<section class="card qt-box"><h2>매매 기록</h2>'+quantTable(['거래일','종목','구분','수량','체결가','모의 비용','실현 손익','체결 사유'],a.trades.slice().reverse().map(function(t){return [quantDate(t.date),name(t),t.side==='buy'?'매수':'매도',t.quantity+'주',money(t.price),money(t.cost),t.side==='sell'?money(t.pnl):'—',esc(reasons[t.reason]||'기록 확인 필요')];}),'아직 모의 체결 기록이 없어요.')+'</section>';
    }
    if(_quantTab==='trainer')h+=quantTrainer(p,money);
    if(_quantTab==='reviews'){
      var reviews=(p.reviews||[]).slice().reverse(), filters=[['all','전체 이력'],['pass','검토 통과'],['hold','위험 보류'],['evidence','자료 부족']];
      h+=quantReviewSummary(reviews,a,money);
      h+='<section class="card qt-box"><h2>종목별 상세 검토 이력</h2><p class="qt-muted">이전 추천일의 판단도 포함돼요. 통과 후에도 계좌·가격 조건으로 주문이 보류될 수 있어요.</p><div class="qt-controls">'+filters.map(function(x){return btn('filter',x[0],x[1],_quantFilter===x[0]);}).join('')+'</div>';
      reviews=reviews.filter(function(r){return _quantFilter==='all'||r.status===({pass:'review_pass',hold:'risk_hold',evidence:'waiting_evidence'})[_quantFilter];});
      h+='<p>'+reviews.length+'건 · 종목을 펼치면 이유와 출처를 볼 수 있어요.</p>'+reviews.map(function(r){return quantReview(r,a,money);}).join('')+(!reviews.length?'<p class="qt-empty">해당 검토 이력이 없어요.</p>':'')+'</section>';
    }
  }
  el.innerHTML=h;
  el.querySelectorAll('[data-qt-market],[data-qt-tab],[data-qt-filter]').forEach(function(b){b.onclick=function(){['market','tab','filter'].forEach(function(k){if(b.hasAttribute('data-qt-'+k))quantSet(k,b.getAttribute('data-qt-'+k));});};});
  el.querySelector('[data-qt-refresh]').onclick=function(){quantLoad(m,true);renderQuant(false);};
}
