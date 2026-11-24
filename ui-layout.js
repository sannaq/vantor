/* Presentation only: never creates orders or changes account state. */
function uiSign(value){
  var text=String(value??'').replace(/−/g,'-'),match=text.match(/([+-]\s*[\d,.]+)\s*%/);
  if(!match)match=text.match(/^\s*([+-][\d,.]+)/);
  var n=match?Number(match[1].replace(/[,\s]/g,'')):0;
  return n>0?'up':n<0?'down':'flat';
}
function uiMoreReco(button){var open=button.previousElementSibling.classList.toggle('all');button.setAttribute('aria-expanded',String(open));button.textContent=open?'상위 3개만 보기':'추천 전체 보기';}
function uiHomeUS(p){
  if(!p?.top?.length)return '<div class="ga-reco"><div class="ga-h">미국 추천</div><p>추천 자료 확인 대기</p></div>';
  return '<div class="ga-reco"><div class="ga-h" data-gv="reco" data-gus="1">🇺🇸 미국 추천 <small>'+esc(_vsDate(p.date))+'</small><span>전체 ›</span></div>'+p.top.slice(0,3).map(function(x,i){var day=Number(x.day);return '<div class="ga-r" data-gv="reco" data-gus="1"><b>'+(i+1)+'</b><span>'+esc(x.n)+'</span><i>'+esc(x.total)+'점</i><em class="'+(day>0?'up':day<0?'down':'flat')+'">'+(Number.isFinite(day)?(day>0?'+':'')+day.toFixed(2)+'%':'—')+'</em></div>';}).join('')+'</div>';
}
function uiHomeAccounts(kr,us){
  return '<section class="ui-home-accounts" aria-label="모의계좌 손익"><h2>모의계좌 손익</h2><div>'+[['KR',kr],['US',us]].map(function(row){var a=row[1]?.account,us=row[0]==='US',ok=a&&Number.isFinite(a.equity)&&a.initialCapital>0,pnl=ok?a.equity-a.initialCapital:null;var money=function(n){return (n<0?'−':'')+(us?'$':'₩')+Math.abs(n).toLocaleString('ko-KR',{maximumFractionDigits:us?2:0});};return '<button type="button" data-gv="quant" data-qmarket="'+row[0]+'"><b>'+(us?'미국 · 달러':'국내 · 원화')+'</b><strong class="'+(pnl>0?'up':pnl<0?'down':'flat')+'">'+(ok?(pnl>0?'+':'')+money(pnl):'자료 확인 대기')+'</strong><span>'+(ok?'누적 '+(pnl/a.initialCapital*100).toFixed(2)+'% · 총 평가액 '+money(a.equity):'계좌 자료를 불러오지 못했어요')+'</span><small>'+(ok?'평가 기준 '+quantDate(row[1].valuationDate||a.lastDate):'')+' · 모의투자</small></button>';}).join('')+'</div></section>';
}
/* Explicit KST times may fall on a different day from the weekly US-date bucket. */
function uiEventDay(item,bucket){
  var text=String(item.sub||''),m=text.match(/한국시간\s+(\d{1,2})\/(\d{1,2})\s/);
  if(m){
    var y=Number(bucket.slice(0,4)),month=Number(bucket.slice(5,7)),mm=Number(m[1]);
    if(month===12&&mm===1)y++;else if(month===1&&mm===12)y--;
    return {date:y+'-'+String(mm).padStart(2,'0')+'-'+m[2].padStart(2,'0'),known:true};
  }
  if(/한국시간\s+\d{1,2}:\d{2}/.test(text)||/^(국내|韓|한은|신규상장|공모청약)/.test(item.t||''))return {date:bucket,known:true};
  return {date:bucket,known:false};
}
function uiTodayEvents(calendar,today){
  var weeks=calendar.weeks||[],week=weeks.find(function(w){return w.from<=today&&today<=w.to;}),list=[],unknown=[],seen=new Set();
  weeks.forEach(function(w){Object.entries(w.days||{}).forEach(function(pair){pair[1].forEach(function(item){
    var d=uiEventDay(item,pair[0]),key=d.date+'|'+item.t+'|'+(item.sub||'');
    if(d.date!==today||seen.has(key))return;seen.add(key);(d.known?list:unknown).push(item);
  });});});
  var row=function(item){return '<li><b>'+esc(item.t)+'</b>'+(item.sub?'<span>'+esc(item.sub)+'</span>':'')+'</li>';},rows=list.map(row);
  return '<section class="card ui-today" data-ui-open="1"><div class="ch"><h2>오늘 일정 <small>'+esc(today)+' · 한국시간</small></h2></div><div class="pad">'+(rows.length?'<ul>'+rows.slice(0,3).join('')+'</ul>'+(rows.length>3?'<details><summary>오늘 일정 전체 '+rows.length+'건</summary><ul>'+rows.slice(3).join('')+'</ul></details>':''):'<p>'+(week?'등록된 오늘 일정이 없어요.':'오늘 날짜의 일정 자료가 아직 없어요.')+'</p>')+(unknown.length?'<details><summary>원문 날짜 '+esc(today)+' 일정 '+unknown.length+'건 · 한국시간 미확인</summary><p>미국 실적·현지 행사 등은 정확한 한국 날짜가 확인되기 전까지 오늘 일정에 합치지 않아요.</p><ul>'+unknown.map(row).join('')+'</ul></details>':'')+'<small>한국시간이 확인된 일정만 위에 표시 · 주간 표는 원문 날짜 유지</small></div></section>';
}
function uiFlowDate(j){var d=String(j.investDate||'');return /^\d{8}$/.test(d)?d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+' 기준':'기준일 미확인';}
function uiAccountHealth(state,source){
  var actual=String(state?.valuationDate||''),target=String(source?.date||''),signal=String(state?.sourceDate||state?.lastSignalDate||'');
  if(!/^\d{8}$/.test(actual)||!/^\d{8}$/.test(target))return {label:'확인 불가',tone:'unknown'};
  return actual<target||!/^\d{8}$/.test(signal)||signal<target||['update_failed','feed_stale','formula_feed_stale','error'].includes(state.status)?{label:'갱신 지연',tone:'delayed'}:{label:'정상',tone:'current'};
}
async function uiRefreshHealth(){
  var el=document.getElementById('uiHealth');if(!el)return;
  var names=['paper-kr','paper-us','formula-paper-us','stock-picks','stock-picks-us','stock-scores-us','automation-health'];
  var data=await Promise.all(names.map(function(name){return fetch('feeds/'+name+'.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});}));
  var states=[uiAccountHealth(data[0],data[3]),uiAccountHealth(data[1],data[4]),uiAccountHealth(data[2],data[5])],labels=['국내 계좌','미국 계좌','공식 비교'];
  var report=data[6],stamp=Date.parse(report?.checkedAt||''),fresh=Number.isFinite(stamp)&&Date.now()-stamp<4*3600e3&&stamp<=Date.now()+60000;
  var alertLabel=!fresh?'연결 확인 대기':report.failureAlertConfigured===true?'설정 연결됨 · 전송 검증 별도':report.failureAlertConfigured===false?'미연결':'연결 확인 대기';
  el.innerHTML='<summary>자료 상태 · '+states.map(function(x,i){return '<span class="ui-health-'+x.tone+'">'+labels[i]+' '+x.label+'</span>';}).join(' · ')+' · 실패 알림 '+alertLabel+'</summary><div>'+states.map(function(x,i){return '<p><b>'+labels[i]+' '+x.label+'</b> · 평가 '+esc(data[i]?.valuationDate||'미확인')+' / 추천 '+esc(data[i+3]?.date||'미확인')+'<br><small>계좌 저장 '+esc(data[i]?.updatedAt?new Date(data[i].updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인')+' (한국시간)</small></p>';}).join('')+'<p>정상은 공개된 최신 추천 기준일까지 평가됐다는 뜻이에요. AI 심사·매수 여부와 알림 전송 성공은 별도입니다.</p><p>실패 알림: '+alertLabel+' · '+(fresh?'설정 확인 '+esc(new Date(stamp).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})):'설정 확인 자료가 없거나 4시간 이상 지났어요.')+'</p></div>';
}
function uiCoinBar(){
  var el=document.getElementById('idxbar');if(!el)return;
  var recent=window._uiCoinAt&&Date.now()-window._uiCoinAt<120000;
  el.title='누르면 코인 홈';
  el.innerHTML='<span class="ib-lb">코인 · USDT</span>'+['BTC','ETH','SOL'].map(function(sym){var row=(window._uiCoinRows||[]).find(function(x){return x.s===sym;});return '<span><span class="ib-nm">'+sym+'</span><span class="ib-v">'+(recent&&row?coinPx(row.px):'—')+'</span>'+(recent&&row?'<span class="'+(row.ch>=0?'ui-coin-up':'ui-coin-down')+'">'+(row.ch>0?'+':'')+row.ch.toFixed(2)+'%</span>':'');}).map(function(x){return x+'</span>';}).join('')+'<span class="ib-t">'+(recent?'24시간 등락 · '+new Date(window._uiCoinAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})+' KST':'시세 연결 확인 중')+'</span>';
}
function uiHoldingCards(account,money){
  if(!account.positions.length)return '<div class="ui-holdings"><p>현재 보유 종목이 없어요.</p></div>';
  return '<div class="ui-holdings">'+account.positions.map(function(x){var b=quantPurchase(account,x),g=quantPositionPnl(x);return '<article class="ui-holding"><header><b>'+esc(x.name||x.symbol)+'</b><small>'+esc(x.symbol)+'</small></header><strong class="'+(g?.tone||'qt-flat')+'">'+(g?(g.total>0?'+':'')+money(g.total)+' / '+g.rate.toFixed(2)+'%':'손익 확인 대기')+'</strong><dl><dt>모의 매수가 × 매수 수량</dt><dd>'+(b?money(b.price)+' × '+b.quantity+'주':'체결 기록 확인 대기')+'</dd><dt>현재 보유 수량</dt><dd>'+x.quantity+'주</dd><dt>평가 기준가</dt><dd>'+money(x.lastPrice)+'</dd><dt>계좌 비중</dt><dd>'+(account.equity>0?(x.quantity*x.lastPrice/account.equity*100).toFixed(2)+'%':'—')+'</dd><dt>비용 포함 매입단가</dt><dd>'+money(x.costBasis)+'</dd></dl><details><summary>매수 비용·손절·목표 확인</summary><dl><dt>매수 금액 / 비용</dt><dd>'+(b?money(b.amount)+' / '+money(b.cost):'—')+'</dd><dt>매수 총 차감</dt><dd>'+(b?money(b.amount+b.cost):'—')+'</dd><dt>손절가</dt><dd>'+money(x.stop)+'</dd><dt>1차 / 최종 목표</dt><dd>'+money(x.target1)+' / '+money(x.target)+(x.firstTargetDone?' · 1차 매도 완료':'')+'</dd><dt>주당 손익</dt><dd>'+(g?money(g.unit):'—')+'</dd><dt>매수일 / 보유일</dt><dd>'+quantDate(x.entryDate)+' / '+x.heldDays+'거래일</dd></dl></details></article>';}).join('')+'</div>';
}
var _uiNotices=[];
try{var saved=JSON.parse(sessionStorage.getItem('vt-ui-notices')||'[]');if(Array.isArray(saved))_uiNotices=saved.filter(function(x){return x&&typeof x.message==='string'&&Number.isFinite(x.time);}).slice(0,50);}catch(e){}
function uiNotice(message,symbol){_uiNotices.unshift({message:String(message),symbol:String(symbol||''),time:Date.now(),read:false});_uiNotices=_uiNotices.slice(0,50);uiNoticeRender();}
function uiNoticeRender(){
  try{sessionStorage.setItem('vt-ui-notices',JSON.stringify(_uiNotices));}catch(e){}
  var button=document.getElementById('uiNoticeButton'),list=document.getElementById('uiNoticeList');if(!button||!list)return;
  var unread=_uiNotices.filter(function(x){return !x.read;}).length;
  button.textContent='알림'+(unread?' '+unread:'');button.setAttribute('aria-label','알림함'+(unread?' · 읽지 않은 알림 '+unread+'건':''));
  list.replaceChildren();if(!_uiNotices.length){var empty=document.createElement('p');empty.textContent='새 급등 알림이 없어요.';list.append(empty);}
  _uiNotices.forEach(function(x){var item=document.createElement('li'),time=document.createElement('small');item.textContent=x.message;time.textContent=new Date(x.time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · 한국시간';item.append(time);list.append(item);});
}
document.addEventListener('DOMContentLoaded',function(){
  var top=document.querySelector('.topbar');if(!top)return;
  var wrap=document.createElement('div');wrap.className='ui-notices';wrap.innerHTML='<button class="ibtn" type="button" id="uiNoticeButton" aria-expanded="false" aria-controls="uiNoticePanel">알림</button><section id="uiNoticePanel" aria-label="급등 알림함" hidden><header><b>급등 알림함</b><button type="button" id="uiNoticeClear">비우기</button></header><ul id="uiNoticeList"></ul></section>';top.append(wrap);
  var button=wrap.querySelector('#uiNoticeButton'),panel=wrap.querySelector('#uiNoticePanel');
  var close=function(){panel.hidden=true;button.setAttribute('aria-expanded','false');};
  button.onclick=function(){panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){_uiNotices.forEach(function(x){x.read=true;});uiNoticeRender();}};
  wrap.querySelector('#uiNoticeClear').onclick=function(){_uiNotices=[];uiNoticeRender();};
  document.addEventListener('click',function(e){if(!wrap.contains(e.target))close();});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden){close();button.focus();}});uiNoticeRender();
});

document.addEventListener('DOMContentLoaded',function(){uiRefreshHealth();setInterval(uiRefreshHealth,5*60e3);setInterval(function(){if(typeof coinMode!=='undefined'&&coinMode)uiCoinBar();},30000);});
