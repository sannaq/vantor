/* ═══════════════════════════════════════════════════════════
   VANTOR Pro — app.js
   - VANTOR DAY SCORE 100점 엔진 (스펙 §3~4)
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

/* ═══════════ VANTOR DAY SCORE 엔진 (100점) ═══════════ */
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
      useRealMkt=true; renderIdx(); renderFlow();
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
async function loadKisRadar(){
  if(!PROXY) return;
  try{
    var j=await fetch(PROXY+'/radar?mkt=KR&limit=40').then(function(r){return r.json();});
    if(j&&Array.isArray(j.stocks)&&j.stocks.length){
      // 이전 순위 저장 → 1분 순위변화(dRank) 계산
      var prev={}; RADAR.forEach(function(r){prev[r.c]=r.rank;});
      j.stocks.forEach(function(s){ s.ccy='KRW'; });
      KISUNIV=j.stocks; useReal=true; window._prevRank=prev;
      var db=$('#demoban'); if(db)db.style.display='none';
      var sm=$$('.disc'); // 데모 문구는 남겨도 무방
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
function renderStrongSectors(){
  var el=$('#strongSectors'); if(!el)return;
  var arr=CATS.slice().sort(function(a,b){return b.sc-a.sc;});
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
  $$('#homeRadar .rowbtn, #fullRadar .rowbtn').forEach(function(tr){ tr.onclick=function(){ SEL=RADAR.find(function(x){return x.c===tr.dataset.c;}); renderRadar(); renderQuickView(); }; }); // QuickView는 제자리 갱신(스크롤 유지)
  renderEtfToggle();
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
  var h=$('#homeCats'); if(h)h.innerHTML=CATS.slice(0,4).map(catCard).join('');
  var a=$('#allCats'); if(a)a.innerHTML=CATS.map(catCard).join('');
  var heat=$('#catHeat'); if(heat){ heat.innerHTML='<div class="heat">'+CATS.map(function(x){ var t=(x.sc-40)/55; var col='hsl('+(t*18)+','+(55+t*35)+'%,'+(58-t*16)+'%)'; return '<div class="h" style="background:'+col+'">'+x.sc+'<div class="hs">'+x.nm+'</div></div>'; }).join('')+'</div>'; }
  var cr=$('#catRank'); if(cr){ cr.innerHTML='<table><thead><tr><th class="l">순위</th><th class="l">업종</th><th>SCORE</th><th>1분 변화</th></tr></thead><tbody>'
    +CATS.map(function(x,i){return '<tr><td class="l"><span class="rank">'+(i+1)+'</span></td><td class="l">'+x.ic+' '+x.nm+'</td><td>'+x.sc+'</td><td>'+mvHtml(x.d)+'</td></tr>';}).join('')+'</tbody></table>'; }
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
    parts.push('<div style="font-size:12px;font-weight:800;margin:12px 0 4px">⚡ 매수/매도세</div>');
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
    parts.push('<div style="font-size:12px;font-weight:800;margin:14px 0 5px">🏦 투자자 순매수 <span style="color:var(--faint);font-weight:600">(당일 누적·주)</span></div>');
    inv.forEach(function(x){ var v=x[1], w=Math.round(Math.abs(v)/mx*49), pos=v>=0;
      parts.push('<div class="invbar"><span class="lbl">'+x[0]+'</span>'
        +'<div class="track"><div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:var(--line)"></div>'
        +'<div class="fill" style="'+(pos?('left:50%;width:'+w+'%;background:var(--up)'):('right:50%;width:'+w+'%;background:var(--down)'))+'"></div></div>'
        +'<span style="width:96px;text-align:right;font-weight:700;font-size:12px" class="'+cls(v)+'">'+(v>=0?'+':'')+v.toLocaleString('en-US')+'</span></div>'); });
  }
  if(!parts.length){ el.innerHTML=PROXY?'<div style="font-size:11px;color:var(--faint);padding:10px 0">수급 데이터 불러오는 중…</div>':''; return; }
  el.innerHTML='<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:2px">'+parts.join('')+'</div>';
}
function scoredOf(code){
  var r=RADAR.find(function(x){return x.c===code;}); if(r)return r;
  var s=(typeof ALLSTK!=='undefined'?ALLSTK:STK).find(function(x){return x.c===code;}); if(!s)return RADAR[0];
  var sc=aureumScore(s); return Object.assign({},s,{score:sc.total,g:sc.groups,reasons:sc.reasons,grade:sc.grade,rank:'-',dRank:0});
}
function priceFmt(r,v){ if(v==null)v=r.px; return r.ccy==='USD'?('$'+(+v).toLocaleString('en-US',{maximumFractionDigits:2})):won(v); }
function backToBrowse(){ var _is=$('#idxstrip'); if(_is)_is.style.display=''; var _db=$('#demoban'); if(_db&&!useReal)_db.style.display=''; renderStockBrowse(); window.scrollTo(0,_stkScroll); }
window.backToBrowse=backToBrowse;
/* ═══════════ 종목 상세 실데이터 보강 (/candles·/info·/flow·/orderbook) ═══════════
   스펙 §0-1(기존 기능 보존): 프록시 미연결·조회 실패 시 데모 화면을 그대로 두고,
   응답이 도착한 항목만 제자리에서 교체한다. 종목을 바꾸면 이전 응답은 버린다. */
let _enrichSeq=0, _realParts={};
var _chartTF='D';
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
             foreign:j.foreign,inst:j.inst,retail:j.retail,approx:j.strengthApprox};
    renderPressureFlow(r);
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
  var relNews=(_lastNews||[]).filter(function(x){return x.title.indexOf(r.n)>-1;}); if(relNews.length<3)relNews=(_lastNews||[]).slice(0,5);
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
          +'<div class="tfbar" id="tfBar">'
            +['1|1분','5|5분','D|일','W|주','M|월'].map(function(t){var p=t.split('|');return '<button data-tf="'+p[0]+'"'+(p[0]===_chartTF?' class="on"':'')+'>'+p[1]+'</button>';}).join('')
          +'</div>'
          +'<canvas class="schart" id="sChart"></canvas>'
          +'<div id="chartCap" style="font-size:11px;color:var(--faint);margin-top:6px">불러오는 중…</div>'
          +'<div id="pressureFlow"></div>'
        +'</div>'
        +'<div id="stab-flow" style="display:none"></div>'
        +'<div id="stab-book" style="display:none"></div>'
        +'<div id="stab-score" style="display:none"></div>'
      +'</div>'
      +'<div>'
        +'<div class="card"><div class="ch"><h2>VANTOR SCORE</h2></div><div class="pad" style="padding-top:12px">'
          +'<div style="display:flex;align-items:center;gap:16px"><div class="ring" style="background:conic-gradient(var(--gold) '+gaugeDeg+'deg, var(--line) 0)"><div class="rc"><b>'+r.score+'</b><br><span>/100</span></div></div>'
            +'<div><div style="font-size:18px;font-weight:800" class="'+grd[1]+'">'+grd[0]+'</div><div style="font-size:12px;color:var(--sub);margin-top:3px;line-height:1.4">'+(r.score>=80?'모멘텀·수급이 강하고 단기 추세가 살아있는 종목':'추세·수급을 함께 확인하며 접근')+'</div></div></div>'
          +'<div class="subs">'+Object.keys(subs).map(function(k){var v=subs[k];var g=gradeTxt(v);return '<div class="sub"><div class="sk">'+k+'</div><div class="sv">'+v+'</div><div class="sg '+g[1]+'">'+g[0]+'</div></div>';}).join('')+'</div>'
        +'</div></div>'
        +'<div class="card" style="margin-top:16px"><div class="ch"><h2>📰 관련 뉴스</h2></div><div class="pad" style="padding-top:8px"><div class="nlist">'
          +relNews.slice(0,5).map(function(x){return '<a href="'+x.link+'" target="_blank" rel="noopener"><span class="tm">'+relTime(x.t)+'</span><span class="tt">'+esc(x.title)+'</span></a>';}).join('')+'</div></div></div>'
        +'<div class="card" style="margin-top:16px"><div class="ch"><h2>🔎 비교 종목</h2></div><div class="pad" style="padding-top:8px">'
          +peers.map(function(p){return '<div class="cmprow"><span>'+p.n+'</span><span><span class="'+cls(p.ch)+'" style="font-weight:700">'+pctTxt(p.ch)+'</span> <span class="scorepill'+(p.score>=80?'':' s2')+'" style="margin-left:8px">'+p.score+'</span></span></div>';}).join('')+'</div></div>'
      +'</div>'
    +'</div>'
    +'<div class="disc" id="stkDisc" style="margin-top:18px">🧪 차트·거래대금·시총·수급은 데모 값입니다. 시세 프록시 연결 시 실시간 시세·호가·투자자 수급이 채워집니다.</div>';
  drawStockChart($('#sChart'),r);
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
  enrichStock(r); // 실데이터 보강(비동기) — 실패해도 위 데모 화면 유지
  var _is=$('#idxstrip'); if(_is)_is.style.display='none'; var _db=$('#demoban'); if(_db)_db.style.display='none'; // 상세 땐 시장 지수 스트립 숨김 → 상세가 네비 바로 아래
  window.scrollTo(0,0);
}

/* ═══════════ 네비게이션 ═══════════ */
function showView(v,noScroll){
  $$('.view').forEach(function(x){x.classList.remove('on');});
  var el=$('#v-'+v); if(el)el.classList.add('on');
  if(!coinMode){ var _is=$('#idxstrip'); if(_is)_is.style.display=''; var _db=$('#demoban'); if(_db&&!useReal&&!useRealMkt)_db.style.display=''; }
  $$('#menu a').forEach(function(a){a.classList.toggle('on',a.dataset.v===v);});
  if(v==='news')fetchNews();
  if(v==='stock'&&!noScroll)renderStockBrowse();
  if(v==='watch')renderWatch();
  if(!noScroll)window.scrollTo({top:0,behavior:'smooth'});
}
let _stkScroll=0;
let stkMkt='KR';
function renderStockBrowse(){
  var el=$('#stockPanel'); if(!el)return;
  var list=(stkMkt==='US'?USTK:STK);
  el.innerHTML='<div class="sec-title" style="font-size:22px">🔎 종목 분석</div><p class="sec-sub">종목을 선택하면 VANTOR SCORE·수급·차트 분석을 봅니다. 검색창에서 종목명·코드로도 찾을 수 있어요.</p>'
    +'<div style="display:flex;gap:6px;margin-bottom:14px"><button class="ibtn sbm" data-m="KR" style="width:auto;padding:0 15px;border:1px solid '+(stkMkt==='KR'?'var(--gold)':'var(--line)')+';border-radius:20px;font-weight:800;font-size:13px'+(stkMkt==='KR'?';color:var(--gold)':'')+'">🇰🇷 국내</button><button class="ibtn sbm" data-m="US" style="width:auto;padding:0 15px;border:1px solid '+(stkMkt==='US'?'var(--gold)':'var(--line)')+';border-radius:20px;font-weight:800;font-size:13px'+(stkMkt==='US'?';color:var(--gold)':'')+'">🇺🇸 미국</button></div>'
    +'<div style="overflow-x:auto"><table><thead><tr><th class="l">종목</th><th>현재가</th><th>등락률</th><th>VANTOR SCORE</th></tr></thead><tbody>'
    +list.map(function(s){var r=scoredOf(s.c);return '<tr class="rowbtn" data-c="'+s.c+'"><td class="l"><div class="sym">'+s.n+'<small>'+s.c+' · '+s.mk+'</small></div></td><td class="num">'+priceFmt(s,s.px)+'</td><td class="'+cls(s.ch)+'" style="font-weight:700">'+pctTxt(s.ch)+'</td><td><span class="scorepill'+(r.score>=80?'':' s2')+'">'+r.score+'</span></td></tr>';}).join('')+'</tbody></table></div>'
    +'<div style="font-size:11px;color:var(--faint);margin-top:10px">🧪 데모 데이터 · 미국은 크립토처럼 즉시 실시간화 가능, 국내는 시세 프록시 연결 시 실시간. 국내 종목은 RADAR·수급까지 완전 연동됩니다.</div>';
  $$('#stockPanel .rowbtn').forEach(function(tr){tr.onclick=function(){openStock(tr.dataset.c);};});
  $$('#stockPanel .sbm').forEach(function(b){b.onclick=function(){stkMkt=b.dataset.m;renderStockBrowse();};});
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
$('#q').onkeydown=function(e){ if(e.key==='Enter'){ var t=this.value.trim().toLowerCase(); if(!t)return; var hit=ALLSTK.find(function(s){return s.n.toLowerCase().includes(t)||s.c.toLowerCase().includes(t);}); if(hit){ if(coinMode)setMode('stock'); openStock(hit.c); } } };

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
/* 코인 모드 = onexcore 터미널 통째로(VANTOR 색) */
function openCoinTerminal(){
  var v=$('#v-coin'); if(!v)return;
  v.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin:2px 0 12px"><span class="sec-title" style="font-size:20px;margin:0">🪙 코인 터미널</span><span style="color:var(--faint);font-size:12px">실시간 · 차트·타점·수급</span><a href="https://sannaq.github.io/onexcore-dashboard/" target="_blank" rel="noopener" class="more" style="margin-left:auto">↗ 전체화면</a></div>'
    +'<iframe id="coinFrame" src="https://sannaq.github.io/onexcore-dashboard/" style="width:100%;height:calc(100vh - 96px);min-height:640px;border:1px solid var(--line);border-radius:14px;background:var(--panel);display:block" title="VANTOR 코인 터미널" loading="eager"></iframe>';
}
$$('.segmode button').forEach(function(b){ b.onclick=function(){ setMode(b.dataset.m); }; });

/* ═══════════ 초기화 ═══════════ */
renderIdx(); renderTune(); renderRadar(); renderSmart(); renderFlow(); renderCats(); renderStrongSectors(); fetchNews(); updateWatchBadge();
if(PROXY){ loadKisRadar(); loadKisMarket(); setInterval(loadKisRadar,60000); setInterval(loadKisMarket,60000); } // 실데이터: 1분마다 RADAR·MARKET 갱신
setInterval(fetchNews,300000);
