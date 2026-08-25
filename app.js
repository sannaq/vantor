/* ═══════════════════════════════════════════════════════════
   밤톨이 Pro — app.js
   - 밤톨이 DAY SCORE 100점 엔진 (스펙 §3~4)
   - 데모 목데이터로 즉시 작동, PROXY 설정 시 실데이터로 확장
   ═══════════════════════════════════════════════════════════ */
// 시세 프록시(Cloudflare Worker → 토스증권 Open API). 응답 실패 시 자동으로 데모 폴백
// 워커 이름 aureum-kis 는 KIS 로 처음 만든 흔적 — URL 유지를 위해 그대로 둔다
const PROXY='https://aureum-kis.wlsghman1.workers.dev';

/* ---------- 유틸 ---------- */
const $=(s,r)=>(r||document).querySelector(s), $$=(s,r)=>[...(r||document).querySelectorAll(s)];
const won=n=>'₩'+Math.round(n).toLocaleString('en-US');
const pctTxt=(c)=>(c>=0?'+':'')+(+c).toFixed(2)+'%';
const cls=(c)=>c>0?'up':(c<0?'down':'flat');
const arw=(c)=>c>0?'▲':(c<0?'▼':'–');
/* 실데이터는 지표가 비어 올 수 있다(공급처가 안 주거나 보강 범위 밖).
   null 을 0 으로 둔갑시키지 않고 그대로 드러내기 위한 헬퍼. */
function hasNum(v){ return v!=null && isFinite(v); }
function nz(v,d){ return hasNum(v)?+v:(d||0); }
function numOrDash(v,fn){ return hasNum(v)?fn(+v):'—'; }
function fmtEok(v){ // 억원 표기
  if(v>=10000) return (v/10000).toFixed(1)+'조';
  return Math.round(v).toLocaleString('en-US')+'억';
}
function sparkline(data,w,h,color){
  var lo=Math.min.apply(null,data), hi=Math.max.apply(null,data), rng=(hi-lo)||1;
  var pts=data.map(function(v,i){ return (i/(data.length-1)*w).toFixed(1)+','+(h-(v-lo)/rng*h).toFixed(1); }).join(' ');
  return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.6" stroke-linejoin="round"/></svg>';
}

/* ═══════════ 밤톨이 DAY SCORE 엔진 (100점) ═══════════ */
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
function weightedTotal(g,gmax){ var keys=['trade','price','press','flow','trend'], num=0, den=0;
  keys.forEach(function(k){ if(gmax[k]>0){ num+=TUNE.w[k]*(g[k]/gmax[k]); den+=TUNE.w[k]; } });
  return den? Math.round(100*num/den):0;
}
function comp(v,fn,max){ return (v==null)?null:[fn(v),max]; }
function aureumScore(s){
  // 각 지표: 값 없으면(null) 그 그룹 만점에서 제외 → 부분 데이터도 공정 스코어(실데이터 대응)
  var defs={
    trade:[comp(s.valPct,sVal,10),comp(s.valInc,sValInc,10),comp(s.accel,sAccel,10),comp(s.rvol,sRvol,5)],
    price:[comp(s.openPct,sOpen,10),comp(s.highGap,sHigh,8),comp(s.momPct,sMom,12)],
    press:[comp(s.strength,sStr,10),comp(s.bidRatio,sBid,5),comp(s.progPct,sProg,10)],
    flow:[s.invest==null?null:[sInv(s.invest),5]],
    trend:[s.breakout==null?null:[s.breakout,5]]
  };
  var groups={}, gmax={};
  Object.keys(defs).forEach(function(k){ var sc=0,mx=0; defs[k].forEach(function(c){ if(c){sc+=c[0];mx+=c[1];} }); groups[k]=+sc.toFixed(1); gmax[k]=mx; });
  var total = weightedTotal(groups,gmax);
  var reasons=[];
  if(s.accel>=2) reasons.push('최근 5분 거래대금 '+s.accel.toFixed(1)+'배 증가');
  if(s.valInc>=70) reasons.push('전일 동시간 대비 거래대금 +'+Math.round(s.valInc)+'%');
  if(s.openPct>=2&&s.openPct<10) reasons.push('시가 대비 +'+s.openPct.toFixed(1)+'% (초·중기 모멘텀 구간)');
  // 주의: null<=1.5 는 true 로 평가된다(0으로 강제변환) → 반드시 값 존재부터 확인
  if(hasNum(s.highGap)&&s.highGap<=1.5) reasons.push('장중 고점 대비 -'+s.highGap.toFixed(1)+'% (고점 부근 힘 유지)');
  if(s.strength>=120) reasons.push('체결강도 '+Math.round(s.strength)+' (매수 우위)');
  if(s.bidRatio>=60) reasons.push('호가 매수 우위 '+Math.round(s.bidRatio)+'%');
  if(s.progPct>=3) reasons.push('프로그램 순매수 +'+s.progPct.toFixed(1)+'%');
  if(s.invest==='both') reasons.push('외국인·기관 동반 매수');
  if(s.breakout>=4) reasons.push('전일 고가·주요 저항 돌파');
  var grade = total>=90?['🔥 STRONG MOMENTUM','strong']:total>=80?['🟢 MOMENTUM','rise']:total>=70?['🟡 WATCH','steady']:total>=60?['⚪ NEUTRAL','steady']:['NO SIGNAL','steady'];
  return { total, groups:groups, gmax:gmax, reasons:reasons.slice(0,6), grade };
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
// 미국 주식 데모 (ccy USD)
const USTK=[
  {c:'NVDA',n:'엔비디아',mk:'NASDAQ',ccy:'USD',px:194.69,ch:2.14,valPct:99,valInc:120,accel:2.1,rvol:2.4,openPct:2.3,highGap:1.2,momPct:82,strength:135,bidRatio:62,progPct:0,invest:'foreign',breakout:4,dRank:0,cooling:false},
  {c:'TSLA',n:'테슬라',mk:'NASDAQ',ccy:'USD',px:304.92,ch:3.42,valPct:97,valInc:160,accel:2.6,rvol:2.8,openPct:3.6,highGap:1.0,momPct:86,strength:139,bidRatio:65,progPct:0,invest:'foreign',breakout:4,dRank:0,cooling:false},
  {c:'AAPL',n:'애플',mk:'NASDAQ',ccy:'USD',px:229.87,ch:0.86,valPct:96,valInc:60,accel:1.6,rvol:1.7,openPct:0.9,highGap:1.9,momPct:58,strength:118,bidRatio:56,progPct:0,invest:'inst',breakout:3,dRank:0,cooling:false},
  {c:'MSFT',n:'마이크로소프트',mk:'NASDAQ',ccy:'USD',px:428.76,ch:1.24,valPct:95,valInc:70,accel:1.7,rvol:1.8,openPct:1.4,highGap:1.7,momPct:62,strength:120,bidRatio:57,progPct:0,invest:'inst',breakout:3,dRank:0,cooling:false},
  {c:'GOOGL',n:'알파벳',mk:'NASDAQ',ccy:'USD',px:205.12,ch:1.02,valPct:93,valInc:55,accel:1.5,rvol:1.6,openPct:1.1,highGap:2.1,momPct:55,strength:116,bidRatio:55,progPct:0,invest:'inst',breakout:2,dRank:0,cooling:false},
  {c:'AMZN',n:'아마존',mk:'NASDAQ',ccy:'USD',px:231.44,ch:1.58,valPct:94,valInc:75,accel:1.8,rvol:1.9,openPct:1.7,highGap:1.6,momPct:64,strength:122,bidRatio:58,progPct:0,invest:'foreign',breakout:3,dRank:0,cooling:false},
  {c:'META',n:'메타',mk:'NASDAQ',ccy:'USD',px:612.30,ch:-0.74,valPct:92,valInc:40,accel:1.3,rvol:1.4,openPct:-0.5,highGap:3.4,momPct:38,strength:106,bidRatio:49,progPct:0,invest:'sell',breakout:1,dRank:0,cooling:false},
  {c:'AMD',n:'AMD',mk:'NASDAQ',ccy:'USD',px:167.85,ch:4.10,valPct:90,valInc:170,accel:2.7,rvol:2.9,openPct:4.3,highGap:1.1,momPct:84,strength:137,bidRatio:64,progPct:0,invest:'foreign',breakout:4,dRank:0,cooling:false},
  {c:'NFLX',n:'넷플릭스',mk:'NASDAQ',ccy:'USD',px:842.10,ch:0.62,valPct:88,valInc:45,accel:1.4,rvol:1.5,openPct:0.7,highGap:2.3,momPct:50,strength:112,bidRatio:54,progPct:0,invest:'inst',breakout:2,dRank:0,cooling:false},
  {c:'AVGO',n:'브로드컴',mk:'NASDAQ',ccy:'USD',px:178.42,ch:2.88,valPct:91,valInc:110,accel:2.2,rvol:2.3,openPct:2.9,highGap:1.3,momPct:76,strength:130,bidRatio:61,progPct:0,invest:'foreign',breakout:3,dRank:0,cooling:false},
  {c:'PLTR',n:'팔란티어',mk:'NASDAQ',ccy:'USD',px:78.34,ch:5.62,valPct:86,valInc:220,accel:3.2,rvol:3.5,openPct:6.4,highGap:0.8,momPct:90,strength:144,bidRatio:68,progPct:0,invest:'one',breakout:4,dRank:0,cooling:false},
  {c:'COIN',n:'코인베이스',mk:'NASDAQ',ccy:'USD',px:312.55,ch:6.80,valPct:84,valInc:250,accel:3.4,rvol:3.7,openPct:7.1,highGap:1.4,momPct:88,strength:142,bidRatio:67,progPct:0,invest:'one',breakout:4,dRank:0,cooling:false},
  {c:'MSTR',n:'마이크로스트래티지',mk:'NASDAQ',ccy:'USD',px:398.20,ch:7.94,valPct:82,valInc:280,accel:3.6,rvol:3.9,openPct:8.4,highGap:1.6,momPct:87,strength:140,bidRatio:66,progPct:0,invest:'one',breakout:4,dRank:0,cooling:false},
  {c:'TSM',n:'TSMC',mk:'NYSE',ccy:'USD',px:198.76,ch:1.90,valPct:90,valInc:85,accel:1.9,rvol:2.0,openPct:2.0,highGap:1.5,momPct:68,strength:124,bidRatio:59,progPct:0,invest:'foreign',breakout:3,dRank:0,cooling:false}
];
STK.forEach(function(s){s.ccy='KRW';});
const ALLSTK=STK.concat(USTK);
const CATS=[
  {ic:'🔲',nm:'반도체',sc:87,d:2,chg:2.45,val:284,top:[['SK하이닉스',89],['삼성전자',84],['한미반도체',74]]},
  {ic:'🚢',nm:'조선',sc:82,d:5,chg:2.18,val:196,top:[['HD현대중공업',94],['한화오션',82],['삼성중공업',72]]},
  {ic:'🛡️',nm:'방산',sc:76,d:1,chg:1.89,val:238,top:[['한화에어로스페이스',88],['LIG넥스원',78],['현대로템',69]]},
  {ic:'🧬',nm:'바이오·제약',sc:71,d:1,chg:1.64,val:142,top:[['삼성바이오로직스',85],['알테오젠',74],['셀트리온',63]]},
  {ic:'🏗️',nm:'건설',sc:58,d:0,chg:1.21,val:61,top:[['현대건설',68],['GS건설',55],['DL이앤씨',51]]},
  {ic:'🤖',nm:'로봇·AI',sc:55,d:1,chg:1.05,val:97,top:[['레인보우로보틱스',74],['두산로보틱스',63],['에스피지',54]]},
  {ic:'🚗',nm:'자동차',sc:49,d:-1,chg:-0.32,val:32,top:[['현대차',62],['기아',55],['현대모비스',47]]},
  {ic:'🏦',nm:'금융',sc:45,d:0,chg:0.41,val:19,top:[['KB금융',58],['신한지주',49],['하나금융지주',44]]}
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
let RADAR=[]; let SEL=null; let _lastNews=[];
let useReal=false, KISUNIV=null, useRealMkt=false; // 프록시 실데이터
async function loadKisMarket(){
  if(!PROXY) return;
  try{
    var m=await fetch(PROXY+'/market?mkt=KR').then(function(r){return r.json();});
    if(m&&Array.isArray(m.indices)&&m.indices.length){
      m.indices.forEach(function(x){ if(!x||!x.v)return; var t=IDX.find(function(i){return i.nm===x.nm;}); if(t){ t.v=x.v; t.c=x.c; t.d=x.d; t._real=true; } });
      if(m.breadth){ var b=m.breadth; ['up','down','flat','upH','downH'].forEach(function(k){ if(b[k]!=null)FLOW.breadth[k]=b[k]; }); }
      useRealMkt=true; renderIdx(); renderFlow(); if(typeof renderSummary==='function')renderSummary();
    }
  }catch(e){}
}
/* ═══════════ 관심종목(WATCHLIST) — localStorage 'aurWatch' ═══════════ */
var WATCH=[]; try{ WATCH=JSON.parse(localStorage.getItem('aurWatch')||'[]')||[]; }catch(e){ WATCH=[]; }
function watchSave(){ try{ localStorage.setItem('aurWatch',JSON.stringify(WATCH)); }catch(e){} }
function watchHas(code){ return WATCH.indexOf(code)>-1; }
function watchToggle(code,nm){
  var i=WATCH.indexOf(code);
  if(i>-1) WATCH.splice(i,1); else WATCH.push(code);
  watchSave();
  // 열린 화면들 갱신
  $$('.starbtn[data-c="'+code+'"]').forEach(function(b){ var on=watchHas(code); b.textContent=on?'★':'☆'; b.classList.toggle('on',on); });
  if($('#v-watch')&&$('#v-watch').classList.contains('on')) renderWatch();
  updateWatchBadge();
}
function starBtn(code,nm){ var on=watchHas(code);
  return '<button class="starbtn'+(on?' on':'')+'" data-c="'+code+'" title="관심종목" '
    +'onclick="event.stopPropagation();watchToggle(\''+code+'\')">'+(on?'★':'☆')+'</button>'; }
function updateWatchBadge(){ var a=$('.menu a[data-v=\"watch\"]'); if(a) a.textContent='관심'+(WATCH.length?' '+WATCH.length:''); }
/* 관심종목 화면 — 실시간 시세(/quotes 배치) + RADAR 점수 비교표 */
async function renderWatch(){
  var el=$('#watchPanel'); if(!el) return;
  if(!WATCH.length){ el.innerHTML='<div style="padding:26px 8px;color:var(--faint);font-size:13px;text-align:center">'
    +'관심종목이 없습니다. 종목 목록·상세·RADAR에서 ☆ 를 눌러 담아보세요.</div>';
    if($('#watchupd'))$('#watchupd').textContent=''; return; }
  // 이름·통화·시장: RADAR/ALLSTK에서 우선 확보
  function meta(code){ var r=(RADAR||[]).find(function(x){return x.c===code;})
      ||(typeof ALLSTK!=='undefined'?ALLSTK:STK).find(function(x){return x.c===code;});
    return r?{n:r.n,mk:r.mk,ccy:r.ccy||'KRW',score:r.score}:{n:code,mk:'',ccy:'KRW'}; }
  // 실시간 시세: 프록시 있으면 국내/미국 나눠 배치 조회
  var live={};
  if(PROXY){
    var kr=WATCH.filter(function(c){return (meta(c).ccy||'KRW')!=='USD';});
    var us=WATCH.filter(function(c){return meta(c).ccy==='USD';});
    var jobs=[];
    if(kr.length) jobs.push(proxyJson('/quotes?mkt=KR&codes='+kr.join(',')));
    if(us.length) jobs.push(proxyJson('/quotes?mkt=US&codes='+us.join(',')));
    var res=await Promise.all(jobs);
    res.forEach(function(j){ if(j&&j.quotes) j.quotes.forEach(function(q){ if(q&&q.px!=null) live[q.code]={px:q.px,c:q.c}; }); });
  }
  var rows=WATCH.map(function(code){ var m=meta(code), q=live[code]||{};
    var px=q.px!=null?q.px:null, ch=q.c!=null?q.c:null;
    return {code:code,n:m.n,mk:m.mk,ccy:m.ccy,score:m.score,px:px,ch:ch}; });
  el.innerHTML='<table><thead><tr><th class="l">종목</th><th>현재가</th><th>등락</th><th>RADAR</th><th></th></tr></thead><tbody>'
    +rows.map(function(r){
      var pxT=r.px!=null?(r.ccy==='USD'?('$'+(+r.px).toLocaleString('en-US',{maximumFractionDigits:2})):won(r.px)):'—';
      var chT=r.ch!=null?('<span class="'+cls(r.ch)+'" style="font-weight:700">'+pctTxt(r.ch)+'</span>'):'<span style="color:var(--faint)">—</span>';
      var scT=r.score!=null?('<span class="scorepill'+(r.score>=80?'':' s2')+'">'+r.score+'</span>'):'<span style="color:var(--faint)">–</span>';
      return '<tr class="rowbtn" data-c="'+r.code+'"><td class="l"><div class="sym">'+r.n+'<small>'+r.code+(r.mk?' · '+r.mk:'')+'</small></div></td>'
        +'<td style="font-weight:700">'+pxT+'</td><td>'+chT+'</td><td>'+scT+'</td>'
        +'<td><button class="starbtn on" data-c="'+r.code+'" title="관심 해제" onclick="event.stopPropagation();watchToggle(\''+r.code+'\')">★</button></td></tr>';
    }).join('')+'</tbody></table>';
  $$('#watchPanel .rowbtn').forEach(function(tr){ tr.onclick=function(){ openStock(tr.dataset.c); }; });
  if($('#watchupd'))$('#watchupd').textContent='· '+nowHM()+' · '+WATCH.length+'종목';
}
/* ETF/ETN 판별 — 한국 ETF는 예외 없이 운용사 브랜드가 종목명 맨 앞에 붙는다.
   레버리지·인버스도 여기서 걸러진다(사용자가 토글로 제외 선택 시). */
/* ETF 전용 브랜드만(실제 종목명과 겹치는 HK·파워 등은 제외 — HK이노엔·파워로직스 오탐 방지) */
var ETF_RE=/^(KODEX|TIGER|PLUS|ACE|SOL|RISE|KBSTAR|ARIRANG|HANARO|KOSEF|KINDEX|KIWOOM|TIMEFOLIO|FOCUS)\b/i;
function isETF(s){ return ETF_RE.test((s&&s.n)||''); }
var hideETF=false;
try{ hideETF=localStorage.getItem('aurHideETF')==='1'; }catch(e){}
function radarUniverse(){
  var base=(useReal&&KISUNIV&&KISUNIV.length)?KISUNIV:STK;
  return hideETF ? base.filter(function(s){return !isETF(s);}) : base;
}
/* 프록시 /radar → 실시간 스코어링 유니버스(계약: STK와 동일 필드). 실패 시 데모 유지 */
var KBOARD=null, _catchSeen={};
function toast(msg){ var t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t);
  setTimeout(function(){t.classList.add('show');},10);
  setTimeout(function(){t.classList.remove('show'); setTimeout(function(){t.remove();},300);},3500); }
/* 실시간 포착 — board에서 급등/급락 종목. 새 급등(≥5%)은 토스트 */
function renderCatch(){
  var el=$('#catchFeed'); if(!el) return;
  var board=(KBOARD&&KBOARD.length)?KBOARD:null;
  if(!board){ el.innerHTML='<div style="color:var(--faint);font-size:12px;padding:6px 0">'+(PROXY?'포착 대기 중…':'프록시 연결 시 실시간 포착')+'</div>'; return; }
  var surge=board.filter(function(x){return hasNum(x.ch)&&x.ch>=3;}).sort(function(a,b){return b.ch-a.ch;}).slice(0,6);
  var plunge=board.filter(function(x){return hasNum(x.ch)&&x.ch<=-3;}).sort(function(a,b){return a.ch-b.ch;}).slice(0,6);
  function row(title,arr,c){ if(!arr.length) return '';
    return '<div style="margin-bottom:9px"><div style="font-size:11px;font-weight:800;color:var(--faint);margin-bottom:6px">'+title+'</div><div style="display:flex;gap:6px;flex-wrap:wrap">'
      +arr.map(function(x){return '<span class="catchchip" data-c="'+x.c+'"><b>'+x.n+'</b> <span class="'+c+'">'+(x.ch>=0?'+':'')+(+x.ch).toFixed(1)+'%</span></span>';}).join('')+'</div></div>'; }
  el.innerHTML=(surge.length||plunge.length)?(row('🔥 급등 (+3%↑)',surge,'up')+row('💧 급락 (−3%↓)',plunge,'down'))
    :'<div style="color:var(--faint);font-size:12px;padding:6px 0">±3% 이상 급등락 종목이 아직 없어요 (장중에 채워집니다).</div>';
  $$('#catchFeed .catchchip').forEach(function(t){t.onclick=function(){openStock(t.dataset.c);};});
  if($('#catchupd'))$('#catchupd').textContent='· '+nowHM();
  surge.forEach(function(x){ if(x.ch>=5&&!_catchSeen[x.c]){ _catchSeen[x.c]=1; toast('🔥 '+x.n+' 급등 +'+(+x.ch).toFixed(1)+'%'); } });
}
/* 히트맵 색 — 등락률(%) → 빨강(상승)/회색(보합)/파랑(하락), 강도는 |%| */
function heatColor(ch){
  var t=Math.max(-1,Math.min(1,(ch||0)/6)); // ±6%에서 최대
  var g0=[58,63,74]; // 중립 회색
  var up=[229,56,77], dn=[47,107,255];
  var to=t>=0?up:dn, a=Math.abs(t);
  var r=Math.round(g0[0]+(to[0]-g0[0])*a), gg=Math.round(g0[1]+(to[1]-g0[1])*a), b=Math.round(g0[2]+(to[2]-g0[2])*a);
  return 'rgb('+r+','+gg+','+b+')';
}
function renderHeatmap(){
  var el=$('#heatmap'); if(!el) return;
  var board=(KBOARD&&KBOARD.length)?KBOARD:null;
  if(!board){ el.innerHTML='<div style="color:var(--faint);font-size:12px;padding:14px 2px">'+(PROXY?'불러오는 중…':'프록시 연결 시 실시간 히트맵')+'</div>'; return; }
  var items=board.filter(function(x){return x.px&&hasNum(x.ch);}).slice(0,30);
  var amts=items.map(function(x){return x.amount||1;});
  var mx=Math.max.apply(null,amts)||1, mn=Math.min.apply(null,amts)||1;
  el.innerHTML='<div class="heat">'+items.map(function(x){
    var grow=1+Math.round((Math.sqrt(x.amount||1)-Math.sqrt(mn))/(Math.sqrt(mx)-Math.sqrt(mn)||1)*5); // 1~6
    return '<div class="htile" data-c="'+x.c+'" style="flex-grow:'+grow+';background:'+heatColor(x.ch)+'">'
      +'<div class="hn">'+x.n+'</div><div class="hc">'+(x.ch>=0?'+':'')+(+x.ch).toFixed(2)+'%</div></div>';
  }).join('')+'</div>';
  $$('#heatmap .htile').forEach(function(t){ t.onclick=function(){ openStock(t.dataset.c); }; });
  var u='· '+nowHM()+' 기준'; if($('#heatupd'))$('#heatupd').textContent=u;
}
async function loadKisRadar(){
  if(!PROXY) return;
  try{
    var j=await fetch(PROXY+'/radar?mkt=KR&limit=40').then(function(r){return r.json();});
    if(j&&Array.isArray(j.stocks)&&j.stocks.length){
      // 이전 순위 저장 → 1분 순위변화(dRank) 계산
      var prev={}; RADAR.forEach(function(r){prev[r.c]=r.rank;});
      j.stocks.forEach(function(s){ s.ccy='KRW'; });
      KISUNIV=j.stocks; useReal=true; window._prevRank=prev;
      if(Array.isArray(j.board)&&j.board.length){ KBOARD=j.board; renderHeatmap(); renderCatch(); renderStrongSectors(); }
      var db=$('#demoban'); if(db)db.style.display='none';
      renderRadar(); renderCats();
    }
  }catch(e){}
}
function computeRadar(){
  var uni=radarUniverse();
  RADAR=uni.map(function(s){ var r=aureumScore(s); return Object.assign({},s,{score:r.total,g:r.groups,gmax:r.gmax,reasons:r.reasons,grade:r.grade}); });
  RADAR.sort(function(a,b){return b.score-a.score;});
  RADAR.forEach(function(r,i){ r.rank=i+1;
    if(useReal && window._prevRank && window._prevRank[r.c]!=null){ r.dRank=window._prevRank[r.c]-r.rank; }
    var st=radarStatus(r.dRank,r.cooling); r.status=st[0]; r.stcls=st[1]; });
  if(!SEL||!radarUniverse().find(function(x){return x.c===SEL.c;})) SEL=RADAR[0];
}
function pressBar(g){ var n=Math.round(g.press/25*5); var h=''; for(var i=0;i<5;i++)h+='<i class="'+(i<n?'on':'')+'"></i>'; return '<span class="press">'+h+'</span>'; }
function mvHtml(d){ if(d>0)return '<span class="mv up">↑ +'+d+'</span>'; if(d<0)return '<span class="mv down">↓ '+d+'</span>'; return '<span class="mv flat">→</span>'; }

function radarRow(r,full){
  var pc=cls(r.ch);
  var hs=r.score>=80?['강세','rise']:r.score>=70?['상승','rise']:['보합','steady'];
  var stCell=full?'<span class="st '+r.stcls+'">'+r.status+'</span>':'<span class="st '+hs[1]+'">'+hs[0]+'</span>';
  return '<tr class="rowbtn'+(SEL&&SEL.c===r.c?' sel':'')+'" data-c="'+r.c+'">'
    +'<td class="l"><span class="rank">'+r.rank+'</span></td>'
    +'<td class="l"><div class="sym" style="display:flex;align-items:center;gap:6px">'+starBtn(r.c)+'<div>'+r.n+'<small>'+r.c+' · '+r.mk+'</small></div></div></td>'
    +'<td><span class="scorepill'+(r.score>=80?'':' s2')+'">'+r.score+'</span></td>'
    +(full?'<td>'+mvHtml(r.dRank)+'</td>':'')
    +'<td class="'+pc+'">'+pctTxt(r.ch)+'</td>'
    +(full?'<td>'+pressBar(r.g)+'</td>':'')
    +'<td>'+stCell+'</td></tr>';
}
/* RADAR 헤더의 ETF 포함/제외 토글 (#mktfilter 자리). 기본=포함 */
function renderEtfToggle(){
  var el=$('#mktfilter'); if(!el) return;
  el.innerHTML='<button id="etfToggle" style="font:inherit;font-size:11px;font-weight:700;cursor:pointer;'
    +'border:1px solid var(--line);border-radius:12px;padding:3px 10px;margin-left:8px;'
    +'background:'+(hideETF?'transparent':'var(--line2)')+';color:'+(hideETF?'var(--faint)':'var(--ink)')+'">'
    +(hideETF?'ETF 제외됨':'ETF 포함')+'</button>';
  var b=$('#etfToggle'); if(b) b.onclick=function(){
    hideETF=!hideETF; try{localStorage.setItem('aurHideETF',hideETF?'1':'0');}catch(e){}
    renderRadar(); renderQuickView();
  };
}
/* ═══════════ 업종(테마) 실데이터 — 거래대금 상위 종목을 섹터로 분류 ═══════════
   추측 API 대신 종목→섹터 매핑 + board의 실제 등락률로 업종 강도 계산(신뢰성). */
var SECTOR_ICON={'반도체':'🔲','2차전지':'🔋','자동차':'🚗','조선':'🚢','방산':'🛡️','바이오·제약':'🧬',
  '인터넷·플랫폼':'🌐','금융':'🏦','화학·정유':'⚗️','철강·소재':'🏗️','엔터·미디어':'🎬','로봇·AI':'🤖',
  '원자력·전력':'⚡','게임':'🎮','건설':'🏢','유통·소비재':'🛒','통신':'📡'};
var SECTOR_MAP={
  '005930':'반도체','000660':'반도체','042700':'반도체','000990':'반도체','240810':'반도체','357780':'반도체','403870':'반도체','058470':'반도체',
  '373220':'2차전지','006400':'2차전지','247540':'2차전지','086520':'2차전지','066970':'2차전지','003670':'2차전지','137400':'2차전지',
  '005380':'자동차','000270':'자동차','012330':'자동차','161390':'자동차','204320':'자동차','011210':'자동차',
  '329180':'조선','042660':'조선','010140':'조선','009540':'조선','075580':'조선',
  '012450':'방산','079550':'방산','064350':'방산','272210':'방산','047810':'방산',
  '207940':'바이오·제약','068270':'바이오·제약','196170':'바이오·제약','000100':'바이오·제약','128940':'바이오·제약','302440':'바이오·제약','091990':'바이오·제약','326030':'바이오·제약','145020':'바이오·제약',
  '035420':'인터넷·플랫폼','035720':'인터넷·플랫폼','323410':'인터넷·플랫폼','259960':'인터넷·플랫폼','376300':'인터넷·플랫폼',
  '105560':'금융','055550':'금융','086790':'금융','316140':'금융','138040':'금융','032830':'금융','000810':'금융','024110':'금융','029780':'금융',
  '051910':'화학·정유','096770':'화학·정유','010950':'화학·정유','011170':'화학·정유','009830':'화학·정유','285130':'화학·정유',
  '005490':'철강·소재','004020':'철강·소재','103140':'철강·소재','014820':'철강·소재',
  '352820':'엔터·미디어','041510':'엔터·미디어','035900':'엔터·미디어','122870':'엔터·미디어','253450':'엔터·미디어',
  '277810':'로봇·AI','454910':'로봇·AI','108860':'로봇·AI','056080':'로봇·AI',
  '034020':'원자력·전력','052690':'원자력·전력','015760':'원자력·전력','267260':'원자력·전력','112610':'원자력·전력',
  '036570':'게임','251270':'게임','225570':'게임','263750':'게임','078340':'게임','293490':'게임','095660':'게임',
  '000720':'건설','028050':'건설','047040':'건설','375500':'건설','006360':'건설',
  '139480':'유통·소비재','023530':'유통·소비재','097950':'유통·소비재','280360':'유통·소비재','004370':'유통·소비재',
  '017670':'통신','030200':'통신','032640':'통신'};
function realCats(){
  if(!KBOARD||!KBOARD.length) return null;
  var byS={};
  KBOARD.forEach(function(x){ if(isETF(x))return; var sec=SECTOR_MAP[x.c]; if(!sec)return; (byS[sec]=byS[sec]||[]).push(x); });
  var keys=Object.keys(byS); if(keys.length<3) return null; // 매핑이 너무 적으면 데모 유지
  var cats=keys.map(function(sec){ var mem=byS[sec];
    var totAmt=mem.reduce(function(a,m){return a+(m.amount||0);},0)||1;
    var wch=mem.reduce(function(a,m){return a+((m.ch||0)*(m.amount||0));},0)/totAmt; // 거래대금 가중 등락률
    mem.sort(function(a,b){return (b.amount||0)-(a.amount||0);});
    var sc=Math.max(0,Math.min(100,Math.round(50+wch*6)));
    var top=mem.slice(0,3).map(function(m){return [m.n, Math.max(0,Math.min(100,Math.round(50+(m.ch||0)*6)))];});
    return { ic:SECTOR_ICON[sec]||'📊', nm:sec, sc:sc, d:0, chg:+wch.toFixed(2), val:Math.round(totAmt/1e8), top:top, members:mem.length, _real:true };
  });
  cats.sort(function(a,b){return b.sc-a.sc;});
  return cats;
}
function getCats(){ return realCats()||CATS; }
function renderStrongSectors(){
  var el=$('#strongSectors'); if(!el)return;
  var arr=getCats().slice().sort(function(a,b){return b.sc-a.sc;});
  el.innerHTML='<table><thead><tr><th class="l">업종</th><th>업종 SCORE</th><th>등락률</th></tr></thead><tbody>'
    +arr.map(function(x,i){ var medal=i<3?'<span class="scorepill" style="min-width:20px;padding:2px 6px;border-radius:50%;margin-right:7px">'+(i+1)+'</span>':'<span class="rank" style="margin-right:9px;display:inline-block;width:20px;text-align:center">'+(i+1)+'</span>';
      var barw=Math.round((x.sc-40)/55*100);
      return '<tr><td class="l">'+medal+'<span style="font-weight:700">'+x.ic+' '+x.nm+'</span></td>'
        +'<td><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><div style="width:64px;height:5px;background:var(--line);border-radius:3px;overflow:hidden"><div style="width:'+barw+'%;height:100%;background:linear-gradient(90deg,var(--gold),var(--gold2))"></div></div><b style="width:22px;text-align:right">'+x.sc+'</b></div></td>'
        +'<td class="'+cls(x.chg)+'" style="font-weight:700">'+pctTxt(x.chg)+'</td></tr>';
    }).join('')+'</tbody></table>';
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
  // RADAR 행 클릭 → 종목 상세 바로 열기 (별 클릭은 stopPropagation 으로 제외됨)
  $$('#homeRadar .rowbtn, #fullRadar .rowbtn').forEach(function(tr){ tr.onclick=function(){ openStock(tr.dataset.c); }; });
  renderEtfToggle();
  if(typeof renderSummary==='function')renderSummary();
  var u='· '+nowHM()+' 기준'; if($('#radarupd'))$('#radarupd').textContent=u; if($('#radarupd2'))$('#radarupd2').textContent=u;
  renderQuickView();
}
function renderQuickView(){
  var el=$('#quickView'); if(!el||!SEL)return; var r=SEL;
  function bar(k,v,mx){ if(!mx)return ''; return '<div class="bar"><span class="k">'+k+'</span><div class="track"><div class="fill" style="width:'+Math.min(100,v/mx*100)+'%"></div></div><span class="vv">'+v+' / '+mx+'</span></div>'; }
  var gm=r.gmax||{trade:35,price:30,press:25,flow:5,trend:5};
  el.innerHTML='<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="big">'+r.n+'</span><span style="color:var(--faint);font-size:12px">'+r.c+'</span></div>'
    +'<div style="font-size:15px;font-weight:800;margin-top:2px" class="'+cls(r.ch)+'">'+won(r.px)+' <span style="font-size:13px">'+pctTxt(r.ch)+'</span></div>'
    +'<div class="gauge"><div class="gnum" style="color:var(--gold)">'+r.score+'</div><div><div style="font-size:11px;color:var(--faint);font-weight:700">RADAR SCORE / 100</div><div style="font-weight:800;margin-top:2px">'+r.grade[0]+'</div><div style="margin-top:3px"><span class="st '+r.stcls+'">'+r.status+'</span></div></div></div>'
    +bar('거래 활성',r.g.trade,gm.trade)+bar('가격 움직임',r.g.price,gm.price)+bar('실시간 압력',r.g.press,gm.press)+bar('수급',r.g.flow,gm.flow)+bar('추세',r.g.trend,gm.trend)
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
    return '<div class="idx"><div class="nm">'+x.nm+(x._real?'':' <span style="font-size:9px;font-weight:800;color:var(--gold);border:1px solid var(--gold);border-radius:4px;padding:0 4px;vertical-align:middle">데모</span>')+'</div>'+sparkline(x.tr,96,44,col)
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
  var C=getCats();
  var h=$('#homeCats'); if(h)h.innerHTML=C.slice(0,4).map(catCard).join('');
  var a=$('#allCats'); if(a)a.innerHTML=C.map(catCard).join('');
  var heat=$('#catHeat'); if(heat){ heat.innerHTML='<div class="heat">'+C.map(function(x){ var t=(x.sc-40)/55; var col='hsl('+(t*18)+','+(55+t*35)+'%,'+(58-t*16)+'%)'; return '<div class="h" style="background:'+col+'">'+x.sc+'<div class="hs">'+x.nm+'</div></div>'; }).join('')+'</div>'; }
  var cr=$('#catRank'); if(cr){ cr.innerHTML='<table><thead><tr><th class="l">순위</th><th class="l">업종</th><th>SCORE</th><th>1분 변화</th></tr></thead><tbody>'
    +getCats().map(function(x,i){return '<tr><td class="l"><span class="rank">'+(i+1)+'</span></td><td class="l">'+x.ic+' '+x.nm+'</td><td>'+x.sc+'</td><td>'+(x._real?'<span class="mv flat" style="color:var(--gold)">실시간</span>':mvHtml(x.d))+'</td></tr>';}).join('')+'</tbody></table>'; }
  var rs=$('#radarStats'); if(rs){
    /* 값이 없는 종목은 순위에서 빼고, 하나도 없으면 카드에 사유를 적는다(0으로 채우지 않는다) */
    function statCard(title,key,fmt){
      var arr=RADAR.filter(function(r){return hasNum(r[key]);}).sort(function(a,b){return b[key]-a[key];}).slice(0,5);
      var body=arr.length
        ? arr.map(function(r){return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line2)"><span>'+r.n+'</span><b class="up">'+fmt(r[key])+'</b></div>';}).join('')
        : '<div style="font-size:12px;color:var(--faint);padding:6px 0">이 지표는 아직 데이터가 없습니다.</div>';
      return '<div class="card"><div class="ch"><h2>'+title+'</h2></div><div class="pad">'+body+'</div></div>';
    }
    rs.innerHTML=statCard('💵 거래대금 가속','accel',function(v){return '×'+v.toFixed(1);})
      +statCard('🔥 체결강도 상위','strength',function(v){return Math.round(v);})
      +statCard('📗 호가 매수우위','bidRatio',function(v){return Math.round(v)+'%';});
  }
}
/* STOCK 상세 분석 (목업 4) */
function stockSubs(r){
  var DM={trade:35,price:30,press:25,flow:5,trend:5};
  function gp(k){ var mx=(r.gmax&&r.gmax[k])?r.gmax[k]:DM[k]; return mx?Math.max(0,Math.min(1,r.g[k]/mx)):0; }
  return {
    MOMENTUM: Math.round(gp('price')*100),
    VOLUME: Math.round(gp('trade')*100),
    'MONEY FLOW': Math.round(gp('press')*55 + gp('flow')*45),
    TREND: Math.round(gp('trend')*70 + gp('price')*30),
    SENTIMENT: Math.round((sStr(r.strength||0)/10*60)+(sBid(r.bidRatio||0)/5*40))
  };
}
function gradeTxt(v){ return v>=85?['매우 양호','up']:v>=70?['양호','up']:v>=55?['보통','flat']:['주의','down']; }
/* 지수이동평균 — 종가 배열 → EMA 배열. 초기값은 첫 종가로 시드(관례) */
function emaSeries(closes,p){ var k=2/(p+1), out=[], e=closes[0];
  for(var i=0;i<closes.length;i++){ e=(i===0)?closes[0]:closes[i]*k+e*(1-k); out.push(e); } return out; }
function drawStockChart(cv,r){
  if(!cv)return; var ctx=cv.getContext('2d'); var rect=cv.getBoundingClientRect();
  cv.width=Math.round(rect.width*2); cv.height=520;
  function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
  var up=css('--up')||'#e5384d', dn=css('--down')||'#2f6bff', line=css('--line')||'#e7eaf0',
      sub=css('--sub')||'#8a94a6';
  var MA=[[5,'#f5a623'],[20,'#2f9e6e'],[60,'#8b5cf6']]; // 이동평균선 색
  var W=cv.width,H=cv.height; ctx.clearRect(0,0,W,H);
  var seed=parseInt(r.c,10)||1234; function rnd(){ seed=(seed*9301+49297)%233280; return seed/233280; }
  var n, data, last, real=false;
  if(r._candles&&r._candles.length>1){ // 프록시 /candles 실데이터: [ms,o,h,l,c,v]
    data=r._candles.slice(-90).map(function(k){ return [k[1],k[2],k[3],k[4],k[5]||0,k[0]]; }); // +ms
    n=data.length; last=data[n-1][3]; real=true;
  }else{                               // 폴백: 데모 합성 캔들
    n=48; data=[]; var p=r.px*0.94, t0=Date.now();
    for(var i=0;i<n;i++){ var drift=(r.ch/100)*r.px*(i/n)*1.4; var o=p; var mv=(rnd()-0.45)*r.px*0.012; var c=r.px*0.94+drift+mv+(i===n-1?(r.px-(r.px*0.94+drift)):0);
      var h0=Math.max(o,c)+rnd()*r.px*0.006+r.px*0.001, l0=Math.min(o,c)-rnd()*r.px*0.006-r.px*0.001; data.push([o,h0,l0,c,rnd()*1e6,t0-(n-i)*864e5]); p=c; }
    data[n-1][3]=r.px; last=r.px;
  }
  var closes=data.map(function(d){return d[3];});
  // 여백: 우측=가격축, 하단=날짜축
  var RM=76, padL=6, padT=30, BM=26; // RM=우측 가격축, BM=하단 날짜축
  var plotR=W-RM;
  var priceB=Math.round(H*0.66), volT=priceB+18, volB=H-BM;
  var lo=Math.min.apply(null,data.map(d=>d[2])), hi=Math.max.apply(null,data.map(d=>d[1]));
  var emas=MA.map(function(m){return emaSeries(closes,m[0]);});
  emas.forEach(function(e){ e.forEach(function(v){ if(v<lo)lo=v; if(v>hi)hi=v; }); });
  var pad=(hi-lo)*0.04; hi+=pad; lo-=pad;
  var gh=priceB-padT;
  function y(v){return padT+(hi-v)/((hi-lo)||1)*gh;}
  function xAt(i){ return padL+(i+0.5)*((plotR-padL)/n); }
  // 가격 그리드 + 우측 가격 라벨
  ctx.font='500 17px system-ui,sans-serif';ctx.textBaseline='middle';
  for(var g=0;g<=4;g++){ var yy=padT+gh*g/4, pv=hi-(hi-lo)*g/4;
    ctx.strokeStyle=line;ctx.globalAlpha=.4;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(padL,yy);ctx.lineTo(plotR,yy);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=sub;ctx.textAlign='left';
    ctx.fillText(r.ccy==='USD'?('$'+pv.toFixed(2)):Math.round(pv).toLocaleString('en-US'),plotR+6,yy); }
  var cw=(plotR-padL)/n, bw=Math.max(2,cw*0.62);
  // 캔들
  for(var j=0;j<n;j++){var d=data[j],x=xAt(j),rise=d[3]>=d[0],col=rise?up:dn;ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,y(d[1]));ctx.lineTo(x,y(d[2]));ctx.stroke();
    var yo=y(d[0]),yc=y(d[3]);ctx.fillRect(x-bw/2,Math.min(yo,yc),bw,Math.max(2,Math.abs(yc-yo)));}
  // 이동평균선
  ctx.lineWidth=2.2;
  MA.forEach(function(m,mi){ if(n<3)return; var e=emas[mi]; ctx.strokeStyle=m[1]; ctx.beginPath();
    for(var i=0;i<n;i++){ var x=xAt(i), yy=y(e[i]); if(i===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);} ctx.stroke(); });
  // 피보나치 되돌림 — 표시된 구간의 스윙 고/저를 자동 감지해 레벨 표시
  if(_fibOn && n>3){
    var hIdx=0,lIdx=0; for(var fi=0;fi<n;fi++){ if(data[fi][1]>data[hIdx][1])hIdx=fi; if(data[fi][2]<data[lIdx][2])lIdx=fi; }
    var sHi=data[hIdx][1], sLo=data[lIdx][2], upSwing=lIdx<hIdx, diff=sHi-sLo;
    var FIB=[[0,'0'],[0.236,'0.236'],[0.382,'0.382'],[0.5,'0.5'],[0.618,'0.618'],[0.786,'0.786'],[1,'1.0'],[1.618,'1.618 (확장)']];
    ctx.font='600 15px system-ui,sans-serif';ctx.textBaseline='middle';
    FIB.forEach(function(f){ var rt=f[0];
      var pv=upSwing?(sHi-diff*rt):(sLo+diff*rt); var yy=y(pv);
      if(yy<padT-2||yy>priceB+2) return;
      var key=(rt===0.5||rt===0.618), ext=rt>1;
      ctx.strokeStyle=ext?'#8b5cf6':(key?'var(--gold)':'var(--sub)');
      ctx.globalAlpha=key?0.9:(ext?0.8:0.45); ctx.lineWidth=key?1.5:1; ctx.setLineDash(key?[]:[4,4]);
      ctx.beginPath();ctx.moveTo(padL,yy);ctx.lineTo(plotR,yy);ctx.stroke();
      ctx.globalAlpha=1;ctx.setLineDash([]);
      ctx.fillStyle=ext?'#8b5cf6':(key?css('--gold')||'#c19a3e':sub);ctx.textAlign='left';
      ctx.fillText(f[1]+'  '+(r.ccy==='USD'?('$'+pv.toFixed(2)):Math.round(pv).toLocaleString('en-US')), padL+4, yy-7);
    });
    ctx.globalAlpha=1;ctx.setLineDash([]);
    // 스윙 방향 배지
    ctx.fillStyle=sub;ctx.font='600 14px system-ui,sans-serif';ctx.textAlign='right';
    ctx.fillText('피보나치 · '+(upSwing?'상승 스윙(저→고)':'하락 스윙(고→저)'), plotR-4, priceB-6);
  }
  // 현재가 라인 + 우측 현재가 태그
  ctx.lineWidth=1.4;ctx.strokeStyle=cls(r.ch)==='up'?up:dn;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(padL,y(last));ctx.lineTo(plotR,y(last));ctx.stroke();ctx.setLineDash([]);
  var lyt=y(last), lt=(r.ccy==='USD'?('$'+last.toFixed(2)):Math.round(last).toLocaleString('en-US'));
  ctx.fillStyle=cls(r.ch)==='up'?up:dn;ctx.fillRect(plotR,lyt-11,RM,22);
  ctx.fillStyle='#fff';ctx.textAlign='left';ctx.font='700 17px system-ui,sans-serif';ctx.fillText(lt,plotR+6,lyt);
  // 거래량 바
  var vmax=Math.max.apply(null,data.map(d=>d[4]))||1;
  for(var k2=0;k2<n;k2++){var d2=data[k2],x2=xAt(k2),rise2=d2[3]>=d2[0];
    ctx.fillStyle=rise2?up:dn;ctx.globalAlpha=.55;
    var vh=Math.max(1,(d2[4]/vmax)*(volB-volT)); ctx.fillRect(x2-bw/2,volB-vh,bw,vh);}
  ctx.globalAlpha=1;
  // 날짜(X) 라벨 — 4~5개 균등
  ctx.fillStyle=sub;ctx.font='500 16px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  var steps=Math.min(5,n); for(var s2=0;s2<steps;s2++){ var idx=Math.round(s2*(n-1)/(steps-1||1)); var ms=data[idx][5];
    if(ms){ var dt=new Date(ms); var lbl=(_chartTF==='1'||_chartTF==='5')
        ? (String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0'))
        : ((dt.getMonth()+1)+'/'+dt.getDate());
      var xl=Math.max(14,Math.min(plotR-14,xAt(idx))); ctx.fillText(lbl,xl,volB+4); } }
  // 이평 범례 (좌상단)
  ctx.font='600 18px system-ui,sans-serif';ctx.textBaseline='top';ctx.textAlign='left';
  var lx=8;
  MA.forEach(function(m,mi){ var val=emas[mi][n-1]; var t='MA'+m[0]+' '+(r.ccy==='USD'?('$'+val.toFixed(2)):Math.round(val).toLocaleString('en-US'));
    ctx.fillStyle=m[1]; ctx.fillText(t,lx,6); lx+=ctx.measureText(t).width+16; });
  // 거래량 라벨
  ctx.fillStyle=sub;ctx.font='500 15px system-ui,sans-serif';ctx.fillText('거래량',8,volT+1);
  // 크로스헤어가 참조할 기하 상태 저장
  CHART={cv:cv,r:r,data:data,n:n,padL:padL,plotR:plotR,padT:padT,priceB:priceB,volT:volT,volB:volB,RM:RM,hi:hi,lo:lo,emas:emas,W:W,H:H,MA:MA,cw:cw,up:up,dn:dn,sub:sub,line:line,tf:_chartTF};
}
/* ── 차트 크로스헤어 + OHLC 툴팁 ── */
var CHART=null;
function crosshairIdx(clientX){
  if(!CHART) return -1; var cv=CHART.cv, rect=cv.getBoundingClientRect();
  var x=(clientX-rect.left)*(cv.width/rect.width);
  var i=Math.round((x-CHART.padL)/((CHART.plotR-CHART.padL)/CHART.n)-0.5);
  return Math.max(0,Math.min(CHART.n-1,i));
}
function drawCrosshair(idx){
  if(!CHART) return; drawStockChart(CHART.cv,CHART.r); // base 재렌더
  var C=CHART, ctx=C.cv.getContext('2d');
  var x=C.padL+(idx+0.5)*((C.plotR-C.padL)/C.n);
  var d=C.data[idx], yc=C.padT+(C.hi-d[3])/((C.hi-C.lo)||1)*(C.priceB-C.padT);
  ctx.save();ctx.strokeStyle=C.sub;ctx.globalAlpha=.6;ctx.lineWidth=1;ctx.setLineDash([4,3]);
  ctx.beginPath();ctx.moveTo(x,C.padT);ctx.lineTo(x,C.volB);ctx.stroke();           // 수직
  ctx.beginPath();ctx.moveTo(C.padL,yc);ctx.lineTo(C.plotR,yc);ctx.stroke();          // 수평
  ctx.setLineDash([]);ctx.globalAlpha=1;
  // 선택 봉 하이라이트
  ctx.fillStyle=C.sub;ctx.globalAlpha=.10;ctx.fillRect(x-C.cw/2,C.padT,C.cw,C.volB-C.padT);ctx.globalAlpha=1;ctx.restore();
  // HTML 툴팁
  var tip=document.querySelector('#chartTip'); if(!tip) return;
  var r=C.r, isUS=r.ccy==='USD', fmt=function(v){return isUS?('$'+(+v).toLocaleString('en-US',{maximumFractionDigits:2})):Math.round(v).toLocaleString('en-US');};
  var dt=d[5]?new Date(d[5]):null;
  var dlabel=dt?((C.tf==='1'||C.tf==='5')?((dt.getMonth()+1)+'/'+dt.getDate()+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0')):(dt.getFullYear()+'.'+(dt.getMonth()+1)+'.'+dt.getDate())):'';
  var chg=idx>0?((d[3]-C.data[idx-1][3])/C.data[idx-1][3]*100):0;
  var vfmt=function(v){ v=+v||0; if(v>=1e8)return (v/1e8).toFixed(1)+'억'; if(v>=1e4)return Math.round(v/1e4)+'만'; return Math.round(v).toLocaleString('en-US'); };
  tip.innerHTML='<div style="font-weight:800;margin-bottom:3px;color:var(--ink)">'+dlabel+'</div>'
    +'<div class="tr"><span>시</span><b>'+fmt(d[0])+'</b></div>'
    +'<div class="tr"><span>고</span><b class="up">'+fmt(d[1])+'</b></div>'
    +'<div class="tr"><span>저</span><b class="down">'+fmt(d[2])+'</b></div>'
    +'<div class="tr"><span>종</span><b class="'+cls(chg)+'">'+fmt(d[3])+' ('+(chg>=0?'+':'')+chg.toFixed(2)+'%)</b></div>'
    +'<div class="tr"><span>량</span><b>'+vfmt(d[4])+'</b></div>'
    +C.MA.map(function(m,mi){return '<div class="tr"><span style="color:'+m[1]+'">MA'+m[0]+'</span><b style="color:'+m[1]+'">'+fmt(C.emas[mi][idx])+'</b></div>';}).join('');
  tip.style.display='block';
  // 위치: 크로스헤어 반대편
  var rect=C.cv.getBoundingClientRect(), dispX=x/(C.cv.width/rect.width);
  var left=dispX>rect.width/2 ? 8 : (rect.width-8-150);
  tip.style.left=Math.max(4,left)+'px'; tip.style.top='6px';
}
function hideCrosshair(){ var tip=document.querySelector('#chartTip'); if(tip)tip.style.display='none'; if(CHART)drawStockChart(CHART.cv,CHART.r); }
function attachChartCrosshair(cv){
  if(!cv||cv._chAttached) return; cv._chAttached=true;
  cv.addEventListener('mousemove',function(e){ var i=crosshairIdx(e.clientX); if(i>=0)drawCrosshair(i); });
  cv.addEventListener('mouseleave',hideCrosshair);
  cv.addEventListener('click',function(e){ var i=crosshairIdx(e.clientX); if(i>=0)showCandleDetail(i); });
  cv.style.cursor='pointer';
  cv.addEventListener('touchstart',function(e){ if(e.touches[0]){var i=crosshairIdx(e.touches[0].clientX); if(i>=0){drawCrosshair(i);} } },{passive:true});
  cv.addEventListener('touchmove',function(e){ if(e.touches[0]){var i=crosshairIdx(e.touches[0].clientX); if(i>=0){drawCrosshair(i); e.preventDefault();} } },{passive:false});
  cv.addEventListener('touchend',hideCrosshair);
}
/* 캔들 클릭 → 그 봉의 속(몸통·꼬리) 구조 + 해석. 최근 봉이면 5분봉 전환 버튼. */
function bigCandleSVG(o,h,l,c,ccy){
  var W=120,H=240,pad=20,cx=60,bw=44, rng=(h-l)||1;
  function y(v){ return pad+(h-v)/rng*(H-2*pad); }
  var up=c>=o, col=up?'var(--up)':'var(--down)';
  var bt=y(Math.max(o,c)), bb=y(Math.min(o,c));
  return '<svg width="120" height="240" viewBox="0 0 '+W+' '+H+'">'
    +'<line x1="'+cx+'" y1="'+y(h)+'" x2="'+cx+'" y2="'+y(l)+'" stroke="'+col+'" stroke-width="4" stroke-linecap="round"/>'
    +'<rect x="'+(cx-bw/2)+'" y="'+bt+'" width="'+bw+'" height="'+Math.max(bb-bt,3)+'" rx="4" fill="'+col+'"/>'
    +'<line x1="'+(cx+bw/2+6)+'" y1="'+y(o)+'" x2="112" y2="'+y(o)+'" stroke="var(--sub)" stroke-width="1" stroke-dasharray="3 2"/><text x="114" y="'+(y(o)+3)+'" font-size="9" fill="var(--sub)">시</text>'
    +'<line x1="'+(cx+bw/2+6)+'" y1="'+y(c)+'" x2="112" y2="'+y(c)+'" stroke="'+col+'" stroke-width="1" stroke-dasharray="3 2"/><text x="114" y="'+(y(c)+3)+'" font-size="9" fill="'+col+'">종</text>'
    +'<text x="'+cx+'" y="14" text-anchor="middle" font-size="9" fill="var(--sub)">고 '+fmtP(h,ccy)+'</text>'
    +'<text x="'+cx+'" y="236" text-anchor="middle" font-size="9" fill="var(--sub)">저 '+fmtP(l,ccy)+'</text></svg>';
}
function fmtP(v,ccy){ return ccy==='USD'?('$'+(+v).toLocaleString('en-US',{maximumFractionDigits:2})):Math.round(v).toLocaleString('en-US'); }
function showCandleDetail(idx){
  if(!CHART||!CHART.data[idx]) return; var d=CHART.data[idx], r=CHART.r, ccy=r.ccy;
  var o=d[0],h=d[1],l=d[2],c=d[3],v=d[4],ms=d[5];
  var rng=(h-l)||1, body=Math.abs(c-o), up=c>=o;
  var uw=h-Math.max(o,c), lw=Math.min(o,c)-l;
  var chg=idx>0?((c-CHART.data[idx-1][3])/CHART.data[idx-1][3]*100):0;
  var notes=[];
  if(body/rng>=0.7) notes.push(['📏', (up?'장대양봉':'장대음봉')+' — 몸통이 길어 '+(up?'매수':'매도')+'세가 강했던 봉']);
  else if(body/rng<0.15) notes.push(['⚖️','도지형 — 시가·종가가 붙어 매수·매도 힘이 팽팽했던 봉']);
  if(uw>body*1.2&&uw>lw) notes.push(['🔺','윗꼬리 김 — 위로 올렸다 밀렸다(고점 매도 압력)']);
  if(lw>body*1.2&&lw>uw) notes.push(['🔻','아랫꼬리 김 — 아래로 눌렀다 되산다(저점 매수 지지)']);
  notes.push([up?'📈':'📉', up?'양봉 — 종가가 시가보다 위(그 기간 순매수 우위)':'음봉 — 종가가 시가보다 아래(순매도 우위)']);
  var dt=ms?new Date(ms):null;
  var dlabel=dt?((CHART.tf==='1'||CHART.tf==='5')?(dt.getFullYear()+'.'+(dt.getMonth()+1)+'.'+dt.getDate()+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0')):(dt.getFullYear()+'.'+(dt.getMonth()+1)+'.'+dt.getDate())):'';
  var recent=(CHART.data.length-1-idx)<=1 && (CHART.tf==='D'); // 최근 일봉만 분봉 드릴 지원
  var bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML='<div class="modal" style="max-width:380px"><h3>🕯 캔들 속 보기</h3><div class="msub">'+dlabel+' · '+tfLabel(CHART.tf)+'</div>'
    +'<div style="display:flex;gap:16px;padding:6px 20px 12px">'
    +'<div style="flex:0 0 auto">'+bigCandleSVG(o,h,l,c,ccy)+'</div>'
    +'<div style="flex:1;font-size:12.5px;line-height:1.9;align-self:center">'
      +'<div style="display:flex;justify-content:space-between"><span style="color:var(--sub)">시가</span><b>'+fmtP(o,ccy)+'</b></div>'
      +'<div style="display:flex;justify-content:space-between"><span style="color:var(--sub)">고가</span><b class="up">'+fmtP(h,ccy)+'</b></div>'
      +'<div style="display:flex;justify-content:space-between"><span style="color:var(--sub)">저가</span><b class="down">'+fmtP(l,ccy)+'</b></div>'
      +'<div style="display:flex;justify-content:space-between"><span style="color:var(--sub)">종가</span><b class="'+cls(chg)+'">'+fmtP(c,ccy)+' ('+(chg>=0?'+':'')+chg.toFixed(2)+'%)</b></div>'
      +'<div style="display:flex;justify-content:space-between"><span style="color:var(--sub)">거래량</span><b>'+(+v).toLocaleString('en-US')+'</b></div>'
    +'</div></div>'
    +'<div style="padding:0 20px 8px">'+notes.map(function(n){return '<div style="display:flex;gap:8px;padding:6px 0;border-top:1px solid var(--line2);font-size:12.5px"><span>'+n[0]+'</span><span style="color:var(--sub);line-height:1.5">'+n[1]+'</span></div>';}).join('')+'</div>'
    +'<div style="padding:2px 20px 10px;font-size:11px;color:var(--faint)">💡 하나의 봉은 그 기간 내내 위·아래로 오간 <b>줄다리기의 결과</b>예요. 몸통=최종 승부, 꼬리=밀렸다 돌아온 흔적. 속을 실제 캔들로 보려면 봉 단위를 낮춰보세요(1분·5분).</div>'
    +'<div class="mfoot">'+(recent?'<button class="mbtn" id="cdMin">📉 5분봉으로 속 보기</button>':'')+'<button class="mbtn pri" id="cdClose">닫기</button></div></div>';
  document.body.appendChild(bg);
  function close(){ bg.remove(); }
  bg.addEventListener('click',function(e){ if(e.target===bg)close(); });
  $('#cdClose',bg).onclick=close;
  var mn=$('#cdMin',bg); if(mn) mn.onclick=function(){ close(); var b=$$('#tfBar button').find(function(x){return x.dataset.tf==='5';}); if(b){$$('#tfBar button').forEach(function(x){x.classList.toggle('on',x===b);}); loadChartTF(r,'5');} };
}
/* ── 상세 화면 라이브 자동 갱신 (열어둔 동안 15초마다 가격·매수/매도세·투자자 갱신) ── */
var _detailTimer=null, _LIVE_MS=7000;
function stopDetailLive(){ if(_detailTimer){clearInterval(_detailTimer);_detailTimer=null;} }
function startDetailLive(r){
  stopDetailLive(); if(!PROXY) return;
  _detailTimer=setInterval(function(){
    if(!SEL||SEL.c!==r.c||!$('#v-stock')||!$('#v-stock').classList.contains('on')){ stopDetailLive(); return; }
    liveRefresh(r);
  },_LIVE_MS);
}
function liveRefresh(r){
  var isUS=r.ccy==='USD';
  var base='mkt='+(isUS?'US':'KR')+'&code='+encodeURIComponent(r.c)+(isUS?'&exch='+usExch(r.mk):'');
  // 가격·현재 봉 (툴팁 보는 중엔 차트 재렌더 스킵 → 크로스헤어 유지)
  proxyJson('/candles?'+base+'&tf='+_chartTF+'&limit=120').then(function(j){
    if(!SEL||SEL.c!==r.c||!j||!j.candles||j.candles.length<2) return;
    r._candles=j.candles; var n=j.candles.length, px=+j.candles[n-1][4], prev=+j.candles[n-2][4];
    if(px>0){ r.px=px; if(prev>0) r.ch=(px-prev)/prev*100; }
    var tip=$('#chartTip'); if(!tip||tip.style.display!=='block') drawStockChart($('#sChart'),r);
    var pe=$('#stkPx'); if(pe){ pe.className=cls(r.ch); pe.innerHTML=priceFmt(r,r.px)+' <span style="font-size:16px">'+arw(r.ch)+' '+pctTxt(r.ch)+'</span>'; }
    [$('#liveDot'),$('#liveDotChart')].forEach(function(lv){ if(lv) lv.style.opacity=lv.style.opacity==='0.35'?'1':'0.35'; }); // 깜빡여 갱신 표시
  });
  if(!isUS) proxyJson('/flow?'+base).then(function(j){
    if(!SEL||SEL.c!==r.c||!j) return;
    r._flow={strength:hasNum(j.strength)?j.strength:r.strength, bp:hasNum(j.bp)?j.bp:r.bidRatio,
             foreign:j.foreign,inst:j.inst,retail:j.retail,approx:j.strengthApprox,investDate:j.investDate};
    renderPressureFlow(r); renderWhy(r);
  });
}
/* 차트 아래 매수/매도세 + 투자자 순매수(개인·기관·외국인) 패널 */
function renderPressureFlow(r){
  var el=$('#pressureFlow'); if(!el) return;
  var isUS=r.ccy==='USD';
  if(isUS){ el.innerHTML='<div style="font-size:11px;color:var(--faint);padding:12px 0;border-top:1px solid var(--line);margin-top:10px">미국 종목은 체결강도·투자자별 매매가 제공되지 않습니다 (호가·차트·시세는 실데이터).</div>'; return; }
  var f=r._flow||{strength:r.strength,bp:r.bidRatio}; // /flow 도착 전엔 RADAR 값으로
  var parts=[];
  var hasStr=hasNum(f.strength), hasBp=hasNum(f.bp);
  if(hasStr||hasBp){
    parts.push('<div style="font-size:12px;font-weight:800;margin:12px 0 4px;display:flex;align-items:center;gap:6px">⚡ 매수/매도세'
      +(PROXY?'<span id="liveDot" style="width:7px;height:7px;border-radius:50%;background:#16b364;opacity:1;transition:opacity .4s;box-shadow:0 0 5px #16b364"></span><span style="font-size:10px;color:var(--faint);font-weight:600">LIVE · 7초 갱신</span>':'')+'</div>');
    if(hasStr){ var st=f.strength, buyPct=Math.max(6,Math.min(94,Math.round(st/(st+100)*100)));
      parts.push('<div class="pfrow"><span style="width:60px;font-size:11px;color:var(--sub);font-weight:700">체결강도</span>'
        +'<div class="pfbar"><div style="width:'+buyPct+'%;background:var(--up)"></div><div style="flex:1;background:var(--down)"></div></div>'
        +'<span style="width:72px;text-align:right;font-weight:800;font-size:12px" class="'+(st>=100?'up':'down')+'">'+Math.round(st)+(f.approx?'*':'')+'</span></div>'); }
    if(hasBp){ parts.push('<div class="pfrow"><span style="width:60px;font-size:11px;color:var(--sub);font-weight:700">호가압력</span>'
        +'<div class="pfbar"><div style="width:'+f.bp+'%;background:var(--up)"></div><div style="flex:1;background:var(--down)"></div></div>'
        +'<span style="width:72px;text-align:right;font-weight:800;font-size:12px" class="'+(f.bp>=50?'up':'down')+'">매수 '+f.bp+'%</span></div>'); }
  }
  var inv=[['개인',f.retail],['외국인',f.foreign],['기관',f.inst]].filter(function(x){return hasNum(x[1]);});
  if(inv.length){
    var mx=Math.max.apply(null,inv.map(function(x){return Math.abs(x[1]);}))||1;
    var idt=f.investDate&&/^\d{8}$/.test(f.investDate)?(f.investDate.slice(4,6)+'/'+f.investDate.slice(6,8)+' 기준'):'당일 누적';
    parts.push('<div style="font-size:12px;font-weight:800;margin:14px 0 5px">🏦 투자자 순매수 <span style="color:var(--faint);font-weight:600">('+idt+'·주)</span></div>');
    inv.forEach(function(x){ var v=x[1], w=Math.round(Math.abs(v)/mx*49), pos=v>=0;
      parts.push('<div class="invbar"><span class="lbl">'+x[0]+'</span>'
        +'<div class="track"><div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:var(--line)"></div>'
        +'<div class="fill" style="'+(pos?('left:50%;width:'+w+'%;background:var(--up)'):('right:50%;width:'+w+'%;background:var(--down)'))+'"></div></div>'
        +'<span style="width:96px;text-align:right;font-weight:700;font-size:12px" class="'+cls(v)+'">'+(v>=0?'+':'')+v.toLocaleString('en-US')+'</span></div>'); });
  }
  if(!parts.length){ el.innerHTML=PROXY?'<div style="font-size:11px;color:var(--faint);padding:10px 0">수급 데이터 불러오는 중…</div>':''; return; }
  el.innerHTML='<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:2px">'+parts.join('')+'</div>';
}
function scoredOf(code,opt){
  var r=RADAR.find(function(x){return x.c===code;}); if(r)return r;
  var s=(typeof ALLSTK!=='undefined'?ALLSTK:STK).find(function(x){return x.c===code;});
  if(s){ var sc=aureumScore(s); return Object.assign({},s,{score:sc.total,g:sc.groups,reasons:sc.reasons,grade:sc.grade,rank:'-',dRank:0}); }
  // 데모·RADAR에 없는 종목(티커 검색) → 스텁 생성. 실데이터는 enrichStock이 채운다.
  var isKR=/^\d{6}$/.test(code); opt=opt||{};
  return { c:code, n:opt.n||code, mk:opt.mk||(isKR?'KOSPI':'NASDAQ'), ccy:isKR?'KRW':'USD',
    px:0, ch:0, score:0, g:{trade:0,price:0,press:0,flow:0,trend:0}, gmax:{trade:35,price:30,press:25,flow:5,trend:5},
    reasons:[], grade:['조회 중','steady'], rank:'-', dRank:0,
    valPct:null,valInc:null,accel:null,rvol:null,openPct:null,highGap:null,momPct:null,
    strength:null,bidRatio:null,progPct:null,invest:null,breakout:null,cooling:false };
}
function priceFmt(r,v){ if(v==null)v=r.px; return r.ccy==='USD'?('$'+(+v).toLocaleString('en-US',{maximumFractionDigits:2})):won(v); }
function backToBrowse(){ stopDetailLive(); var _is=$('#idxstrip'); if(_is)_is.style.display=''; var _db=$('#demoban'); if(_db&&!useReal)_db.style.display=''; renderStockBrowse(); window.scrollTo(0,_stkScroll); }
window.backToBrowse=backToBrowse;
/* ═══════════ 종목 상세 실데이터 보강 (/candles·/info·/flow·/orderbook) ═══════════
   스펙 §0-1(기존 기능 보존): 프록시 미연결·조회 실패 시 데모 화면을 그대로 두고,
   응답이 도착한 항목만 제자리에서 교체한다. 종목을 바꾸면 이전 응답은 버린다. */
let _enrichSeq=0, _realParts={};
var _chartTF='D';
var _fibOn=false; try{ _fibOn=localStorage.getItem('aurFib')==='1'; }catch(e){}
function toggleFib(){ _fibOn=!_fibOn; try{localStorage.setItem('aurFib',_fibOn?'1':'0');}catch(e){}
  var b=$('#fibBtn'); if(b)b.classList.toggle('on',_fibOn);
  if(CHART)drawStockChart(CHART.cv,CHART.r); }
function tfLabel(tf){ return {'1':'1분봉','5':'5분봉','D':'일봉','W':'주봉','M':'월봉'}[tf]||tf; }
/* 봉 전환 — /candles를 해당 tf로 재조회 후 다시 그림. 분봉은 KIS 특성상 장중 위주 */
async function loadChartTF(r,tf){
  _chartTF=tf; var cap=$('#chartCap');
  if(cap) cap.textContent=tfLabel(tf)+' 불러오는 중…';
  if(!PROXY){ if(cap)cap.textContent=tfLabel(tf)+'(데모)'; drawStockChart($('#sChart'),r); return; }
  var isUS=r.ccy==='USD';
  var base='mkt='+(isUS?'US':'KR')+'&code='+encodeURIComponent(r.c)+(isUS?'&exch='+usExch(r.mk):'');
  var j=await proxyJson('/candles?'+base+'&tf='+tf+'&limit=120');
  if(_chartTF!==tf) return; // 그 사이 다른 봉을 눌렀으면 폐기
  if(j&&Array.isArray(j.candles)&&j.candles.length>1){
    r._candles=j.candles;
    drawStockChart($('#sChart'),r);
    if(cap) cap.textContent=tfLabel(tf)+' '+j.candles.length+'봉 (실시간) · MA5·20·60 · 하단 거래량';
  }else{
    if(cap) cap.textContent=tfLabel(tf)+' 데이터가 없습니다'+((tf==='1'||tf==='5')?' (분봉은 장중 위주라 주말·장외엔 비어있을 수 있음)':'');
  }
}
async function proxyJson(path){
  if(!PROXY) return null;
  try{ var res=await fetch(PROXY+path); if(!res.ok) return null; var j=await res.json(); return (j&&j.error)?null:j; }
  catch(e){ return null; }
}
function usExch(mk){ return mk==='NYSE'?'NYS':mk==='AMEX'?'AMS':'NAS'; }
function setMet(id,v,s,c){
  var el=$('#'+id); if(!el) return;
  var vv=el.querySelector('.v'), ss=el.querySelector('.s');
  if(vv){ vv.textContent=v; vv.className='v '+(c||''); }
  if(ss) ss.textContent=s||'';
}
function addMet(id,k,v,s,c){
  var g=$('#metGrid'); if(!g||$('#'+id)) return;
  var d=document.createElement('div'); d.className='met'; d.id=id;
  d.innerHTML='<div class="k">'+k+'</div><div class="v '+(c||'')+'">'+v+'</div><div class="s">'+(s||'')+'</div>';
  g.appendChild(d);
}
function markReal(part){
  _realParts[part]=true;
  var d=$('#stkDisc'); if(!d) return;
  var nm={chart:'차트',info:'시총·거래량·재무',flow:'투자자 수급·체결강도',book:'호가'};
  var on=Object.keys(_realParts).map(function(k){return nm[k];}).filter(Boolean);
  d.innerHTML='✅ 실시간 데이터 — '+on.join(' · ')+'. 그 외 항목(프로그램 매매 등)은 아직 데모 값입니다.';
}
/* 투자자별 순매수 — 토스는 당일 누적 "수량(주)"을 준다(금액 아님) */
function flowTabReal(j){
  var rows=[['개인',j.retail],['외국인',j.foreign],['기관',j.inst]].filter(function(x){return x[1]!=null;});
  if(!rows.length) return null;
  return '<div style="font-size:12px;font-weight:800;margin:12px 0 8px">투자자별 순매수 <span style="color:var(--faint);font-weight:600">(당일 누적·주)</span></div>'
    +'<table><thead><tr><th class="l">구분</th><th>순매수 수량</th><th>방향</th></tr></thead><tbody>'
    +rows.map(function(x){ var v=+x[1];
      return '<tr><td class="l" style="font-weight:700">'+x[0]+'</td>'
        +'<td class="'+cls(v)+'" style="font-weight:700">'+(v>=0?'+':'')+v.toLocaleString('en-US')+'</td>'
        +'<td class="'+cls(v)+'" style="font-weight:700">'+(v>0?'순매수':v<0?'순매도':'－')+'</td></tr>'; }).join('')
    +'</tbody></table>'
    +'<div style="font-size:11px;color:var(--faint);margin-top:6px">실시간 데이터 · 금액이 아닌 수량 기준입니다.</div>';
}
/* 호가 10단 — 잔량 막대 + 매수/매도 총잔량 비율 */
function bookHtml(ob,r){
  if(!ob||!ob.asks||!ob.asks.length||!ob.bids||!ob.bids.length) return null;
  var asks=ob.asks.slice(0,10), bids=ob.bids.slice(0,10);
  var mx=Math.max.apply(null,asks.concat(bids).map(function(x){return x[1];}))||1;
  var tot=(+ob.totalBid||0)+(+ob.totalAsk||0);
  var bp=tot>0?Math.round((+ob.totalBid||0)/tot*100):50;
  function row(x,side){
    var w=Math.max(2,Math.round(x[1]/mx*100)), col=side==='a'?'var(--down)':'var(--up)';
    return '<div style="display:flex;align-items:center;gap:8px;height:24px">'
      +'<div style="flex:1;position:relative;height:17px">'
        +'<div style="position:absolute;right:0;top:0;height:100%;width:'+w+'%;background:'+col+';opacity:.16;border-radius:3px"></div>'
        +'<span style="position:absolute;right:6px;top:0;line-height:17px;font-size:11px;color:var(--sub)">'+(+x[1]).toLocaleString('en-US')+'</span></div>'
      +'<span class="'+(side==='a'?'down':'up')+'" style="width:96px;text-align:right;font-weight:700;font-size:12px">'+priceFmt(r,x[0])+'</span></div>';
  }
  return '<div style="font-size:12px;font-weight:800;margin:12px 0 8px">호가 10단 <span style="color:var(--faint);font-weight:600">(잔량)</span></div>'
    +asks.slice().reverse().map(function(x){return row(x,'a');}).join('')
    +'<div style="display:flex;align-items:center;gap:8px;margin:6px 0;padding:6px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">'
      +'<div style="flex:1;height:8px;border-radius:4px;overflow:hidden;display:flex">'
        +'<div style="width:'+bp+'%;background:var(--up)"></div><div style="flex:1;background:var(--down)"></div></div>'
      +'<span style="font-size:11px;font-weight:800;white-space:nowrap">매수 '+bp+'% · 매도 '+(100-bp)+'%</span></div>'
    +bids.map(function(x){return row(x,'b');}).join('')
    +'<div style="font-size:11px;color:var(--faint);margin-top:8px">실시간 데이터 · 총잔량 매수 '+(+ob.totalBid||0).toLocaleString('en-US')+' / 매도 '+(+ob.totalAsk||0).toLocaleString('en-US')+'</div>';
}
async function enrichStock(r){
  if(!PROXY) return;
  var seq=++_enrichSeq; _realParts={};
  var isUS=r.ccy==='USD';
  var base='mkt='+(isUS?'US':'KR')+'&code='+encodeURIComponent(r.c)+(isUS?'&exch='+usExch(r.mk):'');
  var live=function(){ return seq===_enrichSeq; };

  /* 1) 캔들 → 실제 차트 + 헤드라인 시세(마지막 종가·전일대비) */
  proxyJson('/candles?'+base+'&tf=D&limit=120').then(function(j){
    if(!live()||!j||!Array.isArray(j.candles)||j.candles.length<2) return;
    r._candles=j.candles;
    var n=j.candles.length, px=+j.candles[n-1][4], prev=+j.candles[n-2][4];
    if(px>0){ r.px=px; if(prev>0) r.ch=(px-prev)/prev*100; }
    drawStockChart($('#sChart'),r);
    var cap=$('#chartCap'); if(cap) cap.textContent='일봉 '+n+'봉 (실시간 데이터) · 이평 MA5·20·60 · 하단 거래량 · 빨강 상승/파랑 하락';
    var pe=$('#stkPx');
    if(pe){ pe.className=cls(r.ch); pe.innerHTML=priceFmt(r,r.px)+' <span style="font-size:16px">'+arw(r.ch)+' '+pctTxt(r.ch)+'</span>'; }
    markReal('chart');
  });

  /* 2) 종목정보 → 시총·거래량·PER/PBR·52주 위치 */
  proxyJson('/info?'+base).then(function(j){
    if(!live()||!j) return;
    var got=false;
    if(j.mcap!=null&&j.mcap>0){ setMet('m-mcap', j.mcapUnit==='억원'?fmtEok(j.mcap):('$'+fmtBig(j.mcap)), r.mk+' 상장', null); got=true; }
    if(j.vol!=null&&j.vol>0){ setMet('m-value', (+j.vol).toLocaleString('en-US')+'주', '당일 누적 거래량', null); got=true; }
    if(j.per!=null&&j.per>0){ addMet('m-per','PER',(+j.per).toFixed(2),(j.pbr!=null&&j.pbr>0)?('PBR '+(+j.pbr).toFixed(2)):'',null); got=true; }
    if(j.h52!=null&&j.l52!=null&&j.h52>j.l52){
      var pos=Math.max(0,Math.min(100,Math.round((r.px-j.l52)/(j.h52-j.l52)*100)));
      // 토스는 52주 고저를 직접 주지 않아 프록시가 일봉 200개(≈10개월)에서 산출한다
      addMet('m-52w',(j.h52Approx?'52주 위치*':'52주 위치'),pos+'%',
        (j.h52Approx?'≈10개월 · ':'')+priceFmt(r,j.l52)+' ~ '+priceFmt(r,j.h52),pos>=70?'up':pos<=30?'down':''); got=true;
    }
    if(got) markReal('info');
  });

  /* 3) 수급 → 체결강도·호가 매수비율·투자자 순매수·프로그램매매
        투자자별 매매·프로그램매매는 토스가 국내 종목만 제공한다(호가·캔들은 미국도 제공). */
  if(isUS){
    var fl=$('#stab-flow');
    if(fl) fl.innerHTML='<div style="font-size:12px;color:var(--faint);padding:18px 0">'
      +'미국 종목은 투자자별 매매·프로그램매매 데이터가 제공되지 않습니다. 차트·시세·호가는 실데이터입니다.</div>';
  }
  else proxyJson('/flow?'+base).then(function(j){
    if(!live()||!j) return;
    var got=false;
    if(hasNum(j.strength)){
      // 토스는 체결강도를 직접 주지 않아 프록시가 틱룰로 근사한다 → 근사임을 표기
      setMet('m-str',Math.round(j.strength)+(j.strengthApprox?'*':''),
        (j.strengthApprox?'근사· ':'')+(j.strength>=100?'매수 우위':'매도 우위'), j.strength>=100?'up':'down'); got=true;
    }
    if(hasNum(j.bp)){ setMet('m-bid',(j.bp>=55?'+':'')+j.bp+'%',j.bp>=55?'매수 우위':'균형',j.bp>=55?'up':''); got=true; }
    if(hasNum(j.progNet)){
      setMet('m-prog',(j.progNet>=0?'+':'')+(+j.progNet).toLocaleString('en-US'),
        '프로그램 순매수(주)'+(j.progDate?' · '+j.progDate:''), cls(j.progNet)); got=true;
    }
    if(hasNum(j.foreign)&&hasNum(j.inst)){
      var both=j.foreign>0&&j.inst>0, sell=j.foreign<0&&j.inst<0;
      setMet('m-inv', both?'동반매수':sell?'동반매도':'혼조', both?'수급 양호':'', both?'up':sell?'down':''); got=true;
    }
    var ft=flowTabReal(j);
    if(ft){ var el=$('#stab-flow'); if(el) el.innerHTML=ft; got=true; }
    if(got) markReal('flow');
    // /flow가 체결강도·호가를 안 줄 때(장외 등) RADAR가 이미 가진 값을 유지
    r._flow={strength:hasNum(j.strength)?j.strength:r.strength, bp:hasNum(j.bp)?j.bp:r.bidRatio,
             foreign:j.foreign,inst:j.inst,retail:j.retail,approx:j.strengthApprox,investDate:j.investDate};
    renderPressureFlow(r); renderWhy(r);
  });

  /* 4) 호가 10단 */
  proxyJson('/orderbook?'+base).then(function(j){
    if(!live()) return;
    var el=$('#stab-book'); if(!el) return;
    var h=bookHtml(j,r);
    if(h){ el.innerHTML=h; markReal('book'); return; }
    // 원인 구분: 응답 자체가 없음(프록시 미설정·오류) vs 응답은 왔는데 호가가 빔(장 시간 외)
    el.innerHTML='<div style="font-size:12px;color:var(--faint);padding:18px 0">'
      +(j?'호가가 비어 있습니다 — 장 시간(평일 09:00~15:30) 외이거나 미제공 종목입니다.'
         :'호가를 불러오지 못했습니다 — 시세 프록시가 응답하지 않습니다(키 미등록이거나 일시 오류).')+'</div>';
  });
}
/* 종목명 핵심어 추출 — 접미사 제거해 뉴스 매칭률 ↑ (삼성전자→삼성) */
function newsCore(name){
  return String(name||'').replace(/(우B?$|스팩\d*.*$|\d+호$|홀딩스$|그룹$|지주$)/,'')
    .replace(/(전자|증권|화학|제약|바이오로직스|바이오|에너지솔루션|중공업|건설|생명|카드|금융|은행|해상|산업|엔지니어링|디스플레이|반도체|모비스|오션|에어로스페이스)$/,'').trim();
}
function relatedNews(name){
  var news=_lastNews||[], core=newsCore(name), rel=[];
  news.forEach(function(x){ var t=x.title||'';
    if(t.indexOf(name)>-1) rel.push({n:x,s:2});
    else if(core.length>=2 && t.indexOf(core)>-1) rel.push({n:x,s:1}); });
  rel.sort(function(a,b){return b.s-a.s || b.n.t-a.n.t;});
  return rel.map(function(x){return x.n;});
}
/* 규칙 기반 "왜 움직였나" — 등락·거래관심·수급·뉴스 감성 합성 */
function whyMoved(r){
  if(!hasNum(r.ch)) return '';
  var ch=r.ch, dir=ch>=0?'상승':'하락', mag=Math.abs(ch);
  var strength=mag>=5?'큰 폭으로 ':mag>=2?'뚜렷하게 ':'';
  var parts=['<b>'+r.n+'</b>는 오늘 <b class="'+cls(ch)+'">'+pctTxt(ch)+'</b> '+strength+dir+'했어요.'];
  var rk=(KBOARD||[]).find(function(x){return x.c===r.c;});
  if(rk&&rk.rank<=15) parts.push('거래대금 상위 <b>'+rk.rank+'위</b>로 관심이 집중된 가운데,');
  var f=r._flow||{};
  if(hasNum(f.foreign)&&hasNum(f.inst)){
    if(f.foreign>0&&f.inst>0) parts.push('외국인·기관이 <b class="up">동반 순매수</b>했습니다.');
    else if(f.foreign<0&&f.inst<0) parts.push('외국인·기관이 <b class="down">동반 순매도</b>했습니다.');
    else parts.push('외국인·기관 수급은 혼조였습니다.');
  }
  if(hasNum(f.strength)) parts.push('체결강도 '+Math.round(f.strength)+(f.strength>=100?'(매수 우위)':'(매도 우위)')+'.');
  var rel=relatedNews(r.n).slice(0,8), pos=0,neg=0;
  rel.forEach(function(x){var s=sentiment(x.title); if(s==='pos')pos++;else if(s==='neg')neg++;});
  if(pos||neg) parts.push('관련 뉴스엔 '+(pos>neg?'<b class="up">긍정</b>':pos<neg?'<b class="down">부정</b>':'긍·부정 혼재')+' 신호가 보입니다'+((pos?' +'+pos:'')+(neg?' −'+neg:''))+'.');
  return parts.join(' ');
}
function renderWhy(r){ var el=$('#whyBox'); if(el) el.innerHTML=whyMoved(r)||'등락 데이터를 불러오는 중…'; }
function openStock(code){
  var r=scoredOf(code); SEL=r; _stkScroll=window.scrollY; _chartTF='D'; showView('stock',true);
  var el=$('#stockPanel'); if(!el)return;
  var isUS=r.ccy==='USD';
  var subs=stockSubs(r), grd=gradeTxt(r.score);
  var mcap, value, mcapT, valueT;
  if(isUS){ mcap=r.px*(r.c==='NVDA'?4.75e9:r.c==='AAPL'?1.5e10:2.2e9); value=r.px*r.rvol*3e7; mcapT='$'+fmtBig(mcap); valueT='$'+fmtBig(value); }
  else { mcap=Math.round(r.px*(r.c==='005930'?5.97e9:r.c==='000660'?7.28e8:2.2e8)/1e8); value=Math.round(r.px*r.rvol*1.2e6/1e8); mcapT=fmtEok(mcap); valueT=fmtEok(value); }
  // rvol 이 없으면 거래대금 추정치를 만들지 않는다 → '—' 로 두고 /info 실값이 오면 채운다
  if(!hasNum(r.rvol)) valueT='—';
  function met(k,v,s,c,id){ return '<div class="met"'+(id?' id="'+id+'"':'')+'><div class="k">'+k+'</div><div class="v '+(c||'')+'">'+v+'</div><div class="s">'+(s||'')+'</div></div>'; }
  var peers=RADAR.filter(function(x){return x.c!==r.c&&x.mk===r.mk;}).slice(0,4);
  var relHit=relatedNews(r.n); var relNews=relHit.slice(0,5); var relCount=relHit.length;
  if(relNews.length<3){ var seen={}; relNews.forEach(function(x){seen[x.title]=1;}); (_lastNews||[]).forEach(function(x){if(relNews.length<5&&!seen[x.title])relNews.push(x);}); }
  var gaugeDeg=r.score*3.6;
  el.innerHTML=
    '<button class="more" onclick="backToBrowse()" style="background:none;border:none;font-family:inherit;margin-bottom:10px;padding:0;cursor:pointer">◀ 종목 목록</button>'
    +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-size:24px;font-weight:800">'+r.n+'</span>'
      +'<span class="starbtn'+(watchHas(r.c)?' on':'')+'" data-c="'+r.c+'" title="관심종목" style="font-size:22px" onclick="watchToggle(\''+r.c+'\')">'+(watchHas(r.c)?'★':'☆')+'</span>'
      +'<span style="color:var(--faint);font-size:13px">'+r.c+' · '+r.mk+'</span>'
      +'<span style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--faint);font-weight:700">RADAR SCORE <span class="scorepill">'+r.score+'</span></span></div>'
    +'<div id="stkPx" style="font-size:30px;font-weight:800;margin-top:4px" class="'+cls(r.ch)+'">'+priceFmt(r,r.px)+' <span style="font-size:16px">'+arw(r.ch)+' '+pctTxt(r.ch)+'</span></div>'
    +'<div class="metrics" id="metGrid">'
      +met('거래대금',valueT,'상위권',null,'m-value')
      +met('시가총액',mcapT,r.mk+' 상위',null,'m-mcap')
      +met('체결강도',numOrDash(r.strength,function(v){return Math.round(v);}),hasNum(r.strength)?(r.strength>=100?'매수 우위':'매도 우위'):'데이터 없음',hasNum(r.strength)?(r.strength>=100?'up':'down'):'','m-str')
      +met('호가 압력',numOrDash(r.bidRatio,function(v){return (v>=55?'+':'')+Math.round(v)+'%';}),hasNum(r.bidRatio)?(r.bidRatio>=55?'매수 우위':'균형'):'데이터 없음',hasNum(r.bidRatio)&&r.bidRatio>=55?'up':'','m-bid')
      +met('프로그램',numOrDash(r.progPct,function(v){return (v>=0?'+':'')+v.toFixed(1)+'%';}),hasNum(r.progPct)?'거래대금 대비':'데이터 없음',hasNum(r.progPct)?cls(r.progPct):'','m-prog')
      +met('외국인·기관',r.invest==null?'—':r.invest==='both'?'동반매수':r.invest==='sell'?'동반매도':'혼조',r.invest==null?'데이터 없음':(r.invest==='both'?'수급 양호':''),r.invest==='both'?'up':r.invest==='sell'?'down':'','m-inv')
    +'</div>'
    +'<div class="sgrid">'
      +'<div>'
        +'<div class="stabs"><button class="on" data-t="chart">차트</button><button data-t="flow">투자자 수급</button><button data-t="book">호가</button><button data-t="score">점수 구성</button></div>'
        +'<div id="stab-chart">'
          +'<div style="display:flex;align-items:center">'
            +'<div class="tfbar" id="tfBar">'
              +['1|1분','5|5분','D|일','W|주','M|월'].map(function(t){var p=t.split('|');return '<button data-tf="'+p[0]+'"'+(p[0]===_chartTF?' class="on"':'')+'>'+p[1]+'</button>';}).join('')
            +'</div>'
            +'<button class="tfbtn2'+(_fibOn?' on':'')+'" id="fibBtn" title="피보나치 되돌림" onclick="toggleFib()" style="margin-left:8px">📐 피보</button>'
            +(PROXY?'<span style="margin-left:auto;display:flex;align-items:center;gap:5px;font-size:10px;color:var(--faint);font-weight:700"><span id="liveDotChart" style="width:7px;height:7px;border-radius:50%;background:#16b364;box-shadow:0 0 5px #16b364;transition:opacity .4s"></span>LIVE 7초</span>':'')
          +'</div>'
          +'<div style="position:relative"><canvas class="schart" id="sChart"></canvas><div id="chartTip"></div></div>'
          +'<div id="chartCap" style="font-size:11px;color:var(--faint);margin-top:6px">불러오는 중…</div>'
          +'<div id="pressureFlow"></div>'
        +'</div>'
        +'<div id="stab-flow" style="display:none"></div>'
        +'<div id="stab-book" style="display:none"></div>'
        +'<div id="stab-score" style="display:none"></div>'
      +'</div>'
      +'<div>'
        +'<div class="card"><div class="ch"><h2>밤톨이 SCORE</h2></div><div class="pad" style="padding-top:12px">'
          +'<div style="display:flex;align-items:center;gap:16px"><div class="ring" style="background:conic-gradient(var(--gold) '+gaugeDeg+'deg, var(--line) 0)"><div class="rc"><b>'+r.score+'</b><br><span>/100</span></div></div>'
            +'<div><div style="font-size:18px;font-weight:800" class="'+grd[1]+'">'+grd[0]+'</div><div style="font-size:12px;color:var(--sub);margin-top:3px;line-height:1.4">'+(r.score>=80?'모멘텀·수급이 강하고 단기 추세가 살아있는 종목':'추세·수급을 함께 확인하며 접근')+'</div></div></div>'
          +'<div class="subs">'+Object.keys(subs).map(function(k){var v=subs[k];var g=gradeTxt(v);return '<div class="sub"><div class="sk">'+k+'</div><div class="sv">'+v+'</div><div class="sg '+g[1]+'">'+g[0]+'</div></div>';}).join('')+'</div>'
        +'</div></div>'
        +'<div class="card" style="margin-top:16px"><div class="ch"><h2>🧭 왜 움직였나</h2></div><div class="pad" style="padding-top:10px"><div id="whyBox" style="font-size:13px;line-height:1.75;color:var(--sub)"></div><div style="font-size:11px;color:var(--faint);margin-top:8px">※ 규칙 기반 자동 요약 — 참고용, 매매 신호 아님</div></div></div>'
        +'<div class="card" style="margin-top:16px"><div class="ch"><h2>📰 관련 뉴스</h2><div class="r">'+(relCount?'<span style="color:var(--gold);font-weight:700">'+relCount+'건 연관</span>':'<span style="color:var(--faint)">시장 뉴스</span>')+'</div></div><div class="pad" style="padding-top:8px"><div class="nlist">'
          +relNews.slice(0,5).map(function(x){var rel=(x.title.indexOf(r.n)>-1||(newsCore(r.n).length>=2&&x.title.indexOf(newsCore(r.n))>-1));return '<a href="'+x.link+'" target="_blank" rel="noopener">'+(rel?'<span style="color:var(--gold);font-weight:800;font-size:10px;margin-right:4px">●연관</span>':'')+'<span class="tm">'+relTime(x.t)+'</span><span class="tt">'+esc(x.title)+'</span></a>';}).join('')+'</div></div></div>'
        +'<div class="card" style="margin-top:16px"><div class="ch"><h2>🔎 비교 종목</h2></div><div class="pad" style="padding-top:8px">'
          +peers.map(function(p){return '<div class="cmprow"><span>'+p.n+'</span><span><span class="'+cls(p.ch)+'" style="font-weight:700">'+pctTxt(p.ch)+'</span> <span class="scorepill'+(p.score>=80?'':' s2')+'" style="margin-left:8px">'+p.score+'</span></span></div>';}).join('')+'</div></div>'
      +'</div>'
    +'</div>'
    +'<div class="disc" id="stkDisc" style="margin-top:18px">🧪 차트·거래대금·시총·수급은 데모 값입니다. 시세 프록시 연결 시 실시간 시세·호가·투자자 수급이 채워집니다.</div>';
  drawStockChart($('#sChart'),r);
  renderWhy(r);
  // 탭
  var flowHtml='<div style="font-size:12px;font-weight:800;margin:12px 0 8px">투자자별 순매수 <span style="color:var(--faint);font-weight:600">(억원·데모)</span></div>'
    +'<table><thead><tr><th class="l">구분</th><th>개인</th><th>외국인</th><th>기관</th><th>프로그램</th></tr></thead><tbody>'
    +[['당일',1],['5일',2.4],['20일',5.1],['60일',9.8]].map(function(p){var f=r.invest==='both'?1:r.invest==='sell'?-1:0.3;var base=r.px/1000*p[1];
      var ind=-Math.round(base*1.2*f), fr=Math.round(base*f), ins=Math.round(base*0.6*f), pr=Math.round(base*0.5*f);
      return '<tr><td class="l" style="font-weight:700">'+p[0]+'</td>'+[ind,fr,ins,pr].map(function(v){return '<td class="'+cls(v)+'" style="font-weight:700">'+(v>=0?'+':'')+v.toLocaleString()+'</td>';}).join('')+'</tr>';}).join('')
    +'</tbody></table>';
  var scoreHtml='<div style="margin-top:12px">'+['trade|거래 활성|35','price|가격 움직임|30','press|실시간 압력|25','flow|수급|5','trend|추세|5'].map(function(g){var p=g.split('|');var v=r.g[p[0]]==null?0:r.g[p[0]];var mx=(r.gmax&&r.gmax[p[0]]!=null)?r.gmax[p[0]]:+p[2];if(!mx)return '';return '<div class="bar"><span class="k">'+p[1]+'</span><div class="track"><div class="fill" style="width:'+Math.min(100,v/mx*100)+'%"></div></div><span class="vv">'+v+'/'+mx+'</span></div>';}).join('')
    +'<div style="font-size:12px;font-weight:800;color:var(--faint);text-transform:uppercase;margin:14px 0 6px">선정 이유</div><ul class="reasons" style="margin-top:0">'+r.reasons.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div>';
  $('#stab-flow').innerHTML=flowHtml; $('#stab-score').innerHTML=scoreHtml;
  $('#stab-book').innerHTML='<div style="font-size:12px;color:var(--faint);padding:18px 0">'+(PROXY?'호가 불러오는 중…':'호가 10단은 시세 프록시 연결 시 표시됩니다.')+'</div>';
  $$('.stabs button').forEach(function(b){ b.onclick=function(){ $$('.stabs button').forEach(function(x){x.classList.toggle('on',x===b);}); ['chart','flow','book','score'].forEach(function(t){$('#stab-'+t).style.display=(t===b.dataset.t)?'':'none';}); if(b.dataset.t==='chart')drawStockChart($('#sChart'),r); }; });
  // 봉 선택(1분·5분·일·주·월)
  $$('#tfBar button').forEach(function(b){ b.onclick=function(){ $$('#tfBar button').forEach(function(x){x.classList.toggle('on',x===b);}); loadChartTF(r,b.dataset.tf); }; });
  renderPressureFlow(r); // 초기(RADAR 값) → /flow 도착 시 실데이터로 교체
  attachChartCrosshair($('#sChart')); // 크로스헤어+OHLC 툴팁
  enrichStock(r); // 실데이터 보강(비동기) — 실패해도 위 데모 화면 유지
  startDetailLive(r); // 열어둔 동안 15초마다 가격·매수매도세·투자자 자동 갱신
  var _is=$('#idxstrip'); if(_is)_is.style.display='none'; var _db=$('#demoban'); if(_db)_db.style.display='none'; // 상세 땐 시장 지수 스트립 숨김 → 상세가 네비 바로 아래
  window.scrollTo(0,0);
}

/* ═══════════ 네비게이션 ═══════════ */
function showView(v,noScroll){
  $$('.view').forEach(function(x){x.classList.remove('on');});
  var el=$('#v-'+v); if(el)el.classList.add('on');
  if(!coinMode){ var _is=$('#idxstrip'); if(_is)_is.style.display=''; var _db=$('#demoban'); if(_db&&!useReal&&!useRealMkt)_db.style.display=''; }
  $$('#menu a').forEach(function(a){a.classList.toggle('on',a.dataset.v===v);});
  if(v!=='stock')stopDetailLive(); // 상세를 벗어나면 라이브 폴링 중단
  if(typeof initCards==='function')setTimeout(initCards,0); // 새로 보이는 카드에 접기 버튼 부여
  if(v==='news')fetchNews();
  if(v==='stock'&&!noScroll)renderStockBrowse();
  if(v==='watch')renderWatch();
  if(v==='learn')renderLearn();
  if(v==='market')renderHeatmap();
  if(!noScroll)window.scrollTo({top:0,behavior:'smooth'});
}
let _stkScroll=0;
let stkMkt='KR';
var _stkFilter='all';
var STK_FILTERS=[['all','전체'],['surge','급등 +5%↑'],['plunge','급락 -5%↓'],['up','상승'],['down','하락'],['kospi','코스피'],['kosdaq','코스닥']];
function stkPass(s){ var ch=s.ch||0, mk=(s.mk||'').toUpperCase();
  switch(_stkFilter){
    case 'surge': return ch>=5; case 'plunge': return ch<=-5;
    case 'up': return ch>0; case 'down': return ch<0;
    case 'kospi': return mk.indexOf('KOSDAQ')<0; case 'kosdaq': return mk.indexOf('KOSDAQ')>=0;
    default: return true; }
}
function renderStockBrowse(){
  var el=$('#stockPanel'); if(!el)return;
  // 국내 실데이터: board(거래대금 상위 30) 우선 → 스크리너. 없으면 RADAR/데모.
  var base=(stkMkt==='US')?USTK:((KBOARD&&KBOARD.length)?KBOARD:((useReal&&KISUNIV&&KISUNIV.length)?KISUNIV:STK));
  var real=(stkMkt==='KR'&&((KBOARD&&KBOARD.length)||(useReal&&KISUNIV&&KISUNIV.length)));
  var list=base.filter(stkPass);
  var showFilters=(stkMkt==='KR'); // 스크리너는 국내 board 대상
  el.innerHTML='<div class="sec-title" style="font-size:22px">🔎 종목 골라보기 (스크리너)</div><p class="sec-sub">거래대금 상위 종목을 조건으로 거릅니다. 티커·코드 검색도 됩니다 (예: AAPL, 005930).</p>'
    +'<div style="display:flex;gap:6px;margin-bottom:12px"><button class="ibtn sbm" data-m="KR" style="width:auto;padding:0 15px;border:1px solid '+(stkMkt==='KR'?'var(--gold)':'var(--line)')+';border-radius:20px;font-weight:800;font-size:13px'+(stkMkt==='KR'?';color:var(--gold)':'')+'">🇰🇷 국내</button><button class="ibtn sbm" data-m="US" style="width:auto;padding:0 15px;border:1px solid '+(stkMkt==='US'?'var(--gold)':'var(--line)')+';border-radius:20px;font-weight:800;font-size:13px'+(stkMkt==='US'?';color:var(--gold)':'')+'">🇺🇸 미국</button></div>'
    +(showFilters?('<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px" id="stkFilters">'+STK_FILTERS.map(function(f){return '<button class="scfil'+(f[0]===_stkFilter?' on':'')+'" data-f="'+f[0]+'">'+f[1]+'</button>';}).join('')+'</div>'):'')
    +'<div style="overflow-x:auto"><table><thead><tr><th class="l">종목</th><th>현재가</th><th>등락률</th><th>거래대금</th></tr></thead><tbody>'
    +(list.length?list.map(function(s){var amtT=hasNum(s.amount)?fmtEok(Math.round(s.amount/1e8)):'';return '<tr class="rowbtn" data-c="'+s.c+'"><td class="l"><div class="sym">'+s.n+'<small>'+s.c+' · '+s.mk+'</small></div></td><td class="num" id="bpx-'+s.c+'">'+priceFmt(s,s.px)+'</td><td class="'+cls(s.ch)+'" id="bch-'+s.c+'" style="font-weight:700">'+pctTxt(s.ch)+'</td><td class="num" style="color:var(--sub)">'+amtT+'</td></tr>';}).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--faint);padding:24px">조건에 맞는 종목이 없습니다.</td></tr>')+'</tbody></table></div>'
    +'<div style="font-size:11px;color:var(--faint);margin-top:10px" id="browseNote">'+(real?('✅ 국내 실시간 · '+list.length+'종목 (거래대금 상위)'):(PROXY?'시세 불러오는 중…':'🧪 데모 데이터'))+'</div>';
  $$('#stockPanel .rowbtn').forEach(function(tr){tr.onclick=function(){openStock(tr.dataset.c);};});
  $$('#stockPanel .sbm').forEach(function(b){b.onclick=function(){stkMkt=b.dataset.m;renderStockBrowse();};});
  $$('#stockPanel .scfil').forEach(function(b){b.onclick=function(){_stkFilter=b.dataset.f;renderStockBrowse();};});
  browseQuotes(list.map(function(s){return s.c;}),stkMkt);
}
/* 목록 시세를 /quotes 실데이터로 제자리 갱신 (클릭 전에도 실시간) */
function browseQuotes(codes,mkt){
  if(!PROXY||!codes.length) return;
  proxyJson('/quotes?mkt='+(mkt==='US'?'US':'KR')+'&codes='+codes.slice(0,50).join(',')).then(function(j){
    if(!j||!j.quotes) return; var got=0;
    j.quotes.forEach(function(q){ if(!q||q.px==null)return; got++;
      var pxEl=$('#bpx-'+q.code), chEl=$('#bch-'+q.code); // q.code=심볼, q.c=등락률
      var ccy=(mkt==='US')?'USD':'KRW';
      if(pxEl) pxEl.textContent=(ccy==='USD')?('$'+(+q.px).toLocaleString('en-US',{maximumFractionDigits:2})):won(q.px);
      if(chEl&&hasNum(q.c)){ chEl.textContent=pctTxt(q.c); chEl.className='num '+cls(q.c); }
    });
    var note=$('#browseNote'); if(note&&got&&stkMkt===mkt) note.textContent=(mkt==='US'?'✅ 미국 실시간 시세':'✅ 국내 실시간 시세')+' · '+got+'종목';
  });
}
function bindNav(a){ a.onclick=function(e){ if(a.dataset.v)showView(a.dataset.v); }; }
$$('#menu a').forEach(bindNav);
$$('.more[data-v]').forEach(bindNav);
window.openStock=openStock; window.renderStockBrowse=renderStockBrowse;

/* ═══════════ 뉴스 (한국/미국 + 번역) ═══════════ */
const NEWS_FEEDS={
  KR:[{u:'https://www.yna.co.kr/rss/economy.xml',s:'연합뉴스'},{u:'https://www.hankyung.com/feed/finance',s:'한국경제'},{u:'https://www.mk.co.kr/rss/30100041/',s:'매일경제'},{u:'https://news.einfomax.co.kr/rss/allArticle.xml',s:'연합인포맥스'},{u:'https://rss.edaily.co.kr/stock_news.xml',s:'이데일리'},{u:'https://rss.mt.co.kr/mt_news.xml',s:'머니투데이'}],
  US:[{u:'https://www.cnbc.com/id/20910258/device/rss/rss.html',s:'CNBC 마켓'},{u:'https://www.cnbc.com/id/100003114/device/rss/rss.html',s:'CNBC 톱뉴스'},{u:'https://www.cnbc.com/id/10000664/device/rss/rss.html',s:'CNBC 이코노미'}]
};
let newsCat='KR', usTr=false, _trC={};
function relTime(d){var s=(Date.now()-d)/1000;if(s<0)s=0;if(s<60)return '방금';if(s<3600)return Math.floor(s/60)+'분 전';if(s<86400)return Math.floor(s/3600)+'시간 전';return Math.floor(s/86400)+'일 전';}
/* rss2json은 pubDate를 UTC 'YYYY-MM-DD HH:MM:SS'(타임존 표기 없음)로 준다.
   그대로 Date.parse 하면 브라우저가 로컬(KST)로 해석해 정확히 9시간 어긋난다 → UTC로 강제 해석 */
function parseNewsTime(pd){
  if(!pd) return Date.now();
  var t;
  if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(pd)) t=Date.parse(pd.replace(' ','T')+'Z');
  else t=Date.parse(pd);
  return isFinite(t)?t:Date.now();
}
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
    var all=[];res.forEach(function(x){if(x&&x.j&&x.j.items)x.j.items.forEach(function(it){all.push({title:it.title,link:it.link,t:parseNewsTime(it.pubDate),src:x.s});});});
    all.sort(function(a,b){return b.t-a.t;});all=all.slice(0,18);
    if(cat==='KR')_lastNews=all.slice();
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
function doSearch(raw){ raw=(raw||'').trim(); if(!raw)return false; var t=raw.toLowerCase();
  var pool=(RADAR||[]).concat(typeof ALLSTK!=='undefined'?ALLSTK:STK);
  function open(code){ if(coinMode)setMode('stock'); openStock(code); return true; }
  // 1) 정확 코드/이름 일치
  var exact=pool.find(function(s){return s.c.toLowerCase()===t||s.n.toLowerCase()===t;});
  if(exact) return open(exact.c);
  // 2) 티커 형태 우선 (6자리 숫자=국내 / 전부 대문자 영문=미국 티커 의도)
  if(/^\d{6}$/.test(raw)) return open(raw);
  if(/^[A-Za-z][A-Za-z.\-]{0,5}$/.test(raw) && raw===raw.toUpperCase()) return open(raw.toUpperCase());
  // 3) 부분 일치(이름/코드 포함)
  var part=pool.find(function(s){return s.n.toLowerCase().includes(t)||s.c.toLowerCase().includes(t);});
  if(part) return open(part.c);
  // 4) 그래도 영문이면 미국 티커로 시도
  if(/^[A-Za-z][A-Za-z.\-]{0,5}$/.test(raw)) return open(raw.toUpperCase());
  return false;
}
$('#q').onkeydown=function(e){ if(e.key!=='Enter')return; if(doSearch(this.value)){ this.blur(); }
  else { this.style.borderColor='var(--down)'; var self=this; setTimeout(function(){self.style.borderColor='';},900); } };

/* ═══════════ 초기화 ═══════════ */
/* ═══════════ 코인 모드 (CoinGecko 실시간) ═══════════ */
let coinMode=false;
function fmtBig(v){ v=+v||0; if(v>=1e12)return (v/1e12).toFixed(2)+'T'; if(v>=1e9)return (v/1e9).toFixed(2)+'B'; if(v>=1e6)return (v/1e6).toFixed(1)+'M'; if(v>=1e3)return (v/1e3).toFixed(1)+'K'; return Math.round(v).toLocaleString('en-US'); }
function coinPx(p){ return '$'+(p>=1?(+p).toLocaleString('en-US',{maximumFractionDigits:2}):(+p).toPrecision(3)); }
function cCol(ch){ return ch>=0?'#16b364':'#f6465d'; } // 코인=초록↑/빨강↓(크립토 관례)
async function loadCoins(){
  var rr=$('#coinRadar');
  try{
    var arr=await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=40&page=1&price_change_percentage=24h').then(r=>r.json());
    if(!Array.isArray(arr)||!arr.length)throw 0;
    var maxVol=Math.max.apply(null,arr.map(function(c){return c.total_volume||0;}))||1;
    arr.forEach(function(c){ var mom=c.price_change_percentage_24h||0, turn=(c.total_volume||0)/(c.market_cap||1), volp=(c.total_volume||0)/maxVol;
      var s1=Math.max(0,Math.min(45,(mom+5)/25*45)), s2=Math.max(0,Math.min(30,turn*260)), s3=volp*25;
      c.score=Math.round(s1+s2+s3); });
    arr.sort(function(a,b){return b.score-a.score;});
    var top=arr.slice(0,12);
    rr.innerHTML='<thead><tr><th class="l">#</th><th class="l">코인</th><th>SCORE</th><th>가격</th><th>24h</th><th>거래대금</th></tr></thead><tbody>'
      +top.map(function(c,i){var ch=c.price_change_percentage_24h||0;return '<tr class="rowbtn" data-sym="'+esc((c.symbol||'').toUpperCase())+'" title="클릭 → ONEXCORE 코인 터미널에서 상세"><td class="l"><span class="rank">'+(i+1)+'</span></td><td class="l"><div class="sym">'+esc((c.symbol||'').toUpperCase())+' <span style="color:var(--gold);font-size:10px">↗</span><small>'+esc(c.name)+'</small></div></td><td><span class="scorepill'+(c.score>=65?'':' s2')+'">'+c.score+'</span></td><td class="num">'+coinPx(c.current_price)+'</td><td class="num" style="color:'+cCol(ch)+';font-weight:700">'+(ch>=0?'+':'')+ch.toFixed(2)+'%</td><td class="num" style="color:var(--sub)">$'+fmtBig(c.total_volume)+'</td></tr>';}).join('')+'</tbody>';
    $$('#coinRadar .rowbtn').forEach(function(tr){ tr.onclick=function(){ openCoin(tr.dataset.sym); }; });
    if($('#coinupd'))$('#coinupd').textContent='· '+nowHM()+' 실시간';
    // 코인 지표 카드(BTC/ETH/SOL/총시총)
    var pick=function(id){return arr.find(function(c){return c.id===id;});};
    var cm=$('#coinMetrics'); if(cm){ var cards=['bitcoin','ethereum','solana'].map(function(id){var c=pick(id)||arr[0];var ch=c.price_change_percentage_24h||0;return '<div class="idx"><div class="nm">'+esc((c.symbol||'').toUpperCase())+' · '+esc(c.name)+'</div><div class="v num" style="color:'+cCol(ch)+'">'+coinPx(c.current_price)+'</div><div class="d num" style="color:'+cCol(ch)+'">'+(ch>=0?'▲':'▼')+' '+Math.abs(ch).toFixed(2)+'%</div><div class="foot"><span>시총 $'+fmtBig(c.market_cap)+'</span><span>거래 $'+fmtBig(c.total_volume)+'</span></div></div>';}).join('');
      cm.innerHTML='<div class="idxstrip" style="margin-bottom:0">'+cards+'<div class="idx"><div class="nm">🪙 코인 RADAR</div><div class="v" style="color:var(--gold);font-size:22px">'+top.length+'종목</div><div class="d" style="color:var(--sub)">실시간 스코어링</div><div class="foot"><span>CoinGecko</span><span>'+nowHM()+'</span></div></div></div>'; }
  }catch(e){ rr.innerHTML='<tbody><tr><td style="color:var(--faint);padding:14px">코인 데이터를 불러오지 못했어요(잠시 후 자동 재시도)</td></tr></tbody>'; }
  loadCoinMarket();
}
async function loadCoinMarket(){
  var el=$('#coinMarket'); if(!el)return; var h='';
  try{ var fg=await fetch('https://api.alternative.me/fng/?limit=1').then(r=>r.json()); var v=+fg.data[0].value, kc={'Extreme Fear':'극단적 공포','Fear':'공포','Neutral':'중립','Greed':'탐욕','Extreme Greed':'극단적 탐욕'}[fg.data[0].value_classification]||fg.data[0].value_classification;
    h+='<div style="display:flex;align-items:baseline;gap:10px"><span style="font-size:34px;font-weight:800;color:var(--gold)">'+v+'</span><span style="font-weight:800">'+kc+'</span></div><div style="height:9px;border-radius:5px;background:linear-gradient(90deg,#f6465d,#e0a83e,#16b364);position:relative;margin:10px 0"><i style="position:absolute;left:'+v+'%;top:-3px;width:4px;height:15px;background:var(--ink);border-radius:2px;transform:translateX(-2px)"></i></div><div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--faint)"><span>0 극단공포</span><span>50</span><span>100 극단탐욕</span></div>';
  }catch(e){}
  try{ var g=await fetch('https://api.coingecko.com/api/v3/global').then(r=>r.json()); var d=g.data, mc=d.total_market_cap.usd, ch=d.market_cap_change_percentage_24h_usd;
    h+='<div style="margin-top:16px;border-top:1px solid var(--line2);padding-top:12px">'
      +'<div style="display:flex;justify-content:space-between;padding:5px 0"><span style="color:var(--sub)">전체 시가총액</span><b>$'+fmtBig(mc)+' <span style="color:'+cCol(ch)+'">'+(ch>=0?'+':'')+ch.toFixed(2)+'%</span></b></div>'
      +'<div style="display:flex;justify-content:space-between;padding:5px 0"><span style="color:var(--sub)">BTC 도미넌스</span><b>'+d.market_cap_percentage.btc.toFixed(1)+'%</b></div>'
      +'<div style="display:flex;justify-content:space-between;padding:5px 0"><span style="color:var(--sub)">ETH 도미넌스</span><b>'+d.market_cap_percentage.eth.toFixed(1)+'%</b></div></div>';
  }catch(e){}
  el.innerHTML=h||'<div style="color:var(--faint);font-size:12px">시장 데이터를 불러오지 못했어요</div>';
}
function openCoin(sym){
  var host=$('#coinHost'), body=$('#coinBody'); if(!host)return;
  var src='https://sannaq.github.io/onexcore-dashboard/'+(sym?('?s='+encodeURIComponent(sym)):'?v=new');
  host.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><button class="more" onclick="closeCoin()" style="background:none;border:none;font-family:inherit;padding:0;font-size:13px">◀ 코인 목록</button><span style="color:var(--faint);font-size:12px">'+(sym?esc(sym)+' · ':'')+'ONEXCORE 코인 터미널</span><a href="'+src+'" target="_blank" rel="noopener" class="more" style="margin-left:auto">↗ 전체화면</a></div>'
    +'<iframe src="'+src+'" style="width:100%;height:82vh;min-height:540px;border:1px solid var(--line);border-radius:14px;background:var(--panel)" loading="lazy" title="ONEXCORE"></iframe>';
  host.style.display='block'; if(body)body.style.display='none';
  window.scrollTo({top:0,behavior:'smooth'});
}
function closeCoin(){ var host=$('#coinHost'), body=$('#coinBody'); if(host){host.style.display='none';host.innerHTML='';} if(body)body.style.display=''; }
window.openCoin=openCoin; window.closeCoin=closeCoin;
function setMode(m){ coinMode=(m==='coin'); if(m!=='coin')closeCoin();
  $$('.segmode button').forEach(function(b){b.classList.toggle('on',b.dataset.m===m);});
  var strip=$('#idxstrip'); if(strip)strip.style.display=coinMode?'none':'';
  var menu=$('#menu'); if(menu)menu.style.display=coinMode?'none':'flex';
  var db=$('#demoban'); if(db)db.style.display=coinMode?'none':'';
  $$('.view').forEach(function(v){v.classList.remove('on');});
  if(coinMode){ $('#v-coin').classList.add('on'); openCoinTerminal(); }
  else { $('#v-home').classList.add('on'); $$('#menu a').forEach(function(a){a.classList.toggle('on',a.dataset.v==='home');}); }
  window.scrollTo({top:0,behavior:'smooth'});
}
/* 코인 모드 = onexcore 터미널 통째로(밤톨이 색) */
function openCoinTerminal(){
  var v=$('#v-coin'); if(!v)return;
  v.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin:2px 0 12px"><span class="sec-title" style="font-size:20px;margin:0">🪙 코인 터미널</span><span style="color:var(--faint);font-size:12px">실시간 · 차트·타점·수급</span><a href="https://sannaq.github.io/onexcore-dashboard/" target="_blank" rel="noopener" class="more" style="margin-left:auto">↗ 전체화면</a></div>'
    +'<iframe id="coinFrame" src="https://sannaq.github.io/onexcore-dashboard/" style="width:100%;height:calc(100vh - 96px);min-height:640px;border:1px solid var(--line);border-radius:14px;background:var(--panel);display:block" title="밤톨이 코인 터미널" loading="eager"></iframe>';
}
$$('.segmode button').forEach(function(b){ b.onclick=function(){ setMode(b.dataset.m); }; });

/* ═══════════════════════════════════════════════════════════
   LEARN 탭 — 교육용 학습 콘텐츠 (캔들·패턴·지표·매매원칙·엘리엇 파동)
   ※ 전부 공개된 표준 기술적 분석 개념을 밤톨이가 독자 서술. 매매 신호 아님.
   ═══════════════════════════════════════════════════════════ */
var _learnTab='basic';
/* 캔들 SVG — vals 0..118(위=0). up:true=상승(빨강)/false=하락(파랑)/null=중립(골드) */
function lc(o){ var W=64,H=118,cx=32,bw=o.bw||22;
  var col=o.up===true?'var(--up)':o.up===false?'var(--down)':'var(--gold)';
  var bt=Math.min(o.bt,o.bb),bb=Math.max(o.bt,o.bb),bh=Math.max(bb-bt,2.4);
  return '<svg width="'+(o.w||62)+'" height="'+(o.h||116)+'" viewBox="0 0 '+W+' '+H+'">'
    +'<line x1="'+cx+'" y1="'+o.h0+'" x2="'+cx+'" y2="'+o.l0+'" stroke="'+col+'" stroke-width="5" stroke-linecap="round"/>'
    +'<rect x="'+(cx-bw/2)+'" y="'+bt+'" width="'+bw+'" height="'+bh+'" rx="3.5" fill="'+col+'"/></svg>'; }
function ltile(svg,nm,ds,tone){ var b=tone==='up'?'lb-up':tone==='down'?'lb-down':'lb-neu';
  var lbl=tone==='up'?'상승 반전':tone==='down'?'하락 반전':'관망/전환';
  return '<div class="ltile">'+svg+'<div class="nm">'+nm+'</div><div class="ds">'+ds+'</div><span class="lbadge '+b+'">'+lbl+'</span></div>'; }
function lpath(pts,col,neck){ var nl=neck?'<line x1="'+neck[0]+'" y1="'+neck[1]+'" x2="'+neck[2]+'" y2="'+neck[1]+'" stroke="var(--sub)" stroke-width="2" stroke-dasharray="5 4"/>':'';
  return '<svg width="100%" height="120" viewBox="0 0 240 130" preserveAspectRatio="xMidYMid meet"><polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>'+nl+'</svg>'; }

function learnBasic(){
  return '<div class="lcard"><h3>차트의 3대 기본</h3><p class="lead">보조지표 다 끄고 이 3개만 제대로 봐도 절반은 먹고 들어갑니다.</p>'
    +'<div class="lrow"><div class="ic">🕯</div><div><p class="tt">캔들 (Candlestick)</p><p class="bd">한 봉의 <b>시가·고가·저가·종가</b>. 종가&gt;시가면 <b>양봉(빨강)</b>, 종가&lt;시가면 <b>음봉(파랑)</b>. 캔들 하나만 보지 말고 <b>위치·거래량·추세</b>를 함께.</p></div></div>'
    +'<div class="lrow"><div class="ic">📐</div><div><p class="tt">이동평균선 (MA)</p><p class="bd">일정 기간 평균가를 이은 선. 주가가 MA <b>위=상승추세</b>, <b>아래=하락추세</b>. 5·20·60·120일을 많이 씀. 밤톨이 차트엔 MA5·20·60이 겹쳐 그려집니다.</p></div></div>'
    +'<div class="lrow"><div class="ic">📊</div><div><p class="tt">거래량 (Volume)</p><p class="bd">얼마나 많은 사람이 참여했나. 가격 움직임은 <b>반드시 거래량으로 검증</b> — 돌파 + 대량거래 = 신뢰.</p></div></div></div>'
    +'<div class="lcard"><h3>🎯 confluence — 신호 겹침이 핵심</h3><p class="lead">한 지표만 믿지 마세요. <b>여러 신호가 같은 방향</b>을 가리킬 때가 진짜 자리입니다.</p>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.7">예) <b style="color:var(--ink)">지지 구간 + RSI 과매도 + 반전 캔들 + 거래량 증가</b> → 네 가지가 겹치면 신뢰도가 높아집니다. 밤톨이 RADAR의 100점 점수도 같은 원리 — 여러 지표를 합산해 평가합니다.</p></div>'
    +'<div class="lcard"><h3>🌰 밤톨이로 바로 실습</h3><p class="lead">배운 걸 실제 시장에서 확인해보세요.</p><div class="chips" style="display:flex;flex-wrap:wrap;gap:8px">'
    +'<span class="rulechip" style="cursor:pointer;background:var(--gold);color:#3a2c07" onclick="showView(\'radar\')">🎯 지금 강한 종목 RADAR →</span>'
    +'<span class="rulechip" style="cursor:pointer" onclick="showView(\'stock\')">🕯 종목 차트에서 이평·거래량 보기 →</span>'
    +'<span class="rulechip" style="cursor:pointer" onclick="showView(\'market\')">🌊 오늘 시장 흐름 →</span>'
    +'</div></div>';
}
function learnCandle(){
  var anat='<div class="ltile">'+lc({h0:10,bt:30,bb:74,l0:106,up:true,bw:36,w:88,h:120})+'<div class="nm" style="color:var(--up)">양봉 (상승)</div><div class="ds">종가 &gt; 시가 · 매수세 우위<br>위꼬리·몸통·아래꼬리</div></div>'
    +'<div class="ltile">'+lc({h0:10,bt:30,bb:74,l0:106,up:false,bw:36,w:88,h:120})+'<div class="nm" style="color:var(--down)">음봉 (하락)</div><div class="ds">종가 &lt; 시가 · 매도세 우위<br>몸통이 길수록 힘이 강함</div></div>';
  var REV=[
    {nm:'망치형',ds:'바닥에서 긴 아래꼬리',tone:'up',s:{h0:18,bt:22,bb:46,l0:108,up:true,bw:26}},
    {nm:'역망치형',ds:'바닥에서 긴 위꼬리',tone:'up',s:{h0:10,bt:70,bb:94,l0:100,up:true,bw:26}},
    {nm:'교수형',ds:'천장의 망치 모양',tone:'down',s:{h0:18,bt:22,bb:46,l0:108,up:false,bw:26}},
    {nm:'유성형',ds:'천장의 역망치',tone:'down',s:{h0:10,bt:70,bb:94,l0:100,up:false,bw:26}},
    {nm:'도지',ds:'몸통 거의 없음·힘의 균형',tone:'neu',s:{h0:16,bt:57,bb:60,l0:104,up:null,bw:34}},
    {nm:'잠자리도지',ds:'바닥 반전 유력',tone:'up',s:{h0:20,bt:20,bb:23,l0:108,up:true,bw:34}},
    {nm:'장대양봉',ds:'강한 매수 유입',tone:'up',s:{h0:12,bt:16,bb:104,l0:110,up:true,bw:30}},
    {nm:'장대음봉',ds:'강한 매도 출회',tone:'down',s:{h0:12,bt:16,bb:104,l0:110,up:false,bw:30}}
  ];
  return '<div class="lcard"><h3>캔들 기본 구조</h3><p class="lead">몸통 = 시가~종가, 꼬리 = 밀렸다 되돌아온 흔적. 한국식(상승=빨강 / 하락=파랑).</p><div class="lgrid lg2">'+anat+'</div></div>'
    +'<div class="lcard"><h3>반전 신호 캔들 8종</h3><p class="lead">바닥/천장에서 나오면 추세 전환 힌트 — <b>거래량 급증과 함께</b> 나와야 신뢰도 ↑.</p>'
    +'<div class="lgrid lg4">'+REV.map(function(p){return ltile(lc(p.s),p.nm,p.ds,p.tone);}).join('')+'</div>'
    +'<div class="llegend"><span><i class="lsw" style="background:var(--up)"></i> 상승 반전</span><span><i class="lsw" style="background:var(--down)"></i> 하락 반전</span><span><i class="lsw" style="background:var(--gold)"></i> 관망/전환</span></div>'
    +'<div style="margin-top:14px"><span class="rulechip" style="cursor:pointer;background:var(--gold);color:#3a2c07" onclick="showView(\'stock\')">🕯 차트에서 캔들을 눌러 \'속 보기\' 실습 →</span></div></div>';
}
function learnPattern(){
  var CH=[
    {nm:'헤드앤숄더',ds:'천장 3봉, 가운데 최고 → 하락 전환',tone:'down',pts:'0,120 40,66 70,92 118,26 168,92 200,66 240,120',neck:[40,92,200]},
    {nm:'역헤드앤숄더',ds:'바닥 3저점, 가운데 최저 → 상승 전환',tone:'up',pts:'0,10 40,74 70,48 118,104 168,48 200,74 240,10',neck:[40,48,200]},
    {nm:'쌍봉 (M)',ds:'같은 높이 두 번 못 뚫음 → 하락',tone:'down',pts:'0,120 48,36 96,92 148,36 200,92 240,120',neck:[48,92,200]},
    {nm:'쌍바닥 (W)',ds:'같은 바닥 두 번 지지 → 상승',tone:'up',pts:'0,12 48,104 96,52 148,104 200,52 240,12',neck:[48,52,200]},
    {nm:'상승 삼각수렴',ds:'고점 수평 + 저점 상승 → 위로 돌파 우세',tone:'up',pts:'0,110 40,40 80,40 118,74 158,40 198,54 240,40'},
    {nm:'하락 쐐기',ds:'고점·저점 하락하나 수렴 → 반등 가능',tone:'up',pts:'0,20 44,70 78,40 128,86 168,64 210,100 240,84'}
  ];
  return '<div class="lcard"><h3>차트 패턴 (여러 봉의 그림)</h3><p class="lead">며칠~몇 주에 걸쳐 그려지는 모양. <b>목선(넥라인) 돌파</b>가 확정 신호, 되돌림 지지 확인 후 진입이 안전.</p>'
    +'<div class="lgrid lg3">'+CH.map(function(p){var col=p.tone==='up'?'var(--up)':'var(--down)';var b=p.tone==='up'?'lb-up':'lb-down';var lbl=p.tone==='up'?'상승 반전':'하락 반전';
      return '<div class="ltile">'+lpath(p.pts,col,p.neck)+'<div class="nm">'+p.nm+'</div><div class="ds">'+p.ds+'</div><span class="lbadge '+b+'">'+lbl+'</span></div>';}).join('')+'</div>'
    +'<div class="llegend"><span><i class="lsw" style="background:var(--up)"></i> 상승 반전</span><span><i class="lsw" style="background:var(--down)"></i> 하락 반전</span></div></div>';
}
function structSwingSVG(){
  return '<svg width="100%" height="140" viewBox="0 0 260 150" preserveAspectRatio="xMidYMid meet">'
    +'<polyline points="14,120 60,40 100,86 150,22 195,70 246,14" fill="none" stroke="var(--sub)" stroke-width="3" stroke-linejoin="round"/>'
    +[['60,40','H','var(--up)'],['150,22','H','var(--up)']].map(function(p){var xy=p[0].split(',');return '<circle cx="'+xy[0]+'" cy="'+xy[1]+'" r="11" fill="var(--panel)" stroke="'+p[2]+'" stroke-width="2"/><text x="'+xy[0]+'" y="'+(+xy[1]+4)+'" text-anchor="middle" font-size="11" font-weight="800" fill="'+p[2]+'">'+p[1]+'</text>';}).join('')
    +[['100,86','L','var(--down)'],['195,70','L','var(--down)']].map(function(p){var xy=p[0].split(',');return '<circle cx="'+xy[0]+'" cy="'+xy[1]+'" r="11" fill="var(--panel)" stroke="'+p[2]+'" stroke-width="2"/><text x="'+xy[0]+'" y="'+(+xy[1]+4)+'" text-anchor="middle" font-size="11" font-weight="800" fill="'+p[2]+'">'+p[1]+'</text>';}).join('')
    +'<text x="60" y="20" text-anchor="middle" font-size="10" fill="var(--sub)">봉우리</text><text x="100" y="108" text-anchor="middle" font-size="10" fill="var(--sub)">골</text></svg>';
}
function structTrendSVG(up){
  var pts=up?'12,120 45,95 40,105 80,68 74,80 116,44 110,56 150,22':'12,22 45,48 40,38 80,72 74,60 116,96 110,84 150,120';
  return '<svg width="100%" height="120" viewBox="0 0 160 140" preserveAspectRatio="xMidYMid meet"><polyline points="'+pts+'" fill="none" stroke="'+(up?'var(--up)':'var(--down)')+'" stroke-width="3.2" stroke-linejoin="round"/></svg>';
}
function structBoxSVG(){
  return '<svg width="100%" height="120" viewBox="0 0 160 140" preserveAspectRatio="xMidYMid meet">'
    +'<line x1="8" y1="34" x2="152" y2="34" stroke="var(--down)" stroke-width="1.5" stroke-dasharray="5 4"/><line x1="8" y1="104" x2="152" y2="104" stroke="var(--up)" stroke-width="1.5" stroke-dasharray="5 4"/>'
    +'<polyline points="12,104 34,40 56,100 78,38 100,102 122,40 144,100" fill="none" stroke="var(--sub)" stroke-width="3" stroke-linejoin="round"/>'
    +'<text x="150" y="30" text-anchor="end" font-size="9" fill="var(--down)">저항</text><text x="150" y="118" text-anchor="end" font-size="9" fill="var(--up)">지지</text></svg>';
}
function structBreakSVG(){
  return '<svg width="100%" height="140" viewBox="0 0 260 150" preserveAspectRatio="xMidYMid meet">'
    +'<line x1="100" y1="86" x2="252" y2="86" stroke="var(--down)" stroke-width="1.4" stroke-dasharray="5 4"/>'
    +'<polyline points="14,120 60,50 100,86 150,34 200,96 246,120" fill="none" stroke="var(--up)" stroke-width="3" stroke-linejoin="round"/>'
    +'<polyline points="200,96 246,120" fill="none" stroke="var(--down)" stroke-width="3"/>'
    +'<circle cx="100" cy="86" r="10" fill="var(--panel)" stroke="var(--down)" stroke-width="2"/><text x="100" y="90" text-anchor="middle" font-size="10" font-weight="800" fill="var(--down)">직전 골</text>'
    +'<text x="214" y="112" font-size="12" fill="var(--down)" font-weight="800">✗ 이탈</text>'
    +'<text x="105" y="78" font-size="9" fill="var(--sub)">이 아래로 종가 이탈 = 구조 훼손 · 손절</text></svg>';
}
function learnStruct(){
  return '<div class="lcard"><h3>🏗 봉우리와 골 — 모든 판단의 출발점</h3><p class="lead">차트 읽기는 두 점에서 시작합니다. <b>봉우리(스윙 고점)</b>와 <b>골(스윙 저점)</b>.</p>'
    +'<div class="wavebox">'+structSwingSVG()+'</div>'
    +'<div class="lrow"><div class="ic">🔺</div><div><p class="tt">봉우리 = 스윙 고점</p><p class="bd">그 봉의 <b>고가가 좌우 이웃 봉들의 고가보다 높은</b> 지점. 시장이 위에서 밀려 내려온 자리.</p></div></div>'
    +'<div class="lrow"><div class="ic">🔻</div><div><p class="tt">골 = 스윙 저점</p><p class="bd">그 봉의 <b>저가가 좌우보다 낮은</b> 지점. 매수세가 받쳐 되돌아온 자리.</p></div></div>'
    +'<p class="bd" style="color:var(--sub);font-size:12.5px;margin-top:6px">추세 판단·지지저항·손절 위치가 전부 이 두 점에서 출발합니다.</p></div>'
    +'<div class="lcard"><h3>🎮 추세장 vs 박스장 — 먼저 "지금 어떤 게임인지" 묻기</h3><p class="lead">시장은 두 상태를 오갑니다. 상태에 맞지 않는 기법을 쓰면 양쪽에서 깎입니다.</p>'
    +'<div class="lgrid lg3">'
    +'<div class="ltile">'+structTrendSVG(true)+'<div class="nm" style="color:var(--up)">상승 추세</div><div class="ds">봉우리·골이 <b>계단식으로 높아짐</b></div></div>'
    +'<div class="ltile">'+structBoxSVG()+'<div class="nm" style="color:var(--gold)">박스(횡보)</div><div class="ds">비슷한 저항·지지 사이 <b>왕복</b></div></div>'
    +'<div class="ltile">'+structTrendSVG(false)+'<div class="nm" style="color:var(--down)">하락 추세</div><div class="ds">봉우리·골이 <b>계단식으로 낮아짐</b></div></div>'
    +'</div>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.7;margin-top:12px">시장은 생각보다 <b style="color:var(--ink)">오래 박스에 머뭅니다</b>. 추세용 기법(눌림목 매수 등)을 박스에서 휘두르면 위에서 사서 아래서 손절 — 양쪽에서 털립니다. <b style="color:var(--ink)">"추세냐 박스냐"</b>를 먼저 판단하고 기법을 골라야 합니다.</p></div>'
    +'<div class="lcard"><h3>💥 구조가 깨지는 순간 = 손절 자리</h3><p class="lead">추세는 조건이 유지되는 동안만 살아있습니다. 그 조건이 깨지는 가격이 손절가.</p>'
    +'<div class="wavebox">'+structBreakSVG()+'</div>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.8">• <b style="color:var(--ink)">상승추세</b>는 \'고점 higher + 저점 higher\'가 유지되는 동안 유효. <b>직전 골(스윙 저점)을 종가로 이탈</b>하면 구조 훼손 → 손절은 그 골 살짝 아래.<br>'
    +'• <b style="color:var(--ink)">하락추세</b>는 반대 — 직전 봉우리를 종가로 <b>돌파</b>하면 훼손.<br>'
    +'• 핵심: <b style="color:var(--ink)">"내 판단이 틀렸음이 증명되는 가격"</b>이 곧 손절가입니다. 감이 아니라 구조로 정합니다.</p>'
    +'<div style="margin-top:12px"><span class="rulechip" style="cursor:pointer;background:var(--gold);color:#3a2c07" onclick="showView(\'stock\')">🏗 차트에서 봉우리·골 직접 찾아보기 →</span></div></div>';
}
function learnInd(){
  return '<div class="lcard"><h3>핵심 지표 5</h3><p class="lead">지표는 많을수록 신호가 충돌합니다. 아래 중 <b>2~3개</b>만 골라 쓰세요.</p>'
    +'<div class="lrow"><div class="ic">📐</div><div><p class="tt">이동평균선 · 골든/데드크로스</p><p class="bd">단기선이 장기선을 위로 뚫으면 <b style="color:var(--up)">골든크로스</b>, 아래로 뚫으면 <b style="color:var(--down)">데드크로스</b>. 팁: 골든크로스 <b>당일 추격 금지</b> → 며칠 뒤 20일선 되돌림 지지 확인 후.</p></div></div>'
    +'<div class="lrow"><div class="ic">📊</div><div><p class="tt">거래량</p><p class="bd">돌파에 <b>거래량이 실려야</b> 진짜. 가격은 오르는데 거래량이 줄면 힘 빠지는 신호(다이버전스).</p></div></div>'
    +'<div class="lrow"><div class="ic">🧭</div><div><p class="tt">지지 / 저항</p><p class="bd">\'선\'이 아니라 <b>폭 있는 구간</b>으로. <b>뚫린 저항은 이후 지지로 전환</b>.</p></div></div>'
    +'<div class="lrow"><div class="ic">⚡</div><div><p class="tt">RSI (속도)</p><p class="bd">0~100. <b>70 위=과매수</b>, <b>30 아래=과매도</b>. 강한 추세장에선 과매수에서 더 갈 수 있으니 단독 사용 금지.</p></div></div>'
    +'<div class="lrow"><div class="ic">〰️</div><div><p class="tt">MACD (모멘텀)</p><p class="bd">두 이평선 차이로 추세 힘·전환을 봄. 시그널선 상향 교차=상승 모멘텀.</p></div></div></div>';
}
function learnTips(){
  var T=[['사기 전에 손절가부터 정한다','진입 근거가 깨지는 가격 = 손절가. 예: 지지 50,000 → "종가 49,000 아래면 축소".'],
    ['손실은 짧게, 수익은 길게','손익비 2:1 이상만. -2%에서 끊고 +12%까지 끌고 가는 식.'],
    ['추격보다 되돌림 지지','돌파 직후 추격보다 20/60일선 눌림 지지 확인 후 진입 — 손절 기준이 명확해짐.'],
    ['지표는 2~3개만','5~6개 겹치면 신호 충돌 → 오히려 독. 명확히 해석 가능한 것만.'],
    ['스윙은 60일선이 마지노선','중기 추세 최종 방어선. 종가로 이탈하면 추세 훼손 의심.']];
  return '<div class="lcard"><h3>매매 실전 원칙</h3><p class="lead">기법보다 중요한 건 잃지 않는 습관. 초보 생존율을 올리는 순서.</p>'
    +T.map(function(t,i){return '<div class="ltip"><div class="n">'+(i+1)+'</div><div><p class="h">'+t[0]+'</p><p class="p">'+t[1]+'</p></div></div>';}).join('')+'</div>'
    +'<div class="lcard"><h3>진입 전 체크리스트</h3><div class="chips" style="display:flex;flex-wrap:wrap;gap:6px">'
    +['추세 방향은?','지지/저항 위치?','거래량 실렸나?','손절가 정했나?','손익비 2:1↑?','오늘 지표 발표 있나?'].map(function(c){return '<span class="rulechip" style="background:var(--panel2);color:var(--sub)">□ '+c+'</span>';}).join('')+'</div></div>';
}
/* 엘리엇 파동 다이어그램 (독자 작성) */
function waveImpulseSVG(){
  return '<svg width="100%" height="180" viewBox="0 0 480 200" preserveAspectRatio="xMidYMid meet">'
    +'<polyline points="20,180 90,90 60,120 180,40 150,80 300,20 260,70 360,45 340,60 420,25" fill="none" stroke="var(--up)" stroke-width="3.5" stroke-linejoin="round"/>'
    +'<polyline points="420,25 450,80 435,55 470,95" fill="none" stroke="var(--down)" stroke-width="3.5" stroke-linejoin="round"/>'
    +[['90,90','1'],['180,40','3'],['300,20','5'],['60,120','2'],['150,80','4']].map(function(p){var xy=p[0].split(',');return '<circle cx="'+xy[0]+'" cy="'+xy[1]+'" r="12" fill="var(--panel)" stroke="var(--up)" stroke-width="2"/><text x="'+xy[0]+'" y="'+(+xy[1]+4)+'" text-anchor="middle" font-size="12" font-weight="800" fill="var(--up)">'+p[1]+'</text>';}).join('')
    +[['450,80','A'],['470,95','C']].map(function(p){var xy=p[0].split(',');return '<circle cx="'+xy[0]+'" cy="'+xy[1]+'" r="11" fill="var(--panel)" stroke="var(--down)" stroke-width="2"/><text x="'+xy[0]+'" y="'+(+xy[1]+4)+'" text-anchor="middle" font-size="11" font-weight="800" fill="var(--down)">'+p[1]+'</text>';}).join('')
    +'<text x="200" y="195" font-size="12" fill="var(--sub)">상승 5파(동인) → 하락 3파(조정 A·B·C)</text></svg>';
}
/* 작은 파동 패턴 도해 — pts, 라벨(옵션) */
function wsvg(pts,col,labels){ col=col||'var(--gold)';
  var lb=(labels||[]).map(function(l){return '<circle cx="'+l[0]+'" cy="'+l[1]+'" r="9" fill="var(--panel)" stroke="'+col+'" stroke-width="1.8"/><text x="'+l[0]+'" y="'+(+l[1]+3.5)+'" text-anchor="middle" font-size="9.5" font-weight="800" fill="'+col+'">'+l[2]+'</text>';}).join('');
  return '<svg width="100%" height="110" viewBox="0 0 200 130" preserveAspectRatio="xMidYMid meet"><polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>'+lb+'</svg>'; }
function wtile(svg,nm,ds){ return '<div class="ltile">'+svg+'<div class="nm">'+nm+'</div><div class="ds">'+ds+'</div></div>'; }
function learnWave(){
  return '<div class="lcard"><h3>🌊 엘리엇 파동이론이란</h3><p class="lead">1930년대 랠프 넬슨 엘리엇이 정리한 이론. <b>시장은 군중 심리에 따라 같은 모양이 반복</b>된다고 봅니다. 큰 파동 안에 같은 모양의 작은 파동이 들어있는 <b>프랙탈(자기닮음) 구조</b>가 핵심.</p>'
    +'<div class="wavebox">'+waveImpulseSVG()+'</div>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.7">한 사이클 = <b style="color:var(--up)">상승 5파(1·2·3·4·5)</b> + <b style="color:var(--down)">하락 3파(A·B·C)</b>. 추세 방향으로 가는 <b>동인파동(1·3·5)</b>과 되돌리는 <b>조정파동(2·4)</b>이 번갈아 나옵니다.</p></div>'
    +'<div class="lcard"><h3>절대 법칙 3가지 (깨지면 카운트가 틀린 것)</h3><p class="lead">이 3개는 예외 없이 지켜져야 합니다. 어기면 파동 번호를 잘못 센 겁니다.</p>'
    +'<div class="ltip"><div class="n">1</div><div><p class="h">2파는 1파의 시작점을 깨지 않는다</p><p class="p">2파 되돌림이 1파 출발점 아래로 내려가면, 그건 2파가 아닙니다.</p></div></div>'
    +'<div class="ltip"><div class="n">2</div><div><p class="h">3파는 가장 짧은 파동이 될 수 없다</p><p class="p">1·3·5 중 3파가 제일 짧으면 안 됨. 보통 <b>3파가 가장 길고 강력</b>합니다(주도 상승).</p></div></div>'
    +'<div class="ltip"><div class="n">3</div><div><p class="h">4파는 1파의 영역을 침범하지 않는다</p><p class="p">4파 저점이 1파 고점 아래로 내려오면 안 됨. (예외: 다이아고날 패턴)</p></div></div></div>'
    +'<div class="lcard"><h3>동인파동 · 조정파동</h3>'
    +'<div class="lrow"><div class="ic">🚀</div><div><p class="tt">임펄스(충격) 파동 — 1·3·5</p><p class="bd">추세 방향으로 5개 파동. <b>3파가 보통 가장 강하고 길다</b>. 1·3·5 중 하나는 다른 것보다 길게 늘어나는 <b>연장(extension)</b>이 자주 나옵니다.</p></div></div>'
    +'<div class="lrow"><div class="ic">🔄</div><div><p class="tt">조정 파동 — 2·4, A·B·C</p><p class="bd">추세를 되돌리는 구간. 대표 형태 <b>지그재그(5-3-5)</b>, <b>플랫(3-3-5)</b>, <b>삼각수렴(3-3-3-3-3)</b>. 2파와 4파는 서로 다른 형태로 나오는 경향(교대 규칙).</p></div></div>'
    +'<div class="lrow"><div class="ic">📐</div><div><p class="tt">피보나치와의 관계</p><p class="bd">되돌림은 <b>0.382·0.5·0.618</b>, 확장은 <b>1.618·2.618</b>을 자주 씁니다. 예) 2파는 1파의 0.5~0.618 되돌림, 3파는 1파의 1.618배 확장이 흔함.</p></div></div></div>'
    +'<div class="lcard"><h3>조정파동 3대 형태</h3><p class="lead">되돌림(2·4·A·B·C)이 그려지는 대표 모양. 하락 조정 예시.</p><div class="lgrid lg3">'
    +wtile(wsvg('12,20 78,105 45,58 108,120',null,[[78,105,'A'],[45,58,'B'],[108,120,'C']]),'지그재그 (5-3-5)','급격한 조정. A·C가 길고 B는 얕게 되돌림.')
    +wtile(wsvg('12,30 72,100 55,34 112,108',null,[[72,100,'A'],[55,34,'B'],[112,108,'C']]),'플랫 (3-3-5)','옆으로 횡보. B가 A 시작점 부근까지 되돌림.')
    +wtile(wsvg('10,32 40,96 62,44 84,86 104,56 120,72',null,[[40,96,'a'],[62,44,'b'],[84,86,'c'],[104,56,'d'],[120,72,'e']]),'삼각수렴 (3-3-3-3-3)','수렴하며 힘 응축. 주로 4파·B파에 등장.')
    +'</div></div>'
    +'<div class="lcard"><h3>동인파동 심화 — 연장 · 다이아고날</h3><p class="lead">임펄스가 변형되는 두 경우.</p><div class="lgrid lg2">'
    +wtile(wsvg('12,120 40,90 30,105 62,35 50,60 100,15 90,40 118,25',null,[[62,35,'3']]),'3파 연장 (extension)','1·3·5 중 하나가 크게 늘어남. 보통 3파가 연장돼 가장 김.')
    +wtile(wsvg('16,116 44,74 34,96 66,50 54,72 86,34 78,52 104,22 96,38 116,14','var(--up)'),'다이아고날 (쐐기)','수렴하는 5파. 절대법칙 3번의 유일한 예외(4파가 1파 침범 허용).')
    +'</div></div>'
    +'<div class="lcard"><h3>🧮 피보나치 실전 적용 예시</h3><p class="lead">숫자로 보면 쉽습니다. 1파가 10,000 → 12,000원 상승했다고 가정.</p>'
    +'<div class="lrow"><div class="ic">②</div><div><p class="tt">2파 되돌림 목표</p><p class="bd">1파 상승폭(2,000)의 <b>0.5~0.618</b> 되돌림 → 10,760~11,000원 부근에서 <b>2파 저점</b>을 기대. 여기가 진입 후보.</p></div></div>'
    +'<div class="lrow"><div class="ic">③</div><div><p class="tt">3파 목표</p><p class="bd">2파 저점에서 1파의 <b>1.618배</b> 확장 → 흔히 가장 강한 상승. 예: 저점 11,000 + (2,000×1.618) ≈ <b>14,240원</b>.</p></div></div>'
    +'<div class="lrow"><div class="ic">⑤</div><div><p class="tt">5파 · 마무리</p><p class="bd">5파는 1파와 <b>비슷한 길이</b>거나 3파의 0.618배가 흔함. 5파에서 RSI가 3파보다 낮아지면(다이버전스) 상승 소진 경계.</p></div></div>'
    +'<p class="bd" style="color:var(--faint);font-size:11.5px;margin-top:8px">※ 어디까지나 확률적 목표치. 실제론 되돌림이 얕거나 깊을 수 있으니 손절가와 함께 씁니다.</p></div>'
    +'<div class="lcard"><h3>💡 실전에서 조심할 점</h3>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.8">• 파동은 <b style="color:var(--ink)">지나고 나서야 명확</b>합니다. 실시간 카운트는 여러 시나리오를 열어두세요.<br>'
    +'• <b style="color:var(--ink)">내 포지션에 유리하게 억지로 세지 말 것</b> — 절대법칙 위반이 대표적 실수.<br>'
    +'• 3파를 노리는 게 정석(가장 강함). 5파 끝·C파 끝은 추세 전환 경계.<br>'
    +'• RSI 다이버전스(3파·5파 사이 고점 낮아짐)가 5파 소진을 암시하기도 합니다.</p>'
    +'<p class="bd" style="color:var(--faint);font-size:11.5px;margin-top:10px">※ 엘리엇 파동은 확률적 도구입니다. 확정 신호가 아니며, 손절·손익비 원칙과 함께 쓰세요.</p>'
    +'<div style="margin-top:12px"><span class="rulechip" style="cursor:pointer;background:var(--gold);color:#3a2c07" onclick="showView(\'stock\')">🌊 차트에서 파동·이평 직접 세어보기 →</span></div></div>';
}
function learnEcon(){
  return '<div class="lcard"><h3>📅 경제지표 읽는 법</h3><p class="lead"><b>실제 · 예상치 · 이전</b> 3개 숫자로 판단합니다.</p>'
    +'<div class="lrow"><div class="ic">🎯</div><div><p class="tt">실제 vs 예상치</p><p class="bd">발표 <b>실제값이 예상치와 얼마나 다른가</b>(서프라이즈)가 핵심. 예상과 같으면 이미 반영돼 반응 작음.</p></div></div>'
    +'<div class="lrow"><div class="ic">💵</div><div><p class="tt">물가 지표 (CPI·PPI·PCE)</p><p class="bd">예상보다 <b>높으면 인플레 → 금리 인상 압력 → 증시 부담</b>(대체로 악재). 낮으면 반대.</p></div></div>'
    +'<div class="lrow"><div class="ic">🐂</div><div><p class="tt">중요도(별·황소)</p><p class="bd">3개짜리(CPI·FOMC·고용)는 발표 순간 변동성 큼 — 초보는 발표 전후 관망 권장.</p></div></div></div>'
    +'<div class="lcard"><h3>꼭 아는 핵심 지표</h3><div class="lgrid lg2">'
    +[['🇺🇸','CPI · 소비자물가','인플레 1순위. 증시·금리 최대 변수. 매월.'],
      ['🏦','FOMC · 기준금리','연준 금리 결정 + 파월 발언. 연 8회, 변동성 최대.'],
      ['👷','비농업고용(NFP)','매월 첫 금요일. 고용 강도 → 금리 경로.'],
      ['🛒','소매판매·PCE','경기 체력. PCE=연준 선호 물가지표.'],
      ['🏭','ISM/PMI','50 위=경기 확장, 아래=수축.'],
      ['🇰🇷','한국 금리·수출입','한은 금통위, 월초 수출 동향이 코스피에 직결.']].map(function(x){
      return '<div class="lrow" style="border:none;padding:8px 0"><div class="ic">'+x[0]+'</div><div><p class="tt">'+x[1]+'</p><p class="bd">'+x[2]+'</p></div></div>';}).join('')+'</div>'
    +'<div style="margin-top:12px"><a class="rulechip" style="cursor:pointer" onclick="showView(\'news\')">📰 밤톨이 뉴스 탭에서 실시간 헤드라인 보기 →</a></div></div>';
}
function renderLearn(){
  var el=$('#learnBody'); if(!el) return;
  var fn={basic:learnBasic,candle:learnCandle,pattern:learnPattern,struct:learnStruct,ind:learnInd,tips:learnTips,wave:learnWave,econ:learnEcon}[_learnTab]||learnBasic;
  el.innerHTML=fn();
}
window.renderLearn=renderLearn;
$$('#ltabs button').forEach(function(b){ b.onclick=function(){ _learnTab=b.dataset.l; $$('#ltabs button').forEach(function(x){x.classList.toggle('on',x===b);}); renderLearn(); }; });

/* ═══════════ 카드 접기/숨김 상태 (렌더보다 먼저 정의 — renderSummary가 참조) ═══════════ */
var CARDPREF={collapsed:{},hidden:{}};
try{ var _cp=JSON.parse(localStorage.getItem('aurCards')||'null'); if(_cp)CARDPREF=Object.assign({collapsed:{},hidden:{}},_cp); }catch(e){}
function saveCardPref(){ try{localStorage.setItem('aurCards',JSON.stringify(CARDPREF));}catch(e){} }

/* ═══════════ 초기화 ═══════════ */
renderIdx(); renderTune(); renderRadar(); renderSmart(); renderFlow(); renderCats(); renderStrongSectors(); fetchNews(); updateWatchBadge();

/* ═══════════ 카드 편집기 ═══════════ */
function cardId(card){
  var h=card.querySelector('.ch h2'); var txt=h?h.textContent:'';
  return (txt||'').replace(/[^\w가-힣]/g,'').slice(0,24)||('card'+([].indexOf.call(document.querySelectorAll('.card'),card)));
}
function applyCollapse(card,c){ card.classList.toggle('collapsed',!!c); }
function initCards(){
  $$('.card').forEach(function(card){
    var ch=card.querySelector('.ch'), h=card.querySelector('.ch h2'); if(!ch||!h)return;
    var id=cardId(card); card.dataset.card=id;
    if(CARDPREF.hidden[id]){ card.style.display='none'; } else if(card.style.display==='none'){ card.style.display=''; }
    if(!ch.querySelector('.cardtog')){
      var btn=document.createElement('button'); btn.className='cardtog'; btn.title='접기/펴기'; btn.textContent='▾';
      var rbox=ch.querySelector('.r'); if(rbox)rbox.appendChild(btn); else ch.appendChild(btn);
      btn.onclick=function(ev){ ev.stopPropagation(); var c=!card.classList.contains('collapsed'); applyCollapse(card,c); CARDPREF.collapsed[id]=c; if(!c)delete CARDPREF.collapsed[id]; saveCardPref(); };
    }
    applyCollapse(card,CARDPREF.collapsed[id]);
  });
}
function openCardEditor(){
  var cards=$$('.card').filter(function(c){return c.querySelector('.ch h2');});
  // 중복 id 제거(대표 1개씩)
  var seen={}, list=[];
  cards.forEach(function(c){ var id=cardId(c), nm=c.querySelector('.ch h2').textContent.trim(); if(seen[id])return; seen[id]=1; list.push({id:id,nm:nm}); });
  var bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML='<div class="modal"><h3>⚙️ 화면 편집</h3><div class="msub">보고 싶은 항목만 켜두세요. 카드 제목의 ▾ 로 접을 수도 있어요.</div>'
    +list.map(function(x){return '<div class="edrow'+(CARDPREF.hidden[x.id]?'':' on')+'" data-id="'+x.id+'"><span class="sw"></span><span class="nm">'+x.nm+'</span></div>';}).join('')
    +'<div class="mfoot"><button class="mbtn" id="edReset">전체 켜기</button><button class="mbtn pri" id="edDone">완료</button></div></div>';
  document.body.appendChild(bg);
  bg.addEventListener('click',function(e){ if(e.target===bg)close(); });
  function close(){ bg.remove(); }
  $$('.edrow',bg).forEach(function(row){ row.onclick=function(){ var id=row.dataset.id; var on=row.classList.toggle('on');
    if(on)delete CARDPREF.hidden[id]; else CARDPREF.hidden[id]=1; saveCardPref(); initCards(); }; });
  $('#edReset',bg).onclick=function(){ CARDPREF.hidden={}; saveCardPref(); $$('.edrow',bg).forEach(function(r){r.classList.add('on');}); initCards(); };
  $('#edDone',bg).onclick=close;
}
window.openCardEditor=openCardEditor;

/* ═══════════ 오늘의 시장 한 줄 요약 (상단) ═══════════ */
function renderSummary(){
  var el=$('#marketSummary'); if(!el) return;
  if(CARDPREF.hidden['시장요약']){ el.innerHTML=''; return; }
  var ks=IDX.find(function(x){return x.nm==='KOSPI';})||{}, kq=IDX.find(function(x){return x.nm==='KOSDAQ';})||{};
  var b=FLOW.breadth||{}, up=b.up||0, dn=b.down||0;
  var mood=(ks.c||0)>=0.3?['강세','up','📈']:(ks.c||0)<=-0.3?['약세','down','📉']:['혼조','flat','➖'];
  var topCat=(getCats()||[]).slice().sort(function(a,b){return b.sc-a.sc;})[0];
  var topStk=(RADAR||[])[0];
  var breadthTxt=(up+dn)>0?('상승 '+up+' · 하락 '+dn):'';
  var line='오늘 시장은 '+mood[2]+' <span class="'+mood[1]+'">'+mood[0]+'</span>';
  if(ks.nm)line+=' · 코스피 <span class="'+cls(ks.c)+'">'+pctTxt(ks.c||0)+'</span>';
  el.innerHTML='<div class="msum" data-card="시장요약"><div class="hl">'+line+'</div>'
    +'<div class="chips">'
    +(breadthTxt?'<div class="chip">🌊 <small>등락</small> '+breadthTxt+'</div>':'')
    +(topCat?'<div class="chip" onclick="showView(\'market\')">🔥 <small>강한 업종</small> '+topCat.ic+' '+topCat.nm+' <span class="up">'+pctTxt(topCat.chg)+'</span></div>':'')
    +(topStk?'<div class="chip" onclick="openStock(\''+topStk.c+'\')">🎯 <small>RADAR 1위</small> '+topStk.n+' <span class="scorepill" style="min-width:0;padding:1px 6px">'+topStk.score+'</span></div>':'')
    +'</div></div>';
}
initCards(); renderSummary();
if(PROXY){ loadKisRadar(); loadKisMarket(); setInterval(loadKisRadar,60000); setInterval(loadKisMarket,60000); } // 실데이터: 1분마다 RADAR·MARKET 갱신
setInterval(fetchNews,300000);
