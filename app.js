/* ═══════════════════════════════════════════════════════════
   AUREUM Pro — app.js
   - AUREUM DAY SCORE 100점 엔진 (스펙 §3~4)
   - 데모 목데이터로 즉시 작동, KIS_PROXY 설정 시 실데이터로 확장
   ═══════════════════════════════════════════════════════════ */
const KIS_PROXY=''; // ← 프록시 URL 넣으면 실데이터 모드(추후 연결)

/* ---------- 유틸 ---------- */
const $=(s,r)=>(r||document).querySelector(s), $$=(s,r)=>[...(r||document).querySelectorAll(s)];
const won=n=>'₩'+Math.round(n).toLocaleString('en-US');
const pctTxt=(c)=>(c>=0?'+':'')+(+c).toFixed(2)+'%';
const cls=(c)=>c>0?'up':(c<0?'down':'flat');
const arw=(c)=>c>0?'▲':(c<0?'▼':'–');
function fmtEok(v){ // 억원 표기
  if(v>=10000) return (v/10000).toFixed(1)+'조';
  return Math.round(v).toLocaleString('en-US')+'억';
}
function sparkline(data,w,h,color){
  var lo=Math.min.apply(null,data), hi=Math.max.apply(null,data), rng=(hi-lo)||1;
  var pts=data.map(function(v,i){ return (i/(data.length-1)*w).toFixed(1)+','+(h-(v-lo)/rng*h).toFixed(1); }).join(' ');
  return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.6" stroke-linejoin="round"/></svg>';
}

/* ═══════════ AUREUM DAY SCORE 엔진 (100점) ═══════════ */
function sVal(p){ return p>=99?10:p>=97?9:p>=95?8:p>=90?7:p>=80?5:p>=60?3:p>=40?2:0; }         // 거래대금 순위 백분위
function sValInc(i){ return i>=300?10:i>=200?9:i>=150?8:i>=100?7:i>=70?6:i>=40?5:i>=20?3:i>0?1:0; } // 전일동시간대비 증가율
function sAccel(x){ return x>=4?10:x>=3?9:x>=2.5?8:x>=2?7:x>=1.5?5:x>=1.2?3:x>=1?1:0; }          // 5분 가속도
function sRvol(x){ return x>=5?5:x>=4?4.5:x>=3?4:x>=2?3:x>=1.5?2:x>=1?1:0; }                      // 상대거래량
function sOpen(p){ if(p<=-2)return 0; if(p<0)return 1; if(p<1)return 3; if(p<2)return 5; if(p<4)return 8; if(p<7)return 10; if(p<10)return 8; if(p<15)return 5; return 2; } // 시가대비(비단조)
function sHigh(g){ if(g>8)return 0; if(g>5)return 3; if(g>3)return 5; if(g>=1.5)return 7; if(g>=0.3)return 8; return 6; } // 고점이격(0.3~1.5 우대)
function sMom(p){ return Math.max(0,Math.min(12, p/100*12)); }                                    // 1·3·5분 모멘텀 백분위
function sStr(s){ return s>=180?10:s>=160?9:s>=140?8:s>=130?7:s>=120?6:s>=110?4:s>=100?2:0; }      // 체결강도
function sBid(r){ return r>=75?5:r>=68?4:r>=60?3:r>=55?2:r>=50?1:0; }                              // 호가 매수비율
function sProg(p){ return p>=10?10:p>=7?9:p>=5?8:p>=3?6:p>=1?4:p>=0?2:0; }                         // 프로그램 강도
function sInv(s){ return s==='both'?5:s==='inst'?4:s==='foreign'?4:s==='one'?2:s==='neutral'?1:0; }// 외인·기관 수급

/* 그룹 만점 + 튜닝 가중치(기본=만점 → 스펙 배점과 동일). 슬라이더로 조정 */
const GMAX={trade:35,price:30,press:25,flow:5,trend:5};
const TUNE={w:Object.assign({},GMAX)};
try{var _tw=JSON.parse(localStorage.getItem('aurtune')||'null'); if(_tw)TUNE.w=Object.assign({},GMAX,_tw);}catch(e){}
function weightedTotal(g){ var keys=['trade','price','press','flow','trend'], num=0, den=0;
  keys.forEach(function(k){ if(k==='flow'&&g.flow==null)return; num+=TUNE.w[k]*(g[k]/GMAX[k]); den+=TUNE.w[k]; });
  return den? Math.round(100*num/den):0;
}
function aureumScore(s){
  var trade = sVal(s.valPct)+sValInc(s.valInc)+sAccel(s.accel)+sRvol(s.rvol);   // /35
  var price = sOpen(s.openPct)+sHigh(s.highGap)+sMom(s.momPct);                 // /30
  var press = sStr(s.strength)+sBid(s.bidRatio)+sProg(s.progPct);               // /25
  var flow  = (s.invest==null)? null : sInv(s.invest);                          // /5
  var trend = s.breakout||0;                                                    // /5
  var groups={trade:trade,price:price,press:press,flow:flow,trend:trend};
  var total = weightedTotal(groups);
  var reasons=[];
  if(s.accel>=2) reasons.push('최근 5분 거래대금 '+s.accel.toFixed(1)+'배 증가');
  if(s.valInc>=70) reasons.push('전일 동시간 대비 거래대금 +'+Math.round(s.valInc)+'%');
  if(s.openPct>=2&&s.openPct<10) reasons.push('시가 대비 +'+s.openPct.toFixed(1)+'% (초·중기 모멘텀 구간)');
  if(s.highGap<=1.5) reasons.push('장중 고점 대비 -'+s.highGap.toFixed(1)+'% (고점 부근 힘 유지)');
  if(s.strength>=120) reasons.push('체결강도 '+Math.round(s.strength)+' (매수 우위)');
  if(s.bidRatio>=60) reasons.push('호가 매수 우위 '+Math.round(s.bidRatio)+'%');
  if(s.progPct>=3) reasons.push('프로그램 순매수 +'+s.progPct.toFixed(1)+'%');
  if(s.invest==='both') reasons.push('외국인·기관 동반 매수');
  if(s.breakout>=4) reasons.push('전일 고가·주요 저항 돌파');
  var grade = total>=90?['🔥 STRONG MOMENTUM','strong']:total>=80?['🟢 MOMENTUM','rise']:total>=70?['🟡 WATCH','steady']:total>=60?['⚪ NEUTRAL','steady']:['NO SIGNAL','steady'];
  return { total, groups:{trade:+trade.toFixed(1),price:+price.toFixed(1),press:+press.toFixed(1),flow:flow==null?null:+flow.toFixed(1),trend:+trend.toFixed(1)}, reasons:reasons.slice(0,6), grade };
}
function radarStatus(dRank,cooling){
  if(cooling) return ['⚠️ COOLING','cool'];
  if(dRank>=6) return ['🚀 SURGING','surge'];
  if(dRank>0) return ['↑ RISING','rise'];
  if(dRank<0) return ['↓ FALLING','steady'];
  return ['→ STEADY','steady'];
}

/* ═══════════ 데모 데이터 ═══════════ */
const IDX=[
  {nm:'KOSPI',v:2609.42,c:-0.42,d:-10.97,tr:[2612,2605,2600,2598,2604,2611,2607,2603,2609],val:'11.2조',vol:'5.14억주'},
  {nm:'KOSDAQ',v:853.91,c:0.68,d:5.77,tr:[848,850,849,852,851,854,853,855,853.91],val:'7.6조',vol:'8.62억주'},
  {nm:'KOSPI200',v:344.38,c:-0.47,d:-1.63,tr:[345.8,345.2,344.6,344.1,344.5,344.9,344.4,344.2,344.38],val:'6.2조',vol:'2.17억주'},
  {nm:'USD/KRW',v:1359.80,c:0.21,d:2.90,tr:[1357,1358,1357.5,1359,1360,1361,1360.4,1359.5,1359.8],val:'—',vol:'—',fx:true}
];
// 종목 데모 (점수 입력값 포함)
const STK=[
  {c:'329180',n:'HD현대중공업',mk:'KOSPI',px:184500,ch:12.35,valPct:99,valInc:265,accel:3.4,rvol:4.2,openPct:5.2,highGap:0.7,momPct:96,strength:147,bidRatio:71,progPct:8.2,invest:'both',breakout:5,dRank:16,cooling:false},
  {c:'012450',n:'한화에어로스페이스',mk:'KOSPI',px:812000,ch:8.67,valPct:97,valInc:210,accel:2.8,rvol:3.6,openPct:4.1,highGap:1.1,momPct:90,strength:138,bidRatio:66,progPct:6.4,invest:'both',breakout:4,dRank:4,cooling:false},
  {c:'000660',n:'SK하이닉스',mk:'KOSPI',px:208000,ch:6.21,valPct:99,valInc:150,accel:2.4,rvol:3.1,openPct:3.4,highGap:1.4,momPct:84,strength:132,bidRatio:63,progPct:5.1,invest:'both',breakout:4,dRank:7,cooling:false},
  {c:'005930',n:'삼성전자',mk:'KOSPI',px:74600,ch:2.18,valPct:99,valInc:95,accel:1.9,rvol:2.2,openPct:2.1,highGap:1.8,momPct:70,strength:121,bidRatio:58,progPct:3.2,invest:'both',breakout:3,dRank:0,cooling:false},
  {c:'005380',n:'현대차',mk:'KOSPI',px:205000,ch:1.91,valPct:90,valInc:80,accel:1.8,rvol:2.0,openPct:1.6,highGap:2.4,momPct:62,strength:118,bidRatio:56,progPct:2.1,invest:'inst',breakout:3,dRank:2,cooling:false},
  {c:'042660',n:'한화오션',mk:'KOSPI',px:57100,ch:7.10,valPct:95,valInc:180,accel:2.9,rvol:3.4,openPct:6.1,highGap:0.9,momPct:88,strength:141,bidRatio:69,progPct:4.6,invest:'foreign',breakout:4,dRank:9,cooling:false},
  {c:'277810',n:'레인보우로보틱스',mk:'KOSDAQ',px:252000,ch:9.80,valPct:88,valInc:230,accel:3.1,rvol:3.8,openPct:8.2,highGap:1.2,momPct:85,strength:135,bidRatio:64,progPct:1.8,invest:'one',breakout:4,dRank:5,cooling:false},
  {c:'105560',n:'KB금융',mk:'KOSPI',px:89000,ch:0.95,valPct:80,valInc:40,accel:1.4,rvol:1.6,openPct:0.9,highGap:3.1,momPct:48,strength:112,bidRatio:53,progPct:0.8,invest:'inst',breakout:2,dRank:-2,cooling:false},
  {c:'373220',n:'LG에너지솔루션',mk:'KOSPI',px:352500,ch:0.43,valPct:85,valInc:35,accel:1.3,rvol:1.5,openPct:0.4,highGap:4.2,momPct:40,strength:108,bidRatio:52,progPct:-0.5,invest:'one',breakout:1,dRank:-3,cooling:true},
  {c:'000270',n:'기아',mk:'KOSPI',px:95500,ch:-0.27,valPct:78,valInc:20,accel:1.1,rvol:1.3,openPct:-0.3,highGap:5.4,momPct:32,strength:104,bidRatio:49,progPct:-1.2,invest:'sell',breakout:1,dRank:-5,cooling:true},
  {c:'035420',n:'NAVER',mk:'KOSPI',px:212000,ch:1.24,valPct:82,valInc:60,accel:1.7,rvol:1.8,openPct:1.3,highGap:2.2,momPct:55,strength:116,bidRatio:57,progPct:1.4,invest:'inst',breakout:2,dRank:1,cooling:false},
  {c:'207940',n:'삼성바이오로직스',mk:'KOSPI',px:1145000,ch:1.64,valPct:84,valInc:70,accel:1.9,rvol:2.0,openPct:1.9,highGap:1.9,momPct:60,strength:120,bidRatio:59,progPct:2.6,invest:'foreign',breakout:3,dRank:3,cooling:false},
  {c:'042700',n:'한미반도체',mk:'KOSPI',px:84300,ch:4.90,valPct:86,valInc:140,accel:2.6,rvol:2.9,openPct:3.8,highGap:1.3,momPct:78,strength:129,bidRatio:62,progPct:3.9,invest:'foreign',breakout:3,dRank:6,cooling:false},
  {c:'196170',n:'알테오젠',mk:'KOSDAQ',px:342000,ch:3.10,valPct:83,valInc:110,accel:2.2,rvol:2.5,openPct:2.6,highGap:1.6,momPct:66,strength:124,bidRatio:60,progPct:0.9,invest:'one',breakout:3,dRank:2,cooling:false}
];
const CATS=[
  {ic:'🔲',nm:'반도체',sc:87,d:2,val:284,top:[['SK하이닉스',89],['삼성전자',84],['한미반도체',74]]},
  {ic:'🚢',nm:'조선',sc:82,d:5,val:196,top:[['HD현대중공업',94],['한화오션',82],['삼성중공업',72]]},
  {ic:'🛡️',nm:'방산',sc:76,d:1,val:238,top:[['한화에어로스페이스',88],['LIG넥스원',78],['현대로템',69]]},
  {ic:'🧬',nm:'바이오·제약',sc:71,d:1,val:142,top:[['삼성바이오로직스',85],['알테오젠',74],['셀트리온',63]]},
  {ic:'🏗️',nm:'건설',sc:58,d:0,val:61,top:[['현대건설',68],['GS건설',55],['DL이앤씨',51]]},
  {ic:'🤖',nm:'로봇·AI',sc:55,d:1,val:97,top:[['레인보우로보틱스',74],['두산로보틱스',63],['에스피지',54]]},
  {ic:'🚗',nm:'자동차',sc:49,d:-1,val:32,top:[['현대차',62],['기아',55],['현대모비스',47]]},
  {ic:'🏦',nm:'금융',sc:45,d:0,val:19,top:[['KB금융',58],['신한지주',49],['하나금융지주',44]]}
];
const SMART={
  foreign:[['삼성전자',1245],['SK하이닉스',842],['현대차',682],['KB금융',475],['LG에너지솔루션',431]],
  inst:[['삼성전자',1102],['NAVER',587],['삼성바이오로직스',523],['현대모비스',412],['신한지주',378]]
};
const FLOW={
  breadth:{up:642,down:746,flat:106,upH:2,downH:4,h52u:128,h52d:32},
  inv:[['KOSPI',-2814,3215,1102,1356],['KOSDAQ',-1523,1184,342,289]]
};

/* ═══════════ RADAR 계산 ═══════════ */
let RADAR=[]; let SEL=null;
function computeRadar(){
  RADAR=STK.map(function(s){ var r=aureumScore(s); return Object.assign({},s,{score:r.total,g:r.groups,reasons:r.reasons,grade:r.grade}); });
  RADAR.sort(function(a,b){return b.score-a.score;});
  RADAR.forEach(function(r,i){ r.rank=i+1; var st=radarStatus(r.dRank,r.cooling); r.status=st[0]; r.stcls=st[1]; });
  if(!SEL) SEL=RADAR[0];
}
function pressBar(g){ var n=Math.round(g.press/25*5); var h=''; for(var i=0;i<5;i++)h+='<i class="'+(i<n?'on':'')+'"></i>'; return '<span class="press">'+h+'</span>'; }
function mvHtml(d){ if(d>0)return '<span class="mv up">↑ +'+d+'</span>'; if(d<0)return '<span class="mv down">↓ '+d+'</span>'; return '<span class="mv flat">→</span>'; }

function radarRow(r,full){
  var pc=cls(r.ch);
  return '<tr class="rowbtn'+(SEL&&SEL.c===r.c?' sel':'')+'" data-c="'+r.c+'">'
    +'<td class="l"><span class="rank">'+r.rank+'</span></td>'
    +'<td class="l"><div class="sym">'+r.n+'<small>'+r.c+' · '+r.mk+'</small></div></td>'
    +'<td><span class="scorepill'+(r.score>=80?'':' s2')+'">'+r.score+'</span></td>'
    +(full?'<td>'+mvHtml(r.dRank)+'</td>':'')
    +'<td class="'+pc+'">'+pctTxt(r.ch)+'</td>'
    +(full?'<td>'+pressBar(r.g)+'</td>':'')
    +'<td><span class="st '+r.stcls+'">'+r.status+'</span></td></tr>';
}
function renderRadar(){
  computeRadar();
  // home top10 (compact)
  var hr=$('#homeRadar');
  if(hr){ hr.innerHTML='<thead><tr><th class="l">#</th><th class="l">종목</th><th>SCORE</th><th>등락률</th><th>상태</th></tr></thead><tbody>'
    +RADAR.slice(0,10).map(function(r){return radarRow(r,false);}).join('')+'</tbody>';
  }
  // full radar
  var fr=$('#fullRadar');
  if(fr){ fr.innerHTML='<thead><tr><th class="l">#</th><th class="l">종목</th><th>SCORE</th><th>1M</th><th>등락률</th><th>압력</th><th>상태</th></tr></thead><tbody>'
    +RADAR.slice(0,10).map(function(r){return radarRow(r,true);}).join('')+'</tbody>';
  }
  $$('#homeRadar .rowbtn, #fullRadar .rowbtn').forEach(function(tr){ tr.onclick=function(){ SEL=RADAR.find(function(x){return x.c===tr.dataset.c;}); renderRadar(); renderQuickView(); if($('#v-radar').classList.contains('on'))window.scrollTo({top:0,behavior:'smooth'}); }; });
  var u='· '+nowHM()+' 기준'; if($('#radarupd'))$('#radarupd').textContent=u; if($('#radarupd2'))$('#radarupd2').textContent=u;
  renderQuickView();
}
function renderQuickView(){
  var el=$('#quickView'); if(!el||!SEL)return; var r=SEL;
  function bar(k,v,mx){ return '<div class="bar"><span class="k">'+k+'</span><div class="track"><div class="fill" style="width:'+(v/mx*100)+'%"></div></div><span class="vv">'+v+' / '+mx+'</span></div>'; }
  el.innerHTML='<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="big">'+r.n+'</span><span style="color:var(--faint);font-size:12px">'+r.c+'</span></div>'
    +'<div style="font-size:15px;font-weight:800;margin-top:2px" class="'+cls(r.ch)+'">'+won(r.px)+' <span style="font-size:13px">'+pctTxt(r.ch)+'</span></div>'
    +'<div class="gauge"><div class="gnum" style="color:var(--gold)">'+r.score+'</div><div><div style="font-size:11px;color:var(--faint);font-weight:700">RADAR SCORE / 100</div><div style="font-weight:800;margin-top:2px">'+r.grade[0]+'</div><div style="margin-top:3px"><span class="st '+r.stcls+'">'+r.status+'</span></div></div></div>'
    +bar('거래 활성',r.g.trade,35)+bar('가격 움직임',r.g.price,30)+bar('실시간 압력',r.g.press,25)+bar('수급',r.g.flow==null?0:r.g.flow,5)+bar('추세',r.g.trend,5)
    +'<div style="font-size:11px;font-weight:700;color:var(--faint);margin:14px 0 0;text-transform:uppercase;letter-spacing:.5px">선정 이유</div>'
    +'<ul class="reasons">'+r.reasons.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul>'
    +'<div style="margin-top:12px"><a class="more" data-v="stock" onclick="openStock(\''+r.c+'\')" style="cursor:pointer">종목 상세 분석 ›</a></div>';
  $$('#quickView .more[data-v]').forEach(bindNav);
}

/* ⚙️ RADAR 엔진 튜닝 패널 */
const TLAB={trade:'거래 활성',price:'가격 움직임',press:'실시간 압력',flow:'수급',trend:'추세'};
function renderTune(){
  var el=$('#tunePanel'); if(!el)return;
  el.innerHTML='<div class="card"><div class="ch"><h2>⚙️ RADAR 엔진 튜닝 <span style="font-weight:600;color:var(--faint);font-size:12px">그룹 배점 조정 → 즉시 재순위</span></h2><div class="r"><span class="more" onclick="resetTune()">스펙 기본값 ↺</span></div></div>'
    +'<div class="pad"><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px">'
    +['trade','price','press','flow','trend'].map(function(k){return '<label style="font-size:12px;font-weight:700;color:var(--sub);display:block">'+TLAB[k]+' <b style="color:var(--gold);float:right" id="tw-'+k+'">'+TUNE.w[k]+'</b><input type="range" min="0" max="50" step="1" value="'+TUNE.w[k]+'" oninput="setTune(\''+k+'\',this.value)" style="width:100%;margin-top:8px;accent-color:var(--gold)"></label>';}).join('')
    +'</div><div style="font-size:11px;color:var(--faint);margin-top:12px;line-height:1.5">기본값 <b>거래35·가격30·압력25·수급5·추세5</b> = 스펙 배점. 슬라이더로 비중을 바꾸면 TOP 10이 즉시 재정렬됩니다(100점 정규화). 예: 이미 급등한 종목보다 <b>초기 자금유입</b>을 잡으려면 거래 활성↑, 추격 방지엔 가격↓.</div></div></div>';
}
function setTune(k,v){ TUNE.w[k]=+v; var b=$('#tw-'+k); if(b)b.textContent=v; try{localStorage.setItem('aurtune',JSON.stringify(TUNE.w));}catch(e){} renderRadar(); renderCats(); }
function resetTune(){ TUNE.w=Object.assign({},GMAX); try{localStorage.removeItem('aurtune');}catch(e){} renderTune(); renderRadar(); renderCats(); }
window.setTune=setTune; window.resetTune=resetTune;

/* 지수 스트립 */
function renderIdx(){
  var el=$('#idxstrip'); if(!el)return;
  el.innerHTML=IDX.map(function(x){ var pc=cls(x.c), col=x.c>0?'var(--up)':x.c<0?'var(--down)':'var(--flat)';
    return '<div class="idx"><div class="nm">'+x.nm+'</div>'+sparkline(x.tr,96,44,col)
      +'<div class="v num '+pc+'">'+x.v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'</div>'
      +'<div class="d num '+pc+'">'+arw(x.c)+' '+Math.abs(x.d).toFixed(2)+' ('+pctTxt(x.c)+')</div>'
      +'<div class="foot"><span>거래대금 '+x.val+'</span><span>'+(x.fx?'고가 1,363':'거래량 '+x.vol)+'</span></div></div>';
  }).join('');
  // footer ticker
  var ft=$('#footTicker'); if(ft)ft.innerHTML=IDX.slice(0,2).map(function(x){return x.nm+' <span class="'+cls(x.c)+'">'+x.v.toLocaleString()+' '+arw(x.c)+pctTxt(x.c).replace('+','')+'</span>';}).join('');
}
/* SMART MONEY */
function renderSmart(){
  var el=$('#smartMoney'); if(!el)return;
  el.innerHTML='<div style="display:grid;gap:16px">'
    +'<div><div style="font-size:12px;font-weight:800;margin-bottom:5px">🌐 외국인 순매수 TOP</div><table><tbody>'+SMART.foreign.map(function(r,i){return '<tr><td class="l"><span class="rank">'+(i+1)+'</span> '+r[0]+'</td><td class="up" style="font-weight:700">+'+r[1].toLocaleString()+'억</td></tr>';}).join('')+'</tbody></table></div>'
    +'<div><div style="font-size:12px;font-weight:800;margin-bottom:5px">🏛️ 기관 순매수 TOP</div><table><tbody>'+SMART.inst.map(function(r,i){return '<tr><td class="l"><span class="rank">'+(i+1)+'</span> '+r[0]+'</td><td class="up" style="font-weight:700">+'+r[1].toLocaleString()+'억</td></tr>';}).join('')+'</tbody></table></div></div>';
}
/* MARKET FLOW */
function renderFlow(){
  var el=$('#marketFlow'); if(!el)return; var b=FLOW.breadth;
  function stat(k,v,c){ return '<div style="text-align:center"><div style="font-size:11px;color:var(--faint);font-weight:700">'+k+'</div><div style="font-size:19px;font-weight:800;margin-top:2px" class="'+(c||'')+'">'+v+'</div></div>'; }
  el.innerHTML='<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--line2)">'
    +stat('상승','▲ '+b.up,'up')+stat('하락','▼ '+b.down,'down')+stat('보합',b.flat,'flat')+stat('상한',b.upH,'up')+stat('하한',b.downH,'down')+stat('52주 신고',b.h52u,'up')+stat('52주 신저',b.h52d,'down')+'</div>'
    +'<div style="font-size:12px;font-weight:800;margin:14px 0 8px">투자자별 매매동향 <span style="color:var(--faint);font-weight:600">(억원)</span></div>'
    +'<table class="flowtab"><thead><tr><th class="l">시장</th><th>개인</th><th>외국인</th><th>기관</th><th>프로그램</th></tr></thead><tbody>'
    +FLOW.inv.map(function(r){ return '<tr><td class="l" style="font-weight:800">'+r[0]+'</td>'+[r[1],r[2],r[3],r[4]].map(function(v){return '<td class="'+cls(v)+'" style="font-weight:700">'+(v>=0?'+':'')+v.toLocaleString()+'</td>';}).join('')+'</tr>'; }).join('')+'</tbody></table>';
  if($('#flowupd'))$('#flowupd').textContent='· '+nowHM();
}
/* CATEGORY */
function catCard(x){ var gc=x.sc>=80?'strong':x.sc>=70?'rise':x.sc>=60?'steady':'steady'; var col=x.sc>=80?'var(--up)':x.sc>=60?'var(--gold)':'var(--sub)';
  return '<div class="cat"><div class="cathd"><span class="ic">'+x.ic+'</span><span class="nm">'+x.nm+'</span><span class="sc" style="color:'+col+'">'+x.sc+'</span></div>'
    +'<div style="font-size:11px;color:var(--faint);margin-top:2px">'+mvHtml(x.d).replace('mv ','mv ')+' 업종순위</div>'
    +'<div class="cattop">'+x.top.map(function(t,i){return '<div class="r"><span>'+(i===0?'<span class="crown">👑</span> ':(i+1)+'. ')+t[0]+'</span><b>'+t[1]+'</b></div>';}).join('')+'</div>'
    +'<div class="catfoot"><span>거래대금 <b class="up">+'+x.val+'%</b></span><span>대장주 유지</span></div></div>';
}
function renderCats(){
  var h=$('#homeCats'); if(h)h.innerHTML=CATS.slice(0,4).map(catCard).join('');
  var a=$('#allCats'); if(a)a.innerHTML=CATS.map(catCard).join('');
  var heat=$('#catHeat'); if(heat){ heat.innerHTML='<div class="heat">'+CATS.map(function(x){ var t=(x.sc-40)/55; var col='hsl('+(t*18)+','+(55+t*35)+'%,'+(58-t*16)+'%)'; return '<div class="h" style="background:'+col+'">'+x.sc+'<div class="hs">'+x.nm+'</div></div>'; }).join('')+'</div>'; }
  var cr=$('#catRank'); if(cr){ cr.innerHTML='<table><thead><tr><th class="l">순위</th><th class="l">업종</th><th>SCORE</th><th>1분 변화</th></tr></thead><tbody>'
    +CATS.map(function(x,i){return '<tr><td class="l"><span class="rank">'+(i+1)+'</span></td><td class="l">'+x.ic+' '+x.nm+'</td><td>'+x.sc+'</td><td>'+mvHtml(x.d)+'</td></tr>';}).join('')+'</tbody></table>'; }
  var rs=$('#radarStats'); if(rs){ rs.innerHTML=
    '<div class="card"><div class="ch"><h2>💵 거래대금 가속</h2></div><div class="pad">'+RADAR.slice(0,5).map(function(r){return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line2)"><span>'+r.n+'</span><b class="up">×'+r.accel.toFixed(1)+'</b></div>';}).join('')+'</div></div>'
    +'<div class="card"><div class="ch"><h2>🔥 체결강도 상위</h2></div><div class="pad">'+[].concat(RADAR).sort(function(a,b){return b.strength-a.strength;}).slice(0,5).map(function(r){return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line2)"><span>'+r.n+'</span><b class="up">'+Math.round(r.strength)+'</b></div>';}).join('')+'</div></div>'
    +'<div class="card"><div class="ch"><h2>📗 호가 매수우위</h2></div><div class="pad">'+[].concat(RADAR).sort(function(a,b){return b.bidRatio-a.bidRatio;}).slice(0,5).map(function(r){return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line2)"><span>'+r.n+'</span><b class="up">'+Math.round(r.bidRatio)+'%</b></div>';}).join('')+'</div></div>';
  }
}
/* STOCK 상세 (요약) */
function openStock(code){
  var r=RADAR.find(function(x){return x.c===code;})||RADAR[0]; SEL=r;
  showView('stock');
  var el=$('#stockPanel'); if(!el)return;
  function metric(k,v,c){ return '<div style="flex:1;min-width:120px;border:1px solid var(--line);border-radius:11px;padding:11px 13px"><div style="font-size:11px;color:var(--faint);font-weight:700">'+k+'</div><div style="font-size:16px;font-weight:800;margin-top:3px" class="'+(c||'')+'">'+v+'</div></div>'; }
  el.innerHTML='<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span style="font-size:24px;font-weight:800">'+r.n+'</span><span style="color:var(--faint)">'+r.c+' · '+r.mk+'</span><span style="margin-left:auto" class="scorepill">'+r.score+'</span></div>'
    +'<div style="font-size:28px;font-weight:800;margin-top:4px" class="'+cls(r.ch)+'">'+won(r.px)+' <span style="font-size:15px">'+arw(r.ch)+' '+pctTxt(r.ch)+'</span></div>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">'+metric('체결강도',Math.round(r.strength),r.strength>=100?'up':'down')+metric('호가 압력',(r.bidRatio>=55?'매수우위':'균형')+' '+Math.round(r.bidRatio)+'%',r.bidRatio>=55?'up':'')+metric('프로그램',(r.progPct>=0?'+':'')+r.progPct.toFixed(1)+'%',cls(r.progPct))+metric('시가대비',(r.openPct>=0?'+':'')+r.openPct.toFixed(1)+'%',cls(r.openPct))+metric('고점이격','-'+r.highGap.toFixed(1)+'%')+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px" class="qv">'
      +'<div><div style="font-size:12px;font-weight:800;color:var(--faint);text-transform:uppercase;margin-bottom:8px">AUREUM SCORE 구성</div>'
        +['trade|거래 활성|35','price|가격 움직임|30','press|실시간 압력|25','flow|수급|5','trend|추세|5'].map(function(g){var p=g.split('|');var v=r.g[p[0]]==null?0:r.g[p[0]];return '<div class="bar"><span class="k">'+p[1]+'</span><div class="track"><div class="fill" style="width:'+(v/(+p[2])*100)+'%"></div></div><span class="vv">'+v+'/'+p[2]+'</span></div>';}).join('')+'</div>'
      +'<div><div style="font-size:12px;font-weight:800;color:var(--faint);text-transform:uppercase;margin-bottom:8px">선정 이유</div><ul class="reasons" style="margin-top:0">'+r.reasons.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div></div>'
    +'<div class="disc" style="margin-top:18px">🧪 데모 데이터입니다. KIS 프록시 연결 시 실시간 시세·차트·수급·뉴스가 이 화면에 채워집니다. (기존 토스식 상세 화면도 STOCK 탭으로 통합 예정)</div>';
}

/* ═══════════ 네비게이션 ═══════════ */
function showView(v){
  $$('.view').forEach(function(x){x.classList.remove('on');});
  var el=$('#v-'+v); if(el)el.classList.add('on');
  $$('#menu a').forEach(function(a){a.classList.toggle('on',a.dataset.v===v);});
  if(v==='news')fetchNews();
  window.scrollTo({top:0,behavior:'smooth'});
}
function bindNav(a){ a.onclick=function(e){ if(a.dataset.v)showView(a.dataset.v); }; }
$$('#menu a').forEach(bindNav);
$$('.more[data-v]').forEach(bindNav);
window.openStock=openStock;

/* ═══════════ 뉴스 (한국/미국 + 번역) ═══════════ */
const NEWS_FEEDS={
  KR:[{u:'https://www.yna.co.kr/rss/economy.xml',s:'연합뉴스'},{u:'https://www.hankyung.com/feed/finance',s:'한국경제'},{u:'https://www.mk.co.kr/rss/30100041/',s:'매일경제'},{u:'https://news.einfomax.co.kr/rss/allArticle.xml',s:'연합인포맥스'},{u:'https://rss.edaily.co.kr/stock_news.xml',s:'이데일리'},{u:'https://rss.mt.co.kr/mt_news.xml',s:'머니투데이'}],
  US:[{u:'https://www.cnbc.com/id/20910258/device/rss/rss.html',s:'CNBC 마켓'},{u:'https://www.cnbc.com/id/100003114/device/rss/rss.html',s:'CNBC 톱뉴스'},{u:'https://www.cnbc.com/id/10000664/device/rss/rss.html',s:'CNBC 이코노미'}]
};
let newsCat='KR', usTr=false, _trC={};
function relTime(d){var s=(Date.now()-d)/1000;if(s<60)return '방금';if(s<3600)return Math.floor(s/60)+'분 전';if(s<86400)return Math.floor(s/3600)+'시간 전';return Math.floor(s/86400)+'일 전';}
function nowHM(){var d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function esc(t){return String(t).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m];});}
function sentiment(t){var neg=['하락','급락','규제','관세','폭락','우려','경고','소송','제재','하향','파산','약세','손실','벌금','위기','충격','부진','논란','적자'];var pos=['상승','급등','호재','승인','유입','신고가','돌파','완화','호조','성장','상향','상장','투자','반등','회복','기대','최고','호실적','흑자','수주'];for(var i=0;i<neg.length;i++)if(t.indexOf(neg[i])>-1)return 'neg';for(var j=0;j<pos.length;j++)if(t.indexOf(pos[j])>-1)return 'pos';return '';}
function toggleTr(){ usTr=!usTr; var b=$('#trbtn'); if(b){b.classList.toggle('on',usTr);b.textContent=usTr?'🌐 번역 켜짐':'🌐 한글 번역';b.style.borderColor=usTr?'var(--gold)':'var(--line)';} fetchNews(); }
async function trOne(t){ if(!t)return t; if(_trC[t])return _trC[t]; try{var r=await fetch('https://api.mymemory.translated.net/get?langpair=en|ko&q='+encodeURIComponent(t.slice(0,480))).then(x=>x.json());var o=(r&&r.responseData&&r.responseData.translatedText)||t;if(/MYMEMORY WARNING|QUERY LENGTH|INVALID/i.test(o))o=t;_trC[t]=o;return o;}catch(e){return t;} }
async function fetchNews(){
  var cat=newsCat, feeds=NEWS_FEEDS[cat];
  var full=$('#fullNews'), home=$('#homeNews');
  if(full)full.innerHTML='<div style="color:var(--faint);font-size:12px;padding:8px 0">불러오는 중…</div>';
  try{
    var res=await Promise.all(feeds.map(function(f){return fetch('https://api.rss2json.com/v1/api.json?rss_url='+encodeURIComponent(f.u)).then(r=>r.json()).then(j=>({j:j,s:f.s})).catch(()=>null);}));
    if(cat!==newsCat)return;
    var all=[];res.forEach(function(x){if(x&&x.j&&x.j.items)x.j.items.forEach(function(it){all.push({title:it.title,link:it.link,t:Date.parse(it.pubDate)||Date.now(),src:x.s});});});
    all.sort(function(a,b){return b.t-a.t;});all=all.slice(0,18);
    if(cat==='US'&&usTr){ if(full)full.innerHTML='<div style="color:var(--faint);font-size:12px;padding:8px 0">🌐 번역 중…</div>'; var tt=await Promise.all(all.map(function(n){return trOne(n.title);})); if(cat!==newsCat)return; all.forEach(function(n,i){n.title=tt[i];}); }
    function item(n){var se=sentiment(n.title);var st=se==='pos'?' <span class="up" style="font-size:10px;font-weight:800">▲</span>':se==='neg'?' <span class="down" style="font-size:10px;font-weight:800">▼</span>':'';return '<a href="'+n.link+'" target="_blank" rel="noopener"><span class="tm">'+relTime(n.t)+'</span><span class="tt">'+esc(n.title)+st+'</span></a>';}
    if(full)full.innerHTML=all.map(item).join('');
    if(home)home.innerHTML=all.slice(0,7).map(item).join('');
    if($('#newsupd'))$('#newsupd').textContent='· 방금 갱신';
  }catch(e){ if(full)full.innerHTML='<div style="color:var(--faint);font-size:12px">뉴스를 불러오지 못했어요</div>'; }
}
$$('.nc').forEach(function(b){ b.onclick=function(){ newsCat=b.dataset.cat; $$('.nc').forEach(function(x){x.classList.toggle('on',x===b);x.style.borderColor=x===b?'var(--gold)':'var(--line)';}); var tb=$('#trbtn'); if(tb)tb.style.display=newsCat==='US'?'':'none'; fetchNews(); }; });

/* ═══════════ 테마 ═══════════ */
(function(){ var root=document.documentElement, tb=$('#theme'); var sv=null; try{sv=localStorage.getItem('aurtheme');}catch(e){}
  function ap(t){ root.setAttribute('data-theme',t); if(tb)tb.textContent=t==='dark'?'☀️':'🌙'; }
  if(sv)ap(sv); else if(tb)tb.textContent=matchMedia('(prefers-color-scheme:dark)').matches?'☀️':'🌙';
  if(tb)tb.onclick=function(){ var cur=root.getAttribute('data-theme'); var n=(cur==='dark')?'light':(cur==='light'?'dark':(matchMedia('(prefers-color-scheme:dark)').matches?'light':'dark')); ap(n); try{localStorage.setItem('aurtheme',n);}catch(e){} renderIdx(); };
})();

/* ═══════════ 검색 ═══════════ */
$('#q').oninput=function(){ var t=this.value.trim().toLowerCase(); if(!t)return; var hit=STK.find(function(s){return s.n.toLowerCase().includes(t)||s.c.includes(t);}); if(hit){ /* 엔터 시 이동 */ } };
$('#q').onkeydown=function(e){ if(e.key==='Enter'){ var t=this.value.trim().toLowerCase(); var hit=STK.find(function(s){return s.n.toLowerCase().includes(t)||s.c.includes(t);}); if(hit)openStock(hit.c); } };

/* ═══════════ 초기화 ═══════════ */
renderIdx(); renderTune(); renderRadar(); renderSmart(); renderFlow(); renderCats(); fetchNews();
setInterval(fetchNews,300000);
