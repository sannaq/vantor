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
  if(!Array.isArray(data))return '';
  data=data.map(Number).filter(function(v){return isFinite(v);}); // NaN·비수치 제거
  if(data.length<2)return ''; // 유효 데이터 2개 미만이면 NaN 좌표 방지
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
  {nm:'USD/KRW',v:1359.80,c:0.21,d:2.90,tr:[1357,1358,1357.5,1359,1360,1361,1360.4,1359.5,1359.8],val:'—',vol:'—',fx:true},
  {nm:'나스닥',v:0,c:0,d:0,tr:[],val:'—',vol:'QQQ',_us:true,etf:'QQQ',_real:false},
  {nm:'S&P500',v:0,c:0,d:0,tr:[],val:'—',vol:'SPY',_us:true,etf:'SPY',_real:false}
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
  inst:[['삼성전자',1102],['NAVER',587],['삼성바이오로직스',523],['현대모비스',412],['신한지주',378]],
  foreignSell:[['카카오',612],['LG화학',498],['POSCO홀딩스',421],['셀트리온',356],['크래프톤',298]],
  instSell:[['삼성SDI',534],['에코프로비엠',467],['카카오뱅크',389],['하이브',312],['넷마블',276]]
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
      useRealMkt=true; renderIdx(); renderFlow(); if(typeof renderSummary==='function')renderSummary(); if(typeof renderBriefing==='function')renderBriefing();
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
  if(typeof mountScan==='function')mountScan(el,'stock');
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
  surge.forEach(function(x){ if(x.ch>=5&&!_catchSeen[x.c]){ _catchSeen[x.c]=1; if(!coinMode)toast('🔥 '+x.n+' 급등 +'+(+x.ch).toFixed(1)+'%'); } });
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
  if(typeof renderBriefing==='function')renderBriefing();
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
    var badge=(!x._real&&!x._us)?' <span style="font-size:9px;font-weight:800;color:var(--gold);border:1px solid var(--gold);border-radius:4px;padding:0 4px;vertical-align:middle">데모</span>':(x._us?' <span style="font-size:9px;font-weight:800;color:var(--sub);border:1px solid var(--line);border-radius:4px;padding:0 4px;vertical-align:middle">ETF</span>':'');
    var valTxt=(x._us?'$':'')+(x.v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    var foot=x._us?('<span>미국 ETF</span><span>'+x.etf+' · 코인 상관</span>'):('<span>거래대금 '+x.val+'</span><span>'+(x.fx?'고가 1,363':'거래량 '+x.vol)+'</span>');
    return '<div class="idx"><div class="nm">'+x.nm+badge+'</div>'+(x.tr&&x.tr.length?sparkline(x.tr,96,44,col):'')
      +'<div class="v num '+pc+'">'+(x._us&&!x._real?'—':valTxt)+'</div>'
      +'<div class="d num '+pc+'">'+arw(x.c)+' '+Math.abs(x.d||0).toFixed(2)+' ('+pctTxt(x.c)+')</div>'
      +'<div class="foot">'+foot+'</div></div>';
  }).join('');
  // footer ticker
  var ft=$('#footTicker'); if(ft)ft.innerHTML=IDX.slice(0,2).map(function(x){return x.nm+' <span class="'+cls(x.c)+'">'+x.v.toLocaleString()+' '+arw(x.c)+pctTxt(x.c).replace('+','')+'</span>';}).join('');
}
/* 미국 지수(나스닥·S&P) — ETF(QQQ/SPY) 실데이터로 지수 스트립 채움. 코인↔나스닥 상관 참고용 */
function loadUsIdx(){
  if(!PROXY)return;
  fetch(PROXY+'/quotes?mkt=US&codes=QQQ,SPY').then(function(r){return r.json();}).then(function(q){
    if(!q||!q.quotes)return; var m={}; q.quotes.forEach(function(x){m[x.code]=x;});
    IDX.forEach(function(ix){ if(ix.etf&&m[ix.etf]&&m[ix.etf].px!=null){ var qq=m[ix.etf];
      ix.v=+qq.px; ix.c=+qq.c||0; ix.d=ix.v*(ix.c/100); ix._real=true;
      ix.tr=(ix.tr||[]).concat([ix.v]); if(ix.tr.length>9)ix.tr=ix.tr.slice(-9); } });
    renderIdx();
  }).catch(function(){});
}
/* SMART MONEY */
function renderSmart(){
  var el=$('#smartMoney'); if(!el)return; var side=window._smartSide||'buy', sell=(side==='sell');
  var tbl=function(rows){ return '<table><tbody>'+(rows||[]).map(function(r,i){return '<tr><td class="l"><span class="rank">'+(i+1)+'</span> '+r[0]+'</td><td class="'+(sell?'down':'up')+'" style="font-weight:700">'+(sell?'−':'+')+r[1].toLocaleString()+'억</td></tr>';}).join('')+'</tbody></table>'; };
  var tog=function(s,t){ var on=side===s; return '<button class="ibtn smtog" data-s="'+s+'" style="width:auto;padding:0 14px;border:1px solid '+(on?'var(--gold)':'var(--line)')+';border-radius:20px;font-weight:800;font-size:12.5px'+(on?';color:var(--gold)':'')+'">'+t+'</button>'; };
  var lbl=sell?'순매도':'순매수', fList=sell?SMART.foreignSell:SMART.foreign, iList=sell?SMART.instSell:SMART.inst;
  el.innerHTML='<div style="display:flex;gap:6px;margin-bottom:12px">'+tog('buy','순매수')+tog('sell','순매도')+'</div>'
    +'<div style="display:grid;gap:16px">'
    +'<div><div style="font-size:12px;font-weight:800;margin-bottom:5px">🌐 외국인 '+lbl+' TOP</div>'+tbl(fList)+'</div>'
    +'<div><div style="font-size:12px;font-weight:800;margin-bottom:5px">🏛️ 기관 '+lbl+' TOP</div>'+tbl(iList)+'</div></div>';
  el.querySelectorAll('.smtog').forEach(function(b){ b.onclick=function(){ window._smartSide=b.dataset.s; renderSmart(); }; });
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
/* 오더블럭: 강한 임펄스 직전의 반대 캔들(미체결만) → 되돌림 지지/저항 자리 */
function findOrderBlocks(cs,cur){ var n=cs.length; if(n<8)return []; var s=0; for(var i=0;i<n;i++)s+=(cs[i].h-cs[i].l); var avg=s/n; if(!(avg>0))return [];
  var bl=[],br=[]; for(var i=2;i<n-2;i++){ var a=cs[i],b=cs[i+1],bb=Math.abs(b.c-b.o);
    if(a.c<a.o&&b.c>b.o&&bb>avg*1.1&&b.c>a.h)bl.push({type:'bull',top:a.h,bottom:a.l,idx:i});
    if(a.c>a.o&&b.c<b.o&&bb>avg*1.1&&b.c<a.l)br.push({type:'bear',top:a.h,bottom:a.l,idx:i}); }
  function fresh(o){ for(var j=o.idx+2;j<n;j++){ if(o.type==='bull'&&cs[j].l<o.bottom)return false; if(o.type==='bear'&&cs[j].h>o.top)return false; } return true; }
  var out=[]; bl.filter(fresh).filter(function(o){return o.top<=cur;}).slice(-2).forEach(function(o){out.push(o);});
  br.filter(fresh).filter(function(o){return o.bottom>=cur;}).slice(-2).forEach(function(o){out.push(o);}); return out; }
/* ── ICT / 스마트머니(SMC) 탐지 — data=[o,h,l,c,v,ms] ── */
function _smcFVG(data){ var out=[],n=data.length,i,j; for(i=1;i<n-1;i++){ var a=data[i-1],c=data[i+1];
  if(a[1]<c[2]){ var bot=a[1],top=c[2],mit=false; for(j=i+2;j<n;j++){ if(data[j][2]<=bot){mit=true;break;} } out.push({type:'bull',i:i,top:top,bottom:bot,mit:mit}); }
  else if(a[2]>c[1]){ var top2=a[2],bot2=c[1],mit2=false; for(j=i+2;j<n;j++){ if(data[j][1]>=top2){mit2=true;break;} } out.push({type:'bear',i:i,top:top2,bottom:bot2,mit:mit2}); } }
  return out; }
function _smcSwings(data,L){ L=L||2; var sh=[],sl=[],n=data.length,i,k; for(i=L;i<n-L;i++){ var isH=true,isL=true; for(k=1;k<=L;k++){ if(data[i][1]<data[i-k][1]||data[i][1]<data[i+k][1])isH=false; if(data[i][2]>data[i-k][2]||data[i][2]>data[i+k][2])isL=false; } if(isH)sh.push({i:i,p:data[i][1]}); if(isL)sl.push({i:i,p:data[i][2]}); } return {sh:sh,sl:sl}; }
function _smcStructure(data){ var n=data.length, sw=_smcSwings(data,2), ev=[], shs=sw.sh, sls=sw.sl, si=0,li=0, lastH=null,lastL=null,trend=0,i;
  for(i=2;i<n;i++){ while(si<shs.length&&shs[si].i+2<=i){ lastH=shs[si]; si++; } while(li<sls.length&&sls[li].i+2<=i){ lastL=sls[li]; li++; }
    var c=data[i][3];
    if(lastH&&c>lastH.p){ ev.push({i:i,p:lastH.p,dir:'bull',kind:trend===-1?'CHoCH':'BOS',fromI:lastH.i}); trend=1; lastH=null; }
    else if(lastL&&c<lastL.p){ ev.push({i:i,p:lastL.p,dir:'bear',kind:trend===1?'CHoCH':'BOS',fromI:lastL.i}); trend=-1; lastL=null; } }
  return ev; }
function _smcLiquidity(data){ var sw=_smcSwings(data,2),n=data.length,i; var mx=-Infinity,mn=Infinity; for(i=0;i<n;i++){ if(data[i][1]>mx)mx=data[i][1]; if(data[i][2]<mn)mn=data[i][2]; } var tol=(mx-mn)*0.006||1; var out=[];
  function cl(list,type){ var used={},a,b; for(a=0;a<list.length;a++){ if(used[a])continue; var grp=[list[a]]; for(b=a+1;b<list.length;b++){ if(!used[b]&&Math.abs(list[b].p-list[a].p)<=tol){ grp.push(list[b]); used[b]=1; } } if(grp.length>=2){ var avg=0,i0=grp[0].i; grp.forEach(function(g){avg+=g.p;}); out.push({p:avg/grp.length,i0:i0,type:type}); } } }
  cl(sw.sh,'buy'); cl(sw.sl,'sell'); return out; }
function drawStockChart(cv,r){
  if(!cv)return; var ctx=cv.getContext('2d'); var rect=cv.getBoundingClientRect();
  cv.width=Math.round(rect.width*2); cv.height=cv.classList.contains('chartbig')?Math.max(360,Math.round((rect.height||520)*2)):520; // 확대(전체화면)는 실제 높이로
  function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
  var up=css('--up')||'#e5384d', dn=css('--down')||'#2f6bff', line=css('--line')||'#e7eaf0',
      sub=css('--sub')||'#8a94a6';
  if(r.mk==='COIN'){ up='#2ebd85'; dn='#f6465d'; } // 코인은 크립토 관례(초록↑/빨강↓)
  var LON=(r.mk==='COIN'&&window._coinLineOn)?window._coinLineOn:{sr:true,ch:true,tr:true,fib:true,poc:true,ma:true,ob:true,fvg:false,bos:false,liq:false,kz:false};
  var MA=[[5,'#f5a623'],[20,'#2f9e6e'],[60,'#8b5cf6']]; // 이동평균선 색
  var W=cv.width,H=cv.height; ctx.clearRect(0,0,W,H);
  var seed=parseInt(r.c,10)||1234; function rnd(){ seed=(seed*9301+49297)%233280; return seed/233280; }
  var n, data, last, real=false;
  if(r._candles&&r._candles.length>1){ // 프록시 /candles 실데이터: [ms,o,h,l,c,v]
    var _len=r._candles.length;
    var _visN=window._chartZoom?Math.max(20,Math.min(_len,window._chartZoom)):90; // 휠 줌 반영(코인·주식 공용)
    var _pan=window._chartPan?Math.max(0,Math.min(_len-_visN,window._chartPan)):0; // 드래그 팬(과거로 이동)
    var _end=_len-_pan, _start=Math.max(0,_end-_visN);
    data=r._candles.slice(_start,_end).map(function(k){ return [k[1],k[2],k[3],k[4],k[5]||0,k[0]]; }); // +ms
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
  if(window._chartYScale&&window._chartYScale!==1){ var _cen=(hi+lo)/2, _hr=(hi-lo)/2/window._chartYScale; lo=_cen-_hr; hi=_cen+_hr; } // 가격축 세로 확대/축소
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
  // ── ICT/SMC: 킬존(세션) · FVG · 유동성(EQH/EQL) ──
  if(LON.kz && data[0]&&data[0][5]){ var _span=data[n-1][5]-data[0][5]; if(_span>0&&_span<6*864e5){ var _kzHit={l:false,ny:false};
    for(var kk=0;kk<n;kk++){ var _hu=new Date(data[kk][5]).getUTCHours(), _z=(_hu>=7&&_hu<10)?'l':((_hu>=12&&_hu<15)?'ny':null); if(_z){ ctx.fillStyle='rgba(126,87,194,0.09)'; ctx.fillRect(xAt(kk)-cw/2,padT,cw,priceB-padT); if(!_kzHit[_z]){ _kzHit[_z]=true; ctx.font='700 12px system-ui,sans-serif'; ctx.fillStyle='rgba(126,87,194,0.85)'; ctx.textBaseline='top'; ctx.textAlign='left'; ctx.fillText(_z==='l'?'런던 KZ':'뉴욕 KZ', xAt(kk)-cw/2+2, padT+2); ctx.textBaseline='middle'; } } } } }
  if(LON.fvg){ _smcFVG(data).slice(-16).forEach(function(f){ if(f.i>=n)return; var yt=y(f.top),yb=y(f.bottom); if(yb<padT||yt>priceB)return; var x0=xAt(f.i)-cw/2, rgb=f.type==='bull'?'38,198,218':'236,64,166', al=f.mit?0.05:0.17; ctx.fillStyle='rgba('+rgb+','+al+')'; ctx.fillRect(x0,yt,plotR-x0,yb-yt); if(!f.mit){ ctx.strokeStyle='rgba('+rgb+',0.55)'; ctx.lineWidth=1; ctx.strokeRect(x0,yt,plotR-x0,yb-yt); ctx.font='700 11px system-ui,sans-serif'; ctx.fillStyle='rgba('+rgb+',0.95)'; ctx.textBaseline='middle'; ctx.textAlign='right'; ctx.fillText('FVG',plotR-3,(yt+yb)/2); ctx.textAlign='start'; } }); }
  if(LON.liq){ _smcLiquidity(data).forEach(function(L){ var yy=y(L.p); if(yy<padT||yy>priceB)return; var x0=xAt(L.i0); ctx.strokeStyle='rgba(255,167,38,0.9)'; ctx.setLineDash([2,3]); ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(x0,yy); ctx.lineTo(plotR,yy); ctx.stroke(); ctx.setLineDash([]); ctx.font='700 12px system-ui,sans-serif'; ctx.fillStyle='rgba(255,167,38,0.95)'; ctx.textBaseline='bottom'; ctx.textAlign='left'; ctx.fillText(L.type==='buy'?'유동성 EQH':'유동성 EQL', x0+2, yy-2); ctx.textBaseline='middle'; }); }
  // 오더블럭 존(임펄스 직전 반대 캔들 → 되돌림 지지/저항)
  if(LON.ob)findOrderBlocks(data.map(function(d){return {o:d[0],h:d[1],l:d[2],c:d[3]};}), last).forEach(function(ob){
    var yt=y(ob.top), yb=y(ob.bottom), ox=xAt(ob.idx)-cw/2, rgb=ob.type==='bull'?'22,163,116':'229,56,77';
    ctx.fillStyle='rgba('+rgb+',0.20)'; ctx.fillRect(ox,yt,plotR-ox,yb-yt);
    ctx.strokeStyle='rgba('+rgb+',0.95)'; ctx.lineWidth=2.4; ctx.setLineDash([6,4]); ctx.strokeRect(ox,yt,plotR-ox,yb-yt); ctx.setLineDash([]);
    var lb=(ob.type==='bull'?'OB 지지':'OB 저항'); ctx.font='800 15px system-ui,sans-serif'; ctx.textBaseline='top'; ctx.textAlign='left';
    var lw=ctx.measureText(lb).width+10; ctx.fillStyle='rgba('+rgb+',0.95)'; ctx.fillRect(ox,yt,lw,20);
    ctx.fillStyle='#fff'; ctx.fillText(lb, ox+5, yt+3); ctx.textBaseline='middle'; });
  // 캔들
  for(var j=0;j<n;j++){var d=data[j],x=xAt(j),rise=d[3]>=d[0],col=rise?up:dn;ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,y(d[1]));ctx.lineTo(x,y(d[2]));ctx.stroke();
    var yo=y(d[0]),yc=y(d[3]);ctx.fillRect(x-bw/2,Math.min(yo,yc),bw,Math.max(2,Math.abs(yc-yo)));}
  // 이동평균선
  ctx.lineWidth=2.2;
  if(LON.ma)MA.forEach(function(m,mi){ if(n<3)return; var e=emas[mi]; ctx.strokeStyle=m[1]; ctx.beginPath();
    for(var i=0;i<n;i++){ var x=xAt(i), yy=y(e[i]); if(i===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);} ctx.stroke(); });
  // BOS / CHoCH (구조 전환)
  if(LON.bos){ _smcStructure(data).slice(-8).forEach(function(ev){ var yy=y(ev.p), x0=xAt(ev.fromI), x1=xAt(ev.i), col=ev.dir==='bull'?'rgba(46,189,133,0.95)':'rgba(246,70,93,0.95)'; ctx.strokeStyle=col; ctx.setLineDash([5,3]); ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(x0,yy); ctx.lineTo(x1,yy); ctx.stroke(); ctx.setLineDash([]); ctx.font='800 13px system-ui,sans-serif'; ctx.fillStyle=col; ctx.textBaseline='bottom'; ctx.textAlign='center'; ctx.fillText(ev.kind, x1, yy-3); ctx.textBaseline='middle'; ctx.textAlign='start'; }); }
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
  // === 코인 분석선: 선물 터미널과 동일(지지/저항·피보·매물대 POC·회귀 채널·골드 추세선) ===
  if(r.mk==='COIN'){
    var pxf=function(p){ return '$'+(p>=1?(+p).toLocaleString('en-US',{maximumFractionDigits:2}):(+p).toPrecision(4)); };
    var hline=function(price,color,dash,label,align){ if(price<lo||price>hi)return; var yy=y(price);
      ctx.strokeStyle=color;ctx.lineWidth=1.3;ctx.setLineDash(dash||[]);ctx.globalAlpha=.9;
      ctx.beginPath();ctx.moveTo(padL,yy);ctx.lineTo(plotR,yy);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      if(label){ ctx.fillStyle=color;ctx.font='700 14px system-ui,sans-serif';ctx.textBaseline='middle';ctx.textAlign=align||'left';
        ctx.fillText(label, align==='right'?plotR-6:padL+5, yy-9); ctx.textAlign='left'; } };
    var _dlo=Math.min.apply(null,data.map(function(d){return d[2];})), _dhi=Math.max.apply(null,data.map(function(d){return d[1];}));
    // 지지/저항 (24h 고·저)
    if(LON.sr){ if(r.hi)hline(r.hi,'#f6465d',[6,5],'저항 '+pxf(r.hi),'left');
      if(r.lo)hline(r.lo,'#2ebd85',[6,5],'지지 '+pxf(r.lo),'left'); }
    // 피보나치 되돌림 0.382·0.5·0.618
    if(LON.fib)[[0.382,'0.382'],[0.5,'0.5'],[0.618,'0.618']].forEach(function(f){ hline(_dhi-f[0]*(_dhi-_dlo),'#a06bff',[4,4],'fib '+f[1],'left'); });
    // 매물대 POC (거래대금 프로파일)
    var _vw=(_dhi-_dlo)/24;
    if(LON.poc&&_vw>0){ var _vol=new Array(24).fill(0);
      for(var _vi=0;_vi<n;_vi++){ var _tp=(data[_vi][1]+data[_vi][2]+data[_vi][3])/3, _ix=Math.floor((_tp-_dlo)/_vw); if(_ix<0)_ix=0; if(_ix>23)_ix=23; _vol[_ix]+=data[_vi][4]; }
      var _mi=0; for(var _k=1;_k<24;_k++)if(_vol[_k]>_vol[_mi])_mi=_k;
      hline(_dlo+(_mi+0.5)*_vw,'#ff9800',[2,3],'매물대 POC','right'); }
    // 회귀 채널(파랑 2선)
    if(LON.ch){
    var _sx=0,_sy=0,_sxy=0,_sxx=0;
    for(var _ci=0;_ci<n;_ci++){ var _cc=data[_ci][3]; _sx+=_ci;_sy+=_cc;_sxy+=_ci*_cc;_sxx+=_ci*_ci; }
    var _den=n*_sxx-_sx*_sx, _slp=_den?(n*_sxy-_sx*_sy)/_den:0, _itc=(_sy-_slp*_sx)/n, _ab=-1e18,_be=1e18;
    for(var _c2=0;_c2<n;_c2++){ var _base=_itc+_slp*_c2; if(data[_c2][1]-_base>_ab)_ab=data[_c2][1]-_base; if(data[_c2][2]-_base<_be)_be=data[_c2][2]-_base; }
    var _diag=function(off,color,wid){ ctx.strokeStyle=color;ctx.lineWidth=wid;ctx.globalAlpha=.9;ctx.beginPath();
      for(var _di=0;_di<n;_di++){ var _yy=y(_itc+_slp*_di+off), _xx=xAt(_di); if(_di===0)ctx.moveTo(_xx,_yy); else ctx.lineTo(_xx,_yy); } ctx.stroke();ctx.globalAlpha=1; };
    _diag(_ab,'#4a9eff',1.4); _diag(_be,'#4a9eff',1.4);
    } // /LON.ch
    // 골드 스윙 추세선(피벗 기준)
    if(LON.tr){
    var _upT=data[n-1][3]>=data[0][3];
    var _piv=function(w,t){ var out=[]; for(var i=w;i<n-w;i++){ var ok=true; for(var j=i-w;j<=i+w;j++){ if(j===i)continue; if(t==='low'&&data[j][2]<data[i][2]){ok=false;break;} if(t==='high'&&data[j][1]>data[i][1]){ok=false;break;} } if(ok)out.push(i); } return out; };
    var _pv=_piv(4,_upT?'low':'high'); if(_pv.length<2)_pv=_piv(3,_upT?'low':'high');
    if(_pv.length>=2){ var _an=_pv[0];
      for(var _p=0;_p<_pv.length;_p++){ if(_upT){ if(data[_pv[_p]][2]<data[_an][2])_an=_pv[_p]; } else { if(data[_pv[_p]][1]>data[_an][1])_an=_pv[_p]; } }
      var _lat=null; for(var _m=_pv.length-1;_m>=0;_m--){ if(_pv[_m]>_an){_lat=_pv[_m];break;} }
      if(_lat==null){ var _idx=_pv.indexOf(_an); if(_idx>0){_lat=_an;_an=_pv[_idx-1];} }
      if(_lat!=null){ var _pa=_upT?data[_an][2]:data[_an][1], _pb=_upT?data[_lat][2]:data[_lat][1], _tslp=(_pb-_pa)/((_lat-_an)||1);
        ctx.strokeStyle='#e0a83e';ctx.lineWidth=2;ctx.globalAlpha=.95;ctx.beginPath();
        for(var _ti=_an;_ti<n;_ti++){ var _ty=y(_pa+_tslp*(_ti-_an)), _tx=xAt(_ti); if(_ti===_an)ctx.moveTo(_tx,_ty); else ctx.lineTo(_tx,_ty); } ctx.stroke();ctx.globalAlpha=1; }
    }
    } // /LON.tr
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
  // ── 사용자 그림(추세선·수평선·박스) + 드래그 미리보기 ──
  (function(){ function xT(t){ return (n<2)?padL:(padL+(t-data[0][5])/((data[n-1][5]-data[0][5])||1)*(plotR-padL)); }
    function shape(d,prev){ ctx.save(); ctx.strokeStyle=d.color||'#e0b552'; ctx.fillStyle=d.color||'#e0b552'; ctx.lineWidth=2; if(prev)ctx.globalAlpha=0.85;
      if(d.type==='hline'){ var yy=y(d.p); if(yy>=padT&&yy<=priceB){ ctx.beginPath();ctx.moveTo(padL,yy);ctx.lineTo(plotR,yy);ctx.stroke(); ctx.font='700 14px system-ui,sans-serif';ctx.textBaseline='bottom';ctx.textAlign='left'; ctx.fillText(r.ccy==='USD'?('$'+(+d.p).toFixed(2)):Math.round(d.p).toLocaleString('en-US'),padL+3,yy-2); ctx.textBaseline='middle'; } }
      else if(d.type==='trend'){ ctx.beginPath();ctx.moveTo(xT(d.t1),y(d.p1));ctx.lineTo(xT(d.t2),y(d.p2));ctx.stroke(); }
      else if(d.type==='box'){ var x1=xT(d.t1),x2=xT(d.t2),Y1=y(d.p1),Y2=y(d.p2),bx=Math.min(x1,x2),by=Math.min(Y1,Y2),bw2=Math.abs(x2-x1),bh2=Math.abs(Y2-Y1); ctx.setLineDash([5,3]); ctx.strokeRect(bx,by,bw2,bh2); ctx.setLineDash([]); ctx.globalAlpha=(prev?0.5:1)*0.07; ctx.fillRect(bx,by,bw2,bh2); ctx.globalAlpha=1; }
      ctx.restore(); }
    if(typeof _symDraws==='function'){ (_symDraws(r.c)||[]).forEach(function(d){ shape(d,false); }); }
    if(window._drawPreview&&window._drawPreview.cv===cv){ shape(window._drawPreview,true); }
  })();
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
  var amtfmt=function(a){ a=+a||0; if(isUS)return a>=1e9?'$'+(a/1e9).toFixed(2)+'B':(a>=1e6?'$'+(a/1e6).toFixed(1)+'M':'$'+Math.round(a).toLocaleString('en-US')); return a>=1e12?(a/1e12).toFixed(2)+'조':(a>=1e8?Math.round(a/1e8).toLocaleString('en-US')+'억':Math.round(a/1e4).toLocaleString('en-US')+'만'); };
  tip.innerHTML='<div style="font-weight:800;margin-bottom:3px;color:var(--ink)">'+dlabel+'</div>'
    +'<div class="tr"><span>시</span><b>'+fmt(d[0])+'</b></div>'
    +'<div class="tr"><span>고</span><b class="up">'+fmt(d[1])+'</b></div>'
    +'<div class="tr"><span>저</span><b class="down">'+fmt(d[2])+'</b></div>'
    +'<div class="tr"><span>종</span><b class="'+cls(chg)+'">'+fmt(d[3])+' ('+(chg>=0?'+':'')+chg.toFixed(2)+'%)</b></div>'
    +'<div class="tr"><span>량</span><b>'+vfmt(d[4])+'</b></div>'
    +'<div class="tr"><span>대금</span><b style="color:var(--gold)">'+amtfmt(d[4]*d[3])+'</b></div>'
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
  cv.addEventListener('mousemove',function(e){ if(window._chartPanning)return; if(window._drawTool&&window._drawTool!=='move')return; var i=crosshairIdx(e.clientX); if(i>=0)drawCrosshair(i); });
  cv.addEventListener('mouseleave',hideCrosshair);
  cv.addEventListener('click',function(e){ if(window._chartJustPanned){window._chartJustPanned=false;return;} if(window._drawTool&&window._drawTool!=='move')return; var i=crosshairIdx(e.clientX); if(i>=0)showCandleDetail(i); });
  cv.style.cursor='pointer';
  cv.addEventListener('touchstart',function(e){ if(e.touches[0]){var i=crosshairIdx(e.touches[0].clientX); if(i>=0){drawCrosshair(i);} } },{passive:true});
  cv.addEventListener('touchmove',function(e){ if(e.touches[0]){var i=crosshairIdx(e.touches[0].clientX); if(i>=0){drawCrosshair(i); e.preventDefault();} } },{passive:false});
  cv.addEventListener('touchend',hideCrosshair);
}
/* 🧭 진입 환경 컨플루언스(주식) — 매수세·체결강도·이평배열·추세·RSI·투자자수급 (교육용) */
function stockConfluence(r){ var el=$('#stkConf'); if(!el||!r)return;
  mountAskBox('#stkConf', function(){ return (typeof CHART!=='undefined'&&CHART&&CHART.r&&CHART.r.mk!=='COIN')?CHART.r:r; });
  var _cf=[], V=function(l,d,x){_cf.push({l:l,d:d,x:x});};
  var fl=r._flow||{}, bp=(fl.bp!=null?fl.bp:r.bidRatio), stg=(fl.strength!=null?fl.strength:r.strength);
  if(bp!=null)V('매수세(호가)', bp>=55?'long':(bp<=45?'short':'flat'), Math.round(bp)+'%');
  if(stg!=null)V('체결강도', stg>=100?'long':(stg<95?'short':'flat'), Math.round(stg)+(stg>=100?' 매수우위':stg<95?' 매도우위':' 중립'));
  var cs=(r._candles&&r._candles.length>20)?r._candles:null;
  if(cs){ var closes=cs.map(function(k){return +k[4];});
    var ma=function(p){ if(closes.length<p)return null; var s=0; for(var i=closes.length-p;i<closes.length;i++)s+=closes[i]; return s/p; };
    var m5=ma(5),m20=ma(20),m60=ma(60);
    if(m5&&m20&&m60){ var arr=(m5>m20&&m20>m60)?'long':((m5<m20&&m20<m60)?'short':'flat'); V('이평 배열', arr, arr==='long'?'정배열':arr==='short'?'역배열':'혼조'); }
    var n=closes.length,sx=0,sy=0,sxy=0,sxx=0,i2; for(i2=0;i2<n;i2++){sx+=i2;sy+=closes[i2];sxy+=i2*closes[i2];sxx+=i2*i2;} var den=n*sxx-sx*sx,sl=den?(n*sxy-sx*sy)/den:0; V('추세', sl>0?'long':(sl<0?'short':'flat'), sl>0?'우상향':sl<0?'우하향':'횡보');
    var rsi=(typeof _cRsi==='function')?_cRsi(closes,14):null; if(rsi!=null)V('RSI(14)', rsi<=35?'long':(rsi>=65?'short':'flat'), rsi.toFixed(0)+(rsi<=35?' 과매도':rsi>=65?' 과매수':' 중립'));
  }
  if(r.invest)V('투자자 수급', (r.invest==='both'||r.invest==='buy')?'long':(r.invest==='sell'?'short':'flat'), r.invest==='both'?'외인+기관 순매수':r.invest==='buy'?'순매수':r.invest==='sell'?'순매도':'중립');
  if(_cf.length<2){ el.innerHTML=''; return; }
  var lv=_cf.filter(function(f){return f.d==='long';}).length, sv=_cf.filter(function(f){return f.d==='short';}).length, tot=_cf.length;
  var env,ec; if(lv-sv>=2){env='매수 우호';ec='up';} else if(sv-lv>=2){env='매도 우호';ec='down';} else {env='중립·혼조';ec='';}
  var rows=_cf.map(function(f){var a=f.d==='long'?'<span class="up">▲ 매수</span>':f.d==='short'?'<span class="down">▼ 매도</span>':'<span style="color:var(--faint)">– 중립</span>';return '<div class="cfrow"><span style="color:var(--sub)">'+f.l+'</span><span>'+a+' <span style="color:var(--faint);font-size:11px">'+f.x+'</span></span></div>';}).join('');
  el.innerHTML='<div class="stkconf"><div class="cfhead">🧭 진입 환경 <span style="color:var(--faint);font-weight:400">(컨플루언스 · 교육용)</span> <span class="'+ec+'" style="margin-left:auto;font-weight:800">'+env+' '+Math.max(lv,sv)+'/'+tot+'</span></div>'+rows+'<div style="color:var(--faint);font-size:11px;margin-top:8px;line-height:1.5">근거가 몇 개나 겹치는지 보여주는 <b>교육용 참고</b>예요. 매수/매도 지시가 아닙니다 — 손절·비중과 함께 판단하세요.</div></div>';
}
window.stockConfluence=stockConfluence;
/* ── 차트 분석 도우미 (주식·코인 공용, 규칙기반 · 교육용 TA) ──
   answerChartHTML(r,q): r._candles[ms,o,h,l,c,v]를 읽어 교육용 브리핑 HTML 반환.
   1단계=규칙기반(무료·즉시). 2단계에서 window._askEngine='llm'로 두면 같은 창을 Worker LLM으로 대체 가능. */
function _taRead(r){ var cs=r&&r._candles; if(!cs||cs.length<20)return null;
  var closes=[],highs=[],lows=[],vols=[]; for(var i=0;i<cs.length;i++){ closes.push(+cs[i][4]); highs.push(+cs[i][2]); lows.push(+cs[i][3]); vols.push(+cs[i][5]||0); }
  var n=closes.length, px=r.px||closes[n-1];
  function ma(p){ if(n<p)return null; var s=0; for(var i=n-p;i<n;i++)s+=closes[i]; return s/p; }
  var m5=ma(5),m20=ma(20),m60=ma(60);
  var arr=(m5&&m20&&m60)?((m5>m20&&m20>m60)?'정배열':((m5<m20&&m20<m60)?'역배열':'혼조')):null;
  var sx=0,sy=0,sxy=0,sxx=0; for(var i=0;i<n;i++){sx+=i;sy+=closes[i];sxy+=i*closes[i];sxx+=i*i;} var den=n*sxx-sx*sx, sl=den?(n*sxy-sx*sy)/den:0;
  var span=(Math.max.apply(null,closes)-Math.min.apply(null,closes))||1, slPct=sl*n/span; var trend=slPct>0.15?'우상향':(slPct<-0.15?'우하향':'횡보');
  var rsi=(typeof _cRsi==='function')?_cRsi(closes,14):null;
  var resis=[],supp=[]; for(var i=2;i<n-2;i++){ if(highs[i]>=highs[i-1]&&highs[i]>=highs[i-2]&&highs[i]>highs[i+1]&&highs[i]>highs[i+2])resis.push(highs[i]); if(lows[i]<=lows[i-1]&&lows[i]<=lows[i-2]&&lows[i]<lows[i+1]&&lows[i]<lows[i+2])supp.push(lows[i]); }
  var look=Math.min(160,n), pHi=Math.max.apply(null,highs.slice(-look)), pLo=Math.min.apply(null,lows.slice(-look));
  var resAbove=resis.filter(function(v){return v>px*1.001;}).sort(function(a,b){return a-b;})[0]||pHi;
  var supBelow=supp.filter(function(v){return v<px*0.999;}).sort(function(a,b){return b-a;})[0]||pLo;
  var pos=Math.round((px-pLo)/((pHi-pLo)||1)*100);
  var vavg=0,vc=0; for(var i=Math.max(0,n-20);i<n;i++){vavg+=vols[i];vc++;} vavg=vc?vavg/vc:0; var vlast=vols[n-1];
  var volState=(vavg>0)?(vlast>vavg*1.4?'급증':(vlast<vavg*0.6?'위축':'보통')):'—';
  return {px:px,m5:m5,m20:m20,m60:m60,arr:arr,trend:trend,slPct:slPct,rsi:rsi,resAbove:resAbove,supBelow:supBelow,pos:pos,pHi:pHi,pLo:pLo,volState:volState,ccy:r.ccy};
}
function _askIntent(q){ q=(q||'').replace(/\s/g,'');
  if(/팔|매도|손절|익절|정리|던지|파는|팔까|처분|손실|물렸|익절/.test(q))return 'sell';
  if(/살|매수|진입|타점|담|사도|살까|추매|물타|들어가|분할매수|불타/.test(q))return 'buy';
  if(/버텨|버티|보유|홀딩|존버|들고|계속가|가져가/.test(q))return 'hold';
  return 'general';
}
function _askCost(q,ccy){ if(!/평단|평균|단가|샀|산가|매입|매수가|산.?가격|물린/.test(q))return null; var m=q.replace(/,/g,'').match(/([0-9]+(?:\.[0-9]+)?)\s*(억|만|천|달러|불|\$)?/); if(!m)return null; var v=+m[1], u=m[2]; if(u==='억')v*=1e8; else if(u==='만')v*=1e4; else if(u==='천')v*=1e3; return v; }
/* 미니 차트 SVG — 최근 캔들 + 지지·저항·현재가 라인 (답변에 이미지로 표시) */
function _miniChartSVG(r,t){ var cs=r&&r._candles; if(!cs||cs.length<5)return ''; var N=Math.min(50,cs.length), sl=cs.slice(-N);
  var W=340,H=150,PADL=6,PADR=46,PADT=8,PADB=8, cw=W-PADL-PADR, ch=H-PADT-PADB;
  var lo=Infinity,hi=-Infinity,i; for(i=0;i<sl.length;i++){ var l=+sl[i][3],h=+sl[i][2]; if(l<lo)lo=l; if(h>hi)hi=h; }
  lo=Math.min(lo,t.supBelow,t.px); hi=Math.max(hi,t.resAbove,t.px); var pad=(hi-lo)*0.06||1; lo-=pad; hi+=pad;
  var span=(hi-lo)||1; function y(p){ return PADT+(hi-p)/span*ch; } var bw=cw/N; function x(i){ return PADL+i*bw+bw/2; }
  var up='#f6465d', dn='#4a9eff'; if(r.mk==='COIN'){ up='#2ebd85'; dn='#f6465d'; }
  var s='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;max-width:440px;height:auto;display:block;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;margin:2px 0 10px">';
  for(i=0;i<sl.length;i++){ var o=+sl[i][1],hh=+sl[i][2],ll=+sl[i][3],c=+sl[i][4]; var col=c>=o?up:dn, cx=x(i), bwid=Math.max(1,bw*0.62); var yo=y(o),yc=y(c),top=Math.min(yo,yc),hgt=Math.max(1,Math.abs(yc-yo));
    s+='<line x1="'+cx.toFixed(1)+'" y1="'+y(hh).toFixed(1)+'" x2="'+cx.toFixed(1)+'" y2="'+y(ll).toFixed(1)+'" stroke="'+col+'" stroke-width="1"/>';
    s+='<rect x="'+(cx-bwid/2).toFixed(1)+'" y="'+top.toFixed(1)+'" width="'+bwid.toFixed(1)+'" height="'+hgt.toFixed(1)+'" fill="'+col+'"/>'; }
  function hline(p,color,label){ if(p<lo||p>hi)return ''; var yy=y(p); return '<line x1="'+PADL+'" y1="'+yy.toFixed(1)+'" x2="'+(W-PADR).toFixed(1)+'" y2="'+yy.toFixed(1)+'" stroke="'+color+'" stroke-width="1.2" stroke-dasharray="4 3"/><text x="'+(W-PADR+3)+'" y="'+(yy+3.2).toFixed(1)+'" fill="'+color+'" font-size="9.5" font-weight="800">'+label+'</text>'; }
  s+=hline(t.resAbove,'#f6465d','저항'); s+=hline(t.px,'#e0b552','현재'); s+=hline(t.supBelow,'#4a9eff','지지');
  return s+'</svg>'; }
/* 백테스트: 현재와 같은 '이평 배열' 구간이 과거에 N봉 뒤 어떻게 됐나(적중률·평균수익) — 검증용 */
function _condStats(r,t){ var cs=r&&r._candles; if(!cs||cs.length<45)return null; var cl=[],i; for(i=0;i<cs.length;i++)cl.push(+cs[i][4]); var n=cl.length, fwd=10;
  function ma(e,p){ if(e-p+1<0)return null; var s=0,j; for(j=e-p+1;j<=e;j++)s+=cl[j]; return s/p; }
  var regime=t.arr||'혼조', wins=0,tot=0,sum=0;
  for(i=25;i<n-fwd;i++){ var m5=ma(i,5),m20=ma(i,20); if(m5==null||m20==null)continue; var st=(m5>m20*1.001)?'정배열':((m5<m20*0.999)?'역배열':'혼조'); if(st!==regime)continue; var ret=(cl[i+fwd]-cl[i])/cl[i]*100; tot++; sum+=ret; var w=(regime==='정배열')?(ret>0):(regime==='역배열')?(ret<0):(Math.abs(ret)<1); if(w)wins++; }
  if(tot<8)return {n:tot,fwd:fwd,regime:regime,low:true,win:null};
  return {n:tot,fwd:fwd,regime:regime,win:Math.round(wins/tot*100),avg:sum/tot,low:tot<15}; }
/* 📌 방향 관점(bias) 계산 — 분석·스캔 공용. 근거 종합 교육용 요약(신호 아님) */
function _biasOf(t){ if(!t)return null; var dR=((t.resAbove-t.px)/t.px*100), dS=((t.px-t.supBelow)/t.px*100), s=0;
  s+=(t.trend==='우상향'?1:(t.trend==='우하향'?-1:0));
  s+=(t.arr==='정배열'?1:(t.arr==='역배열'?-1:0));
  if(t.rsi!=null){ if(t.rsi<=35)s+=0.5; else if(t.rsi>=65)s-=0.5; }
  if(t.pos>=80)s-=0.5; else if(t.pos<=20)s+=0.5;
  if(dS<=1.5)s+=0.5; if(dR<=1.5)s-=0.5;
  var label,cls; if(s>=1.5){label='매수 우호';cls='up';} else if(s<=-1.5){label='조정 주의';cls='down';} else {label='중립·관망';cls='';}
  return {score:s,label:label,cls:cls,dR:dR,dS:dS}; }
function answerChartHTML(r,q,opts){ opts=opts||{}; var t=_taRead(r); var ccy=r.ccy; var P=function(v){return fmtP(v,ccy);};
  var nm=(typeof esc==='function')?esc(r.n||r.c||''):(r.n||r.c||'');
  var imgNote=opts.img?'<div style="font-size:12px;line-height:1.6;background:rgba(224,181,82,.08);border:1px solid var(--line2);border-radius:10px;padding:9px 11px;margin-bottom:9px">📎 <b>첨부한 차트 사진</b>은 <b>AI 대화형(비전) 단계</b>에서 직접 읽어 분석해요. 지금(규칙기반)은 사진 속 차트를 읽지 못해서, 아래는 <b>지금 열려 있는 '+nm+' 실데이터</b> 기준 분석 + 어떤 차트든 공통으로 보는 체크리스트예요.</div>':'';
  var checklist=opts.img?'<div style="font-size:12px;line-height:1.7;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:10px 12px;margin-top:8px">📋 <b>차트 사진 볼 때 공통 체크</b><br>① <b>구조적 저점(무효화 라인)</b>이 어디인가 ② <b>지지·저항</b> 구간 ③ <b>추세·이평</b> 방향(정/역배열) ④ 움직임에 <b>거래량</b>이 실렸나 ⑤ 돌파면 <b>리테스트로 지지 전환</b>했나(가짜돌파 경계)</div>':'';
  if(!t){ var _minTf=(r._tf&&['1m','5m','15m','30m','1h','4h','1','3','5','10','15','30','60'].indexOf(r._tf)>=0); var _hint=(r.mk!=='COIN'&&_minTf)?' — 국내·해외 <b>분봉</b>은 <b>장중·당일 위주</b>라 봉 수가 적어요. <b>일봉</b>으로 보거나 장중에 다시 시도해 주세요.':' 잠시 후 다시 시도하거나 다른 봉으로 바꿔보세요.'; return imgNote+'<div style="color:var(--faint);font-size:12.5px;padding:4px 0">캔들 데이터가 부족해요'+_hint+'</div>'+checklist; }
  var intent=_askIntent(q), cost=_askCost(q,ccy), costMine=false;
  if(cost==null && opts.cost!=null && opts.cost>0){ cost=opts.cost; costMine=!!opts.costMine; }
  var dR=((t.resAbove-t.px)/t.px*100), dS=((t.px-t.supBelow)/t.px*100);
  var tc=t.trend==='우상향'?'up':(t.trend==='우하향'?'down':''), ac=t.arr==='정배열'?'up':(t.arr==='역배열'?'down':'');
  var rc=t.rsi==null?'':(t.rsi>=65?'down':(t.rsi<=35?'up':''));
  // 📌 방향 관점(bias) — 근거 종합. 매매 지시가 아니라 '어디로 더 기울어 있나' 교육용 요약.
  var _bo=_biasOf(t), bScore=_bo.score;
  var bias,bcls,bcond;
  if(bScore>=1.5){ bias='매수 우호'; bcls='up'; bcond='지지 '+P(t.supBelow)+' 위에서 눌림·반등 확인 관점 — 이 라인 이탈하면 무효.'; }
  else if(bScore<=-1.5){ bias='조정 주의'; bcls='down'; bcond='저항 '+P(t.resAbove)+' 부담·되돌림 주의 — 돌파 후 지지 전환하면 관점 바뀜.'; }
  else { bias='중립·관망'; bcls=''; bcond='박스권 — 저항 '+P(t.resAbove)+' 돌파 또는 지지 '+P(t.supBelow)+' 이탈이 방향키.'; }
  var biasBox='<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:11px 13px;margin-bottom:9px"><span style="font-weight:800;font-size:14px">📌 방향 관점</span><span class="'+bcls+'" style="font-weight:800;font-size:16px">'+bias+'</span><span style="flex-basis:100%;color:var(--sub);font-size:12.5px;line-height:1.5">'+bcond+' <span style="color:var(--faint)">· 근거 종합 교육용 관점, 매매 신호 아님</span></span></div>';
  var chip=function(k,v,c){ return '<div style="background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:9px;padding:7px 11px;min-width:84px"><div style="font-size:11.5px;color:var(--sub)">'+k+'</div><div style="font-weight:800;font-size:15px" class="'+(c||'')+'">'+v+'</div></div>'; };
  var chips='<div style="display:flex;gap:8px;flex-wrap:wrap;margin:9px 0">'
    +chip('추세',t.trend,tc)+chip('이평배열',t.arr||'—',ac)+chip('RSI(14)',t.rsi!=null?t.rsi.toFixed(0)+(t.rsi>=65?' 과매수':t.rsi<=35?' 과매도':''):'—',rc)
    +chip('거래량',t.volState,'')+chip('레인지 위치',t.pos+'%','')+'</div>';
  var lines='<div style="font-size:14px;line-height:2.0;margin-bottom:10px">'
    +'<div><span style="color:#f6465d;font-weight:700">🔴 저항</span> <b>'+P(t.resAbove)+'</b> <span style="color:var(--sub)">(+'+dR.toFixed(1)+'%) · 돌파·리테스트 시 상방</span></div>'
    +'<div style="color:var(--sub)">· 현재가 <b style="color:var(--ink,#e8ecf3);font-size:15px">'+P(t.px)+'</b></div>'
    +'<div><span style="color:#4a9eff;font-weight:700">🔵 지지</span> <b>'+P(t.supBelow)+'</b> <span style="color:var(--sub)">(−'+dS.toFixed(1)+'%) · 종가 이탈 시 추세 훼손(무효화)</span></div></div>';
  var _c2=function(title,items){ return '<div style="font-size:14px;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:12px 14px;margin-top:9px"><div style="font-weight:800;font-size:14.5px;margin-bottom:8px">'+title+'</div><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:7px;line-height:1.65">'+items.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div>'; };
  // 🆕 신규 진입 관점 (무포지션 기준)
  var ne=[];
  ne.push('관심 구간 — 지지 <b>'+P(t.supBelow)+'</b> 부근 눌림에서 <b>반등 캔들+거래량</b> 확인');
  ne.push('추격 주의 — 저항 <b>'+P(t.resAbove)+'</b> 바로 아래 추격은 손익비 불리');
  ne.push('손절=지지 소폭 아래 · 목표=저항 → <b>손익비로 수량 역산</b>(허용손실 ÷ (진입−손절))');
  if(bScore>=1.5)ne.push('현재 <b class="up">매수 우호</b> — 지지 지지력 확인되면 분할 접근 고려(교육용)');
  else if(bScore<=-1.5)ne.push('현재 <b class="down">조정 주의</b> — 반등이 저항서 막히는지 먼저 보고, 성급한 진입 주의');
  else ne.push('현재 <b>중립·관망</b> — 저항 돌파 or 지지 반등 <b>확인 후</b> 대응이 안전');
  // 💼 평단 보유 대응 (수익률·방향성)
  var hd=[];
  if(cost!=null){ var pnl=cost>0?((t.px-cost)/cost*100):0, pc=pnl>=0?'up':'down', pt=(pnl>=0?'+':'')+pnl.toFixed(1)+'%';
    hd.push('평단 <b>'+P(cost)+'</b>'+(costMine?' <span style="color:var(--faint);font-size:11px">(내 보유·기억됨)</span>':'')+' · 현재 <b>'+P(t.px)+'</b> → 평가 <b class="'+pc+'">'+pt+'</b> ('+(pnl>=0?'평가익':'평가손')+' 구간)');
    if(t.px>=cost){ hd.push('이익 보호 — 저항 <b>'+P(t.resAbove)+'</b> 부근 <b>분할 익절/트레일링 스탑</b> 관점'); hd.push('정리 기준 — 지지 <b>'+P(t.supBelow)+'</b> <b>종가 이탈</b> 시 상승 논리 훼손'); }
    else { hd.push('물타기 전 — 지지 <b>'+P(t.supBelow)+'</b> <b>사수 여부부터</b> (이탈 상태면 추매는 리스크 확대)'); hd.push('손절선 — 무효화 라인 아래로 <b>미리 정해두기</b>(감정 아니라 라인으로)'); hd.push('반등 시 대응 — 저항 <b>'+P(t.resAbove)+'</b>에서 <b>비중 조절</b> 관점도 교육적으로 존재'); } }
  else { hd.push('보유 중이라면 기준은 <b>무효화 라인 '+P(t.supBelow)+'</b> — <b>종가 이탈</b>이 정리 기준');
    hd.push('저항 <b>'+P(t.resAbove)+'</b>에서 분할 익절/트레일링으로 <b>이익 보호</b> 관점');
    hd.push('<span style="color:var(--sub)">질문에 <b>“평단 29만”</b>처럼 넣으면 평가익/손 기준 방향을 계산해줘요.</span>'); }
  var brief=_c2('🆕 신규 진입 시', ne)+_c2('💼 평단 보유 시 (대응 방향)', hd);
  var mini=(typeof _miniChartSVG==='function')?_miniChartSVG(r,t):'';
  var stat=(typeof _condStats==='function')?_condStats(r,t):null, statBox='';
  if(stat){ var reg=stat.regime||'혼조', dirWord=(reg==='정배열')?'상승':(reg==='역배열')?'하락':'횡보', ac=(reg==='정배열')?'up':(reg==='역배열'?'down':'');
    if(stat.win==null){ statBox='<div style="font-size:12px;color:var(--faint);background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;margin-bottom:9px">📊 <b>과거 통계</b> — 이 봉·이 종목 <b>'+reg+'</b> 구간 표본 '+stat.n+'회로 <b>부족</b>(신뢰도 낮음). 더 긴 봉으로 보면 표본이 늘어요.</div>'; }
    else { statBox='<div style="font-size:12.5px;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:10px 12px;margin-bottom:9px"><b>📊 이 조건의 과거 통계</b> <span style="color:var(--faint);font-size:11px">· 검증용</span><br>이 종목·봉의 <b>'+reg+'</b> 구간(표본 <b>'+stat.n+'</b>회) → <b>'+stat.fwd+'봉 뒤</b> '+dirWord+' <b>'+stat.win+'%</b> · 평균 <b class="'+ac+'">'+(stat.avg>=0?'+':'')+stat.avg.toFixed(1)+'%</b>'+(stat.low?' <span style="color:var(--faint)">(표본 적어 참고만)</span>':'')+'<div style="color:var(--faint);font-size:11px;margin-top:4px;line-height:1.5">과거 데이터 기반 <b>사후 통계</b> — 미래 수익을 보장하지 않아요.</div></div>'; } }
  var tfTag=(r._tfLabel)?'<div style="font-size:11.5px;color:var(--faint);margin-bottom:7px">📊 <b style="color:var(--sub)">'+nm+'</b> · <b style="color:var(--sub)">'+((typeof esc==='function')?esc(r._tfLabel):r._tfLabel)+' 봉</b> 기준 분석</div>':'';
  var jnTag=''; try{ if(typeof _cjLoad==='function'&&r.c){ var _mine=_cjLoad().filter(function(x){return (x.sym||'').toUpperCase()===String(r.c).toUpperCase()&&x.status==='closed'&&x.pnl!=null;}); if(_mine.length>=2){ var _w=_mine.filter(function(x){return x.pnl>0;}).length, _sp=_mine.reduce(function(s,x){return s+x.pnl;},0); jnTag='<div style="font-size:12px;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;margin-bottom:9px">📓 <b>내 과거 매매</b> — '+nm+' <b>'+_mine.length+'건</b> · 승률 <b>'+Math.round(_w/_mine.length*100)+'%</b> · 누적 <b class="'+(_sp>=0?'up':'down')+'">'+(_sp>=0?'+':'')+_sp.toFixed(1)+'%</b> <span style="color:var(--faint)">(일지 기준 · 참고용)</span></div>'; } } }catch(e){}
  return '<div style="color:var(--ink,#e8ecf3);font-size:13.5px">'+tfTag+jnTag+imgNote+biasBox+statBox+mini+chips+lines+brief+checklist
    +'<div style="font-size:11.5px;color:var(--sub);margin-top:9px;line-height:1.55">⚠ <b>교육용 기술적 분석</b> · 매매 지시나 수익 보장이 아니에요. 최종 판단은 손절·비중과 함께 본인이.</div></div>';
}
window.answerChartHTML=answerChartHTML;
/* 규칙기반 지표를 LLM에 넘길 짧은 컨텍스트 문자열 */
function _taContext(r){ try{ var t=_taRead(r); if(!t)return ''; var P=function(v){return fmtP(v,r.ccy);}; return (r.n||r.c||'')+' · 추세 '+t.trend+' · 이평 '+(t.arr||'—')+' · RSI '+(t.rsi!=null?t.rsi.toFixed(0):'—')+' · 저항 '+P(t.resAbove)+' · 지지 '+P(t.supBelow)+' · 레인지위치 '+t.pos+'%'; }catch(e){ return ''; } }
/* 2단계: 첨부 사진을 Worker /vision(Claude 비전)으로 보내 대화체 답변 받기 */
window.askVision=function(imgDataUrl,question,ctx){ var m=/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(imgDataUrl||''); if(!m)return Promise.reject(new Error('img')); if(typeof PROXY==='undefined'||!PROXY)return Promise.reject(new Error('proxy')); var payload={media_type:m[1],data:m[2].replace(/\s+/g,''),question:question||'이 차트 어때?',context:ctx||''}; return fetch(PROXY+'/vision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json();}); };
function _visionHTML(text){ var safe=(typeof esc==='function')?esc(text):text; safe=safe.replace(/\n{2,}/g,'<br><br>').replace(/\n/g,'<br>'); return '<div style="font-size:12.5px;line-height:1.7;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:11px 13px"><div style="font-weight:800;margin-bottom:7px">🤖 AI 차트 읽기 <span style="font-weight:500;font-size:11px;color:var(--faint)">교육용 · 사진 기반</span></div>'+safe+'</div>'; }
function _visionWarn(msg){ return '<div style="font-size:12px;color:var(--faint);margin-bottom:8px;line-height:1.5">⚠ AI 사진 분석을 아직 못 써요: '+((typeof esc==='function')?esc(msg):msg)+'<br>아래는 규칙기반 참고예요.</div>'; }
function _askHTML(){ return '<div class="askbox" style="border:1px solid var(--line2);border-radius:14px;padding:13px 14px;margin-top:14px;background:var(--panel,#0b111a)">'
  +'<div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:13.5px;margin-bottom:9px">🤖 차트 분석 도우미 <span style="font-weight:500;font-size:11px;color:var(--faint)">교육용 TA · 매매지시 아님</span></div>'
  +'<div style="display:flex;gap:7px;align-items:center"><button class="askClip" title="차트 사진 첨부" style="flex:0 0 auto;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;color:var(--sub);font-family:inherit;font-size:15px;cursor:pointer">📎</button><input class="askFile" type="file" accept="image/*" style="display:none"><input class="askQ" placeholder="예) 이 차트 어때? · 평단 4만인데 뭘 봐야 해? · 손절은 어디?" style="flex:1;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:10px 12px;color:var(--ink,#e8ecf3);font-family:inherit;font-size:13px;outline:none"><button class="askGo" style="background:var(--gold,#e0a83e);color:#1a1400;border:none;border-radius:10px;padding:0 16px;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer">분석</button></div>'
  +'<div class="askPrev" style="display:none;margin-top:8px"></div>'
  +'<div class="askChips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">'+['지금 자리 어때?','지지·저항 어디?','추세 어떤 상태?','진입 본다면?','손절 기준은?'].map(function(c){return '<button class="askChip" style="background:transparent;border:1px solid var(--line2);border-radius:20px;padding:5px 11px;color:var(--sub);font-family:inherit;font-size:11.5px;cursor:pointer">'+c+'</button>';}).join('')+'</div>'
  +'<div class="askAns" style="margin-top:10px"></div></div>'; }
function mountAskBox(anchorSel,getR){ var a=document.querySelector(anchorSel); if(!a)return; var box=a.nextElementSibling; if(!box||!box.classList||!box.classList.contains('askbox')){ var tmp=document.createElement('div'); tmp.innerHTML=_askHTML(); box=tmp.firstChild; a.parentNode.insertBefore(box,a.nextSibling); }
  if(box._wired)return; box._wired=true; var inp=box.querySelector('.askQ'), ans=box.querySelector('.askAns'), clip=box.querySelector('.askClip'), file=box.querySelector('.askFile'), prev=box.querySelector('.askPrev');
  if(clip&&file){ clip.onclick=function(){ file.click(); };
    file.onchange=function(){ var f=file.files&&file.files[0]; if(!f)return; if(!/^image\//.test(f.type||'')){ prev.style.display='block'; prev.innerHTML='<span style="color:var(--faint);font-size:12px">이미지 파일만 첨부할 수 있어요.</span>'; return; } if(f.size>8e6){ prev.style.display='block'; prev.innerHTML='<span style="color:var(--faint);font-size:12px">이미지가 너무 커요(8MB 이하로).</span>'; return; } var rd=new FileReader(); rd.onload=function(){ box._img=rd.result; prev.style.display='block'; prev.innerHTML='<div style="display:inline-flex;align-items:center;gap:8px;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:6px 8px"><img src="'+rd.result+'" style="height:44px;border-radius:6px;display:block"><span style="font-size:11.5px;color:var(--sub)">차트 사진 첨부됨 · 물어보면 함께 분석</span><button class="askImgX" title="첨부 제거" style="background:none;border:none;color:var(--faint);font-size:15px;cursor:pointer;padding:0 2px">✕</button></div>'; var x=prev.querySelector('.askImgX'); if(x)x.onclick=function(){ box._img=null; file.value=''; prev.style.display='none'; prev.innerHTML=''; }; }; rd.readAsDataURL(f); }; }
  function run(q){ q=(q||inp.value||'').trim(); var r=getR&&getR(); if(!r){ ans.innerHTML='<div style="color:var(--faint);font-size:12.5px">종목 데이터를 불러오는 중이에요. 잠시 후 다시.</div>'; return; } if(!q)q=box._img?'이 차트 어때?':'지금 자리 어때?';
    if(box._img && typeof askVision==='function'){ ans.innerHTML='<div style="color:var(--faint);font-size:12.5px">🤖 AI가 차트 사진 읽는 중…</div>'; askVision(box._img,q,_taContext(r)).then(function(j){ if(j&&j.text){ ans.innerHTML=_visionHTML(j.text); } else { ans.innerHTML=(j&&j.error?_visionWarn(j.error):'')+answerChartHTML(r,q,{img:true}); } }).catch(function(){ ans.innerHTML=answerChartHTML(r,q,{img:true}); }); return; }
    ans.innerHTML='<div style="color:var(--faint);font-size:12.5px">분석 중…</div>'; setTimeout(function(){ try{ ans.innerHTML=answerChartHTML(r,q,{}); }catch(e){ ans.innerHTML='<div style="color:var(--faint);font-size:12.5px">분석에 실패했어요. 다시 시도해 주세요.</div>'; } },40); }
  box.querySelector('.askGo').onclick=function(){ run(); };
  inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); run(); } });
  box.querySelectorAll('.askChip').forEach(function(b){ b.onclick=function(){ inp.value=b.textContent; run(b.textContent); }; });
}
window.mountAskBox=mountAskBox;
/* ── 메인(홈) 차트 분석 도우미 — 종목 입력/사진 첨부해서 홈에서 바로 분석 ── */
function _homeAskHTML(scope){ var ph=scope==='coin'?'코인 심볼 (예: BTC · ETH · SOL · 1000PEPE)':'종목명·코드 (예: 삼성전자 · 005930 · AAPL · TSLA)';
  var TFS=scope==='coin'?[['1h','1시간'],['5m','5분'],['15m','15분'],['4h','4시간'],['1d','일봉']]:[['D','일봉'],['5','5분'],['15','15분'],['30','30분'],['60','60분']];
  var tfRow='<div class="haTfs" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:9px"><span style="font-size:11.5px;color:var(--faint);font-weight:700">봉</span>'+TFS.map(function(t,i){var on=i===0;return '<button class="haTf'+(on?' on':'')+'" data-tf="'+t[0]+'" data-lab="'+t[1]+'" style="background:'+(on?'var(--gold,#e0a83e)':'transparent')+';color:'+(on?'#1a1400':'var(--sub)')+';border:1px solid var(--line2);border-radius:16px;padding:4px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">'+t[1]+'</button>';}).join('')+'<span style="font-size:11.5px;color:var(--faint);font-weight:700;margin-left:6px">내 평단</span><input class="haAvg" inputmode="decimal" placeholder="선택·기억됨" title="내 평균단가 — 한 번 넣으면 이 종목에 자동 반영·동기화" style="width:110px;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:16px;padding:4px 11px;color:var(--ink,#e8ecf3);font-family:inherit;font-size:12px;outline:none"></div>';
  return '<div class="card" style="margin-bottom:16px"><div class="ch"><h2>🤖 차트 분석 도우미 <span style="font-weight:600;color:var(--faint);font-size:12px">종목 입력 · 사진 첨부 · 교육용 TA</span></h2></div>'
  +'<div class="pad" style="padding-top:10px"><div class="askbox2">'
  +'<div style="display:flex;gap:7px;flex-wrap:wrap"><input class="haSym" placeholder="'+ph+'" style="flex:1;min-width:150px;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:10px 12px;color:var(--ink,#e8ecf3);font-family:inherit;font-size:13px;outline:none">'
  +'<div style="display:flex;gap:7px;flex:2;min-width:230px"><button class="haClip" title="차트 사진 첨부" style="flex:0 0 auto;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;color:var(--sub);font-size:15px;cursor:pointer">📎</button><input class="haFile" type="file" accept="image/*" style="display:none"><input class="haQ" placeholder="예) 이 차트 어때? · 평단 4만인데 뭘 봐야 해? · 손절은 어디?" style="flex:1;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:10px 12px;color:var(--ink,#e8ecf3);font-family:inherit;font-size:13px;outline:none"><button class="haGo" style="background:var(--gold,#e0a83e);color:#1a1400;border:none;border-radius:10px;padding:0 18px;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer">분석</button></div></div>'
  +tfRow
  +'<div class="haPrev" style="display:none;margin-top:8px"></div>'
  +'<div class="haChips" style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">'+['지금 자리 어때?','지지·저항 어디?','추세 어떤 상태?','진입 본다면?','손절 기준은?'].map(function(c){return '<button class="haChip" style="background:transparent;border:1px solid var(--line2);border-radius:20px;padding:6px 13px;color:var(--sub);font-family:inherit;font-size:12.5px;cursor:pointer">'+c+'</button>';}).join('')+'</div>'
  +'<div class="haAns" style="margin-top:12px;font-size:13.5px;color:var(--sub);line-height:1.65">종목/코인을 입력하고 질문하면, 그 차트의 <b>지지·저항·추세·RSI·거래량</b>을 자동으로 읽어 <b>교육용 브리핑</b>을 보여줘요. 사진(📎)만 넣어도 공통 체크리스트를 드려요. <b>매매 지시는 아니에요.</b></div>'
  +'</div></div></div>'; }
function _homeStockItem(raw){ raw=(raw||'').trim(); if(!raw)return null; var t=raw.toLowerCase(); var pool=((typeof RADAR!=='undefined'&&RADAR)?RADAR:[]).concat((typeof ALLSTK!=='undefined'&&ALLSTK)?ALLSTK:((typeof STK!=='undefined'&&STK)?STK:[]));
  var ex=pool.find(function(s){return (s.c||'').toLowerCase()===t||(s.n||'').toLowerCase()===t;}); if(ex)return ex;
  if(/^\d{6}$/.test(raw))return {c:raw,n:raw,ccy:'KRW',mk:'KR'};
  var part=pool.find(function(s){return (s.n||'').toLowerCase().indexOf(t)>=0||(s.c||'').toLowerCase().indexOf(t)>=0;}); if(part)return part;
  if(/^[A-Za-z][A-Za-z.\-]{0,5}$/.test(raw))return {c:raw.toUpperCase(),n:raw.toUpperCase(),ccy:'USD',mk:'NAS'}; return null; }
function homeResolve(scope,s,tf,lab){ if(scope==='coin'){ var sym=(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/USDT$/,''); if(!sym)return Promise.resolve(null); var F='https://fapi.binance.com/fapi/v1/'; var itv=tf||'1h';
    return Promise.all([ fetch(F+'klines?symbol='+sym+'USDT&interval='+itv+'&limit=200').then(function(r){return r.json();}).catch(function(){return null;}), fetch(F+'ticker/24hr?symbol='+sym+'USDT').then(function(r){return r.json();}).catch(function(){return null;}) ]).then(function(a){ var kl=a[0],tk=a[1]; if(!Array.isArray(kl)||!kl.length)return null; var candles=kl.map(function(k){return [k[0],+k[1],+k[2],+k[3],+k[4],+k[5]];}); var px=(tk&&tk.lastPrice)?+tk.lastPrice:candles[candles.length-1][4]; var ch=(tk&&tk.priceChangePercent!=null)?+tk.priceChangePercent:0; return {c:sym,n:sym,mk:'COIN',ccy:'USD',px:px,ch:ch,_candles:candles,_tf:itv,_tfLabel:lab||''}; }); }
  var it=_homeStockItem(s); if(!it)return Promise.resolve(null); if(typeof proxyJson!=='function')return Promise.resolve(null); var isUS=((it.ccy||'').toUpperCase()==='USD'); var stf=tf||'D'; var base='mkt='+(isUS?'US':'KR')+'&code='+encodeURIComponent(it.c)+(isUS?('&exch='+(typeof usExch==='function'?usExch(it.mk):'NAS')):'');
  return proxyJson('/candles?'+base+'&tf='+stf+'&limit=200').then(function(j){ if(!j||!j.candles||j.candles.length<2)return {__nodata:true,n:it.n||it.c,tf:stf,mk:it.mk}; var cs=j.candles,n=cs.length,px=+cs[n-1][4],prev=+cs[n-2][4]; return {c:it.c,n:it.n||it.c,mk:it.mk,ccy:isUS?'USD':'KRW',px:px,ch:prev?((px-prev)/prev*100):0,_candles:cs,_tf:stf,_tfLabel:lab||''}; }).catch(function(){return {__nodata:true,n:it.n||it.c,tf:stf,mk:it.mk};}); }
function mountHomeAsk(sel,scope){ var host=document.querySelector(sel); if(!host)return; if(!host._filled){ host.innerHTML=_homeAskHTML(scope); host._filled=true; }
  var box=host.querySelector('.askbox2'); if(!box||box._wired)return; box._wired=true;
  var sym=box.querySelector('.haSym'), q=box.querySelector('.haQ'), ans=box.querySelector('.haAns'), clip=box.querySelector('.haClip'), file=box.querySelector('.haFile'), prev=box.querySelector('.haPrev'), avgEl=box.querySelector('.haAvg');
  function _typedAvg(){ return parseFloat((((avgEl&&avgEl.value)||'')+'').replace(/[,\s]/g,''))||0; }
  function _costOpts(r){ var key=((r&&r.c)||sym.value||'').toUpperCase(); var ta=_typedAvg(); if(ta>0){ if(typeof _setHolding==='function')_setHolding(key,ta); return {cost:ta,costMine:true}; } var h=(typeof _getHolding==='function')?_getHolding(key):null; if(h&&h.avg>0){ if(avgEl&&!avgEl.value)avgEl.value=h.avg; return {cost:h.avg,costMine:true}; } return {}; }
  if(clip&&file){ clip.onclick=function(){file.click();};
    file.onchange=function(){ var f=file.files&&file.files[0]; if(!f)return; if(!/^image\//.test(f.type||'')){prev.style.display='block';prev.innerHTML='<span style="color:var(--faint);font-size:12px">이미지 파일만 첨부할 수 있어요.</span>';return;} if(f.size>8e6){prev.style.display='block';prev.innerHTML='<span style="color:var(--faint);font-size:12px">이미지가 너무 커요(8MB 이하).</span>';return;} var rd=new FileReader(); rd.onload=function(){ box._img=rd.result; prev.style.display='block'; prev.innerHTML='<div style="display:inline-flex;align-items:center;gap:8px;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:6px 8px"><img src="'+rd.result+'" style="height:44px;border-radius:6px;display:block"><span style="font-size:11.5px;color:var(--sub)">차트 사진 첨부됨 · 물어보면 함께 분석</span><button class="haImgX" style="background:none;border:none;color:var(--faint);font-size:15px;cursor:pointer;padding:0 2px">✕</button></div>'; var x=prev.querySelector('.haImgX'); if(x)x.onclick=function(){box._img=null;file.value='';prev.style.display='none';prev.innerHTML='';}; }; rd.readAsDataURL(f); }; }
  function run(qq){ qq=(qq||q.value||'').trim(); var s=(sym.value||'').trim();
    var fallCcy=scope==='coin'?'USD':'KRW';
    if(box._img && typeof askVision==='function'){ ans.innerHTML='<span style="color:var(--faint)">🤖 AI가 차트 사진 읽는 중…</span>';
      var go=function(ctx){ askVision(box._img, qq||'이 차트 어때?', ctx).then(function(j){ if(j&&j.text){ ans.innerHTML=_visionHTML(j.text); } else { ans.innerHTML=(j&&j.error?_visionWarn(j.error):'')+answerChartHTML({n:'',ccy:fallCcy}, qq||'이 차트 어때?', {img:true}); } }).catch(function(){ ans.innerHTML=answerChartHTML({n:'',ccy:fallCcy}, qq||'이 차트 어때?', {img:true}); }); };
      if(s){ homeResolve(scope,s,box._tf,box._tfLabel).then(function(r){ var co=_costOpts(r); var ctx=(r?_taContext(r):''); if(co.cost)ctx+=(ctx?' · ':'')+'내 평단 '+co.cost; go(ctx); }).catch(function(){ go(''); }); } else go(''); return; }
    if(!s){ ans.innerHTML='<span style="color:var(--faint)">종목/코인을 입력하거나 사진(📎)을 첨부해 주세요.</span>'; return; }
    ans.innerHTML='<span style="color:var(--faint)">'+((typeof esc==='function')?esc(s):s)+' · '+((box._tfLabel||'')||'')+' 분석 중…</span>';
    homeResolve(scope,s,box._tf,box._tfLabel).then(function(r){ if(!r){ ans.innerHTML='<span style="color:var(--faint)">‘'+((typeof esc==='function')?esc(s):s)+'’를 찾지 못했어요. '+(scope==='coin'?'심볼(예: BTC, SOL)로':'코드(예: 005930)나 정확한 종목명으로')+' 다시 시도해 주세요.</span>'; return; } if(r.__nodata){ var _min=r.tf&&['1m','5m','15m','30m','1h','4h','1','3','5','10','15','30','60'].indexOf(r.tf)>=0; ans.innerHTML='<span style="color:var(--faint)"><b>'+((typeof esc==='function')?esc(r.n):r.n)+'</b> · '+(box._tfLabel||r.tf)+'봉 데이터가 없어요.'+((_min&&r.mk!=='COIN')?' 국내·해외 <b>분봉</b>은 <b>장중·당일 위주</b>라, <b>일봉</b>으로 보거나 장중(09:00~15:30)에 다시 시도해 주세요.':' 잠시 후 다시 시도해 주세요.')+'</span>'; return; } ans.innerHTML=answerChartHTML(r, qq||'지금 자리 어때?', _costOpts(r)); if(typeof _appendFollowup==='function')_appendFollowup(ans,box,r); }).catch(function(){ ans.innerHTML='<span style="color:var(--faint)">데이터를 불러오지 못했어요. 잠시 후 다시.</span>'; }); }
  box._tf=(scope==='coin')?'1h':'D'; var _tfOn=box.querySelector('.haTf.on'); box._tfLabel=_tfOn?_tfOn.dataset.lab:'';
  var _tfBtns=box.querySelectorAll('.haTf');
  _tfBtns.forEach(function(b){ b.onclick=function(){ _tfBtns.forEach(function(x){ x.classList.remove('on'); x.style.background='transparent'; x.style.color='var(--sub)'; }); b.classList.add('on'); b.style.background='var(--gold,#e0a83e)'; b.style.color='#1a1400'; box._tf=b.dataset.tf; box._tfLabel=b.dataset.lab; if((sym.value||'').trim()||box._img)run(); }; });
  box.querySelector('.haGo').onclick=function(){ run(); };
  if(avgEl){ avgEl.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); run(); } }); avgEl.addEventListener('change',function(){ if((sym.value||'').trim())run(); }); }
  sym.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); run(); } });
  q.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); run(); } });
  box.querySelectorAll('.haChip').forEach(function(b){ b.onclick=function(){ q.value=b.textContent; run(b.textContent); }; });
}
window.mountHomeAsk=mountHomeAsk;
try{ mountHomeAsk('#aiAsk','stock'); }catch(e){}
/* ── 📡 관심종목 방향 스캔 (관심종목들 방향 관점 한눈에) ── */
function mountScan(host,scope){ if(!host||host.querySelector('.scGo'))return; var TFS=scope==='coin'?[['1h','1시간'],['15m','15분'],['4h','4시간'],['1d','일봉']]:[['D','일봉'],['15','15분'],['60','60분']];
  var wrap=document.createElement('div'); wrap.className='card'; wrap.style.marginBottom='14px';
  wrap.innerHTML='<div class="ch"><h2>📡 방향 스캔 <span style="font-weight:600;color:var(--faint);font-size:12px">관심종목 방향 관점 한눈에 · 교육용</span></h2></div>'
    +'<div class="pad" style="padding-top:10px"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><span style="font-size:11.5px;color:var(--faint);font-weight:700">봉</span>'+TFS.map(function(t,i){return '<button class="scTf'+(i===0?' on':'')+'" data-tf="'+t[0]+'" style="background:'+(i===0?'var(--gold,#e0a83e)':'transparent')+';color:'+(i===0?'#1a1400':'var(--sub)')+';border:1px solid var(--line2);border-radius:16px;padding:4px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">'+t[1]+'</button>';}).join('')+'<button class="scGo" style="margin-left:auto;background:var(--gold,#e0a83e);color:#1a1400;border:none;border-radius:10px;padding:6px 18px;font-family:inherit;font-weight:800;font-size:12.5px;cursor:pointer">스캔</button></div><div class="scRes" style="font-size:12.5px;color:var(--sub)">‘스캔’을 누르면 관심종목의 <b>방향 관점</b>을 한 번에 계산해요.</div></div>';
  var anchor=host.querySelector('.sec-sub'); if(anchor&&anchor.parentNode===host){ host.insertBefore(wrap,anchor.nextSibling); } else { host.insertBefore(wrap,host.firstChild); }
  var tf=TFS[0][0], tfBtns=wrap.querySelectorAll('.scTf');
  tfBtns.forEach(function(b){ b.onclick=function(){ tfBtns.forEach(function(x){x.classList.remove('on');x.style.background='transparent';x.style.color='var(--sub)';}); b.classList.add('on');b.style.background='var(--gold,#e0a83e)';b.style.color='#1a1400'; tf=b.dataset.tf; }; });
  var res=wrap.querySelector('.scRes'); wrap.querySelector('.scGo').onclick=function(){ runScan(scope,tf,res); };
}
function runScan(scope,tf,res){ var list=scope==='coin'?((typeof _coinFav==='function')?_coinFav():[]):((typeof WATCH!=='undefined'&&WATCH)?WATCH.slice():[]);
  if(!list.length){ res.innerHTML='<span style="color:var(--faint)">관심종목이 없어요. 목록·상세·RADAR에서 ☆(코인은 ★)로 담아보세요.</span>'; return; }
  list=list.slice(0,24); res.innerHTML='<span style="color:var(--faint)">'+list.length+'종목 스캔 중…</span>';
  function chunk(a,n){var o=[];for(var k=0;k<a.length;k+=n)o.push(a.slice(k,k+n));return o;} var chunks=chunk(list,6), done=[];
  (function next(ci){ if(ci>=chunks.length){ render(); return; }
    Promise.all(chunks[ci].map(function(sym){ return homeResolve(scope,sym,tf,'').then(function(r){ if(!r||r.__nodata||!r._candles)return {sym:sym,err:1}; var t=_taRead(r); if(!t)return {sym:sym,err:1}; return {sym:(r.n||sym),t:t,b:_biasOf(t),px:t.px,ccy:r.ccy}; }).catch(function(){return {sym:sym,err:1};}); }))
    .then(function(rc){ done=done.concat(rc); res.innerHTML='<span style="color:var(--faint)">'+done.length+'/'+list.length+' 스캔…</span>'; next(ci+1); }); })(0);
  function render(){ var ok=done.filter(function(x){return !x.err&&x.b;}); ok.sort(function(a,b){return b.b.score-a.b.score;}); var P=function(v,ccy){return fmtP(v,ccy);};
    var head='<div style="display:flex;font-size:11px;color:var(--faint);font-weight:700;padding:5px 9px;gap:8px"><span style="flex:1">종목</span><span style="width:72px;text-align:center">방향 관점</span><span style="width:52px;text-align:right">추세</span><span style="width:40px;text-align:right">RSI</span><span style="width:66px;text-align:right">현재가</span></div>';
    var rows=ok.map(function(x){ return '<div style="display:flex;align-items:center;gap:8px;padding:8px 9px;border-top:1px solid var(--line2)"><span style="flex:1;font-weight:700;font-size:13px">'+esc(x.sym)+'</span><span class="'+x.b.cls+'" style="width:72px;text-align:center;font-weight:800;font-size:12.5px">'+x.b.label+'</span><span class="'+(x.t.trend==='우상향'?'up':x.t.trend==='우하향'?'down':'')+'" style="width:52px;text-align:right;font-size:12px">'+x.t.trend+'</span><span style="width:40px;text-align:right;font-size:12px">'+(x.t.rsi!=null?x.t.rsi.toFixed(0):'—')+'</span><span style="width:66px;text-align:right;font-weight:700;font-size:12px">'+P(x.px,x.ccy)+'</span></div>'; }).join('');
    var nUp=ok.filter(function(x){return x.b.cls==='up';}).length, nDn=ok.filter(function(x){return x.b.cls==='down';}).length, errs=done.filter(function(x){return x.err;}).length;
    res.innerHTML='<div style="font-size:12px;color:var(--sub);margin-bottom:6px">매수 우호 <b class="up">'+nUp+'</b> · 중립 <b>'+(ok.length-nUp-nDn)+'</b> · 조정 주의 <b class="down">'+nDn+'</b> <span style="color:var(--faint)">(방향 관점순 정렬)</span></div><div style="border:1px solid var(--line2);border-radius:10px;overflow:hidden">'+head+rows+'</div>'+(errs?'<div style="font-size:11px;color:var(--faint);margin-top:6px">'+errs+'종목 데이터 없음(분봉·장마감 등)</div>':'')+'<div style="font-size:11px;color:var(--faint);margin-top:6px">📌 방향 관점 = 근거 종합 교육용 요약 · 매매 신호 아님</div>';
  }
}
window.mountScan=mountScan; window.runScan=runScan;
/* ── 💬 이어묻기 (분석 답변에 후속 대화, Gemini 텍스트) ── */
window.askText=function(q,ctx){ if(typeof PROXY==='undefined'||!PROXY)return Promise.reject(new Error('proxy')); return fetch(PROXY+'/vision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:q||'',context:ctx||''})}).then(function(r){return r.json();}); };
function _appendFollowup(ansEl,box,r){ if(!ansEl||!r||!r._candles)return; box._fuR=r; box._fuThread=[];
  var wrap=document.createElement('div'); wrap.style.marginTop='10px';
  wrap.innerHTML='<div class="fuThread" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px"></div><div style="display:flex;gap:7px"><input class="fuIn" placeholder="💬 이어서 질문 (예: 그럼 손절은? · 왜 조정 주의야?)" style="flex:1;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:9px 12px;color:var(--ink,#e8ecf3);font-family:inherit;font-size:13px;outline:none"><button class="fuGo" style="background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px;padding:0 15px;color:var(--ink,#e8ecf3);font-family:inherit;font-weight:800;font-size:13px;cursor:pointer">보내기</button></div>';
  ansEl.appendChild(wrap);
  var thread=wrap.querySelector('.fuThread'), inp=wrap.querySelector('.fuIn'), go=wrap.querySelector('.fuGo');
  function bubble(role,html){ var d=document.createElement('div'); d.style.cssText='font-size:12.5px;line-height:1.6;padding:9px 12px;border-radius:10px;border:1px solid var(--line2);'+(role==='u'?'background:rgba(224,181,82,.10);align-self:flex-end;max-width:92%':'background:var(--panel2,#0f151f)'); d.innerHTML=html; thread.appendChild(d); return d; }
  function send(){ var q=(inp.value||'').trim(); if(!q)return; inp.value=''; bubble('u',(typeof esc==='function')?esc(q):q); var load=bubble('a','<span style="color:var(--faint)">…</span>');
    var base=(typeof _taContext==='function')?_taContext(box._fuR):''; var hist=box._fuThread.map(function(t){return (t.role==='u'?'Q: ':'A: ')+t.text;}).join('\n'); var ctx='교육용 TA 대화. '+base+(hist?('\n이전 대화:\n'+hist):'');
    box._fuThread.push({role:'u',text:q}); if(box._fuThread.length>8)box._fuThread=box._fuThread.slice(-8);
    askText(q,ctx).then(function(j){ if(j&&j.text){ load.innerHTML=((typeof esc==='function')?esc(j.text):j.text).replace(/\n/g,'<br>'); box._fuThread.push({role:'a',text:j.text}); } else { load.innerHTML='<span style="color:var(--faint)">'+((j&&j.error)?('답변 실패: '+((typeof esc==='function')?esc(j.error):j.error)):'답변을 받지 못했어요(잠시 후 다시)')+'</span>'; } }).catch(function(){ load.innerHTML='<span style="color:var(--faint)">연결 실패 — 잠시 후 다시</span>'; }); }
  go.onclick=send; inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); send(); } });
}
/* ── ❓ 첫 사용 가이드/도움말 ── */
window.openHelp=function(){ var bg=document.createElement('div'); bg.className='modal-bg';
  var S=function(icon,t,b){ return '<div style="padding:9px 0;border-top:1px solid var(--line2)"><div style="font-weight:800;font-size:13.5px">'+icon+' '+t+'</div><div style="font-size:12.5px;color:var(--sub);line-height:1.6;margin-top:3px">'+b+'</div></div>'; };
  bg.innerHTML='<div class="modal" style="max-width:480px;max-height:82vh;overflow:auto"><h3>❓ VANTOR 가이드</h3><div class="msub">교육용 분석 도구예요. <b>매수/매도 지시가 아니라</b> "왜·어디를 보나"를 스스로 판단하는 근거를 모아줘요.</div><div style="padding:2px 20px 8px">'
    +S('🤖','차트 분석 도우미','상단 <b>🤖 분석</b> 탭. 종목·코인 입력(또는 📎 차트 사진)+질문 → 방향 관점·지지/저항·과거 통계·신규진입/평단 관점. <b>내 평단</b> 넣으면 기억되고, 답 아래에서 <b>이어묻기</b>도 돼요.')
    +S('📡','방향 스캔','<b>관심</b> 화면 상단. 관심종목 전체의 <b>방향 관점</b>을 한 표에.')
    +S('📊','과거 통계(백테스트)','분석에 나오는 "이 조건 과거 N봉 뒤 승률" — 그럴듯한 신호도 <b>실제로 맞았는지</b> 정직하게 보여줘요.')
    +S('🔥','청산맵','코인 메뉴. 레버리지 청산가가 몰린 <b>자석 구간</b> 추정(휠 확대·슈퍼바이셀). 추정 모델이에요.')
    +S('📓','매매일지','코인 상세에서 진입 기록·복기 → <b>내 매매 패턴</b>(손절 습관·손익비·연속손실)을 자동 점검.')
    +S('☁️','기기 간 동기화','우상단 ☁️. 코드 하나로 여러 PC·폰에서 관심종목·일지·평단 공유(계정 불필요).')
    +'</div><div class="mfoot"><button class="mbtn pri" id="hlClose">시작하기</button></div></div>';
  document.body.appendChild(bg); function close(){bg.remove();} bg.addEventListener('click',function(e){if(e.target===bg)close();}); bg.querySelector('#hlClose').onclick=close;
  try{localStorage.setItem('aurSeenHelp','1');}catch(e){} };
/* ── 🧪 자가진단 (핵심 순수함수 회귀 테스트) — #selftest 또는 콘솔 _selftest() ── */
window._selftest=function(){ var out=[],ok=0,fail=0; function A(name,cond){ out.push((cond?'✓':'✗')+' '+name); cond?ok++:fail++; }
  var cs=[],px=100; for(var i=0;i<120;i++){ px+=Math.sin(i/9)*1.2+(i>60?0.35:-0.05); var o=px-0.4,h=px+0.9,l=px-0.9,c=px; cs.push([i*3600000,o,h,l,c,1000+i]); }
  var r={c:'TEST',n:'TEST',mk:'COIN',ccy:'USD',px:cs[cs.length-1][4],_candles:cs};
  var t=(typeof _taRead==='function')?_taRead(r):null;
  A('_taRead 반환', !!t);
  if(t){ A('추세 값 유효', ['우상향','우하향','횡보'].indexOf(t.trend)>=0); A('저항>지지', t.resAbove>t.supBelow); A('RSI 0~100', t.rsi==null||(t.rsi>=0&&t.rsi<=100)); A('레인지위치 0~100', t.pos>=0&&t.pos<=100); }
  var b=(typeof _biasOf==='function'&&t)?_biasOf(t):null; A('_biasOf 라벨', !!b&&['매수 우호','중립·관망','조정 주의'].indexOf(b.label)>=0);
  var st=(typeof _condStats==='function'&&t)?_condStats(r,t):null; A('_condStats 반환', !!st);
  A('_askCost 만원 파싱', (typeof _askCost==='function')&&_askCost('평단 4만',' USD')===40000);
  A('_askCost 없으면 null', (typeof _askCost==='function')&&_askCost('지금 어때','USD')===null);
  A('_homeStockItem 코드', (typeof _homeStockItem==='function')&&(_homeStockItem('005930')||{}).c==='005930');
  A('answerChartHTML 문자열', (typeof answerChartHTML==='function')&&typeof answerChartHTML(r,'지금 자리 어때?',{})==='string');
  A('fmtP 통화', (typeof fmtP==='function')&&fmtP(1234,'USD').indexOf('$')===0);
  var msg=out.join('\n')+'\n\n'+ok+' 통과 · '+fail+' 실패';
  try{console.log('%c[VANTOR 자가진단]\n'+msg, fail?'color:#f6465d':'color:#2ebd85');}catch(e){}
  return {ok:ok,fail:fail,details:out}; };
/* ── ☁️ 간단 동기화 (동기화 코드 · 계정/비번 없음) ── */
var _SYNC_URL=(typeof PROXY!=='undefined'&&PROXY?PROXY:'')+'/sync';
var _SYNC_KEYS=['aurWatch','coinFav','coinAlerts','coinTrades','aurCards','aurtune','aurFont','aurFib','aurBrief','aurHideETF','aurtheme','coinLines','oxbal','oxlev','oxrisk','aurHoldings','aurDraw'];
/* 내 보유(평단) 저장 — 종목별 평단, 동기화됨 */
function _holdings(){ try{return JSON.parse(localStorage.getItem('aurHoldings')||'{}')||{};}catch(e){return {};} }
function _getHolding(key){ if(!key)return null; var h=_holdings()[String(key).toUpperCase()]; return (h&&h.avg>0)?h:null; }
function _setHolding(key,avg,qty){ if(!key||!(avg>0))return; try{ var m=_holdings(); m[String(key).toUpperCase()]={avg:+avg,qty:(qty>0?+qty:(m[String(key).toUpperCase()]||{}).qty||0),ts:Date.now()}; localStorage.setItem('aurHoldings',JSON.stringify(m)); }catch(e){} }
window._getHolding=_getHolding; window._setHolding=_setHolding;
function _syncCode(){ try{return localStorage.getItem('aurSyncCode')||'';}catch(e){return '';} }
function _syncCollect(){ var d={}; _SYNC_KEYS.forEach(function(k){ try{ var v=localStorage.getItem(k); if(v!=null)d[k]=v; }catch(e){} }); return {ver:1,ts:Date.now(),data:d}; }
function _syncHash(b){ try{return JSON.stringify(b.data);}catch(e){return '';} }
var _syncLast='';
function syncPush(cb){ var code=_syncCode(); if(!code||!_SYNC_URL){cb&&cb(null);return;} var blob=_syncCollect(); _syncLast=_syncHash(blob);
  fetch(_SYNC_URL+'?key='+encodeURIComponent(code),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(blob)}).then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){try{localStorage.setItem('aurSyncTs',String(j.ts||Date.now()));}catch(e){}} cb&&cb(j); }).catch(function(){ cb&&cb(null); }); }
function syncApply(blob){ if(!blob||!blob.data)return 0; var n=0; _SYNC_KEYS.forEach(function(k){ if(blob.data[k]!=null){ try{localStorage.setItem(k,blob.data[k]);n++;}catch(e){} } }); return n; }
function syncPull(code,cb){ code=code||_syncCode(); if(!code){cb&&cb(null);return;} fetch(_SYNC_URL+'?key='+encodeURIComponent(code)).then(function(r){return r.json();}).then(function(j){cb&&cb(j);}).catch(function(){cb&&cb(null);}); }
function _newSyncCode(){ var A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; function seg(){var s='';for(var i=0;i<4;i++)s+=A[Math.floor(Math.random()*A.length)];return s;} return 'VANTOR-'+seg()+'-'+seg()+'-'+seg(); }
setInterval(function(){ if(!_syncCode())return; if(_syncHash(_syncCollect())!==_syncLast)syncPush(); },20000);
window.addEventListener('beforeunload',function(){ var code=_syncCode(); if(!code)return; try{ var blob=_syncCollect(); if(_syncHash(blob)!==_syncLast&&navigator.sendBeacon){ navigator.sendBeacon(_SYNC_URL+'?key='+encodeURIComponent(code), new Blob([JSON.stringify(blob)],{type:'application/json'})); } }catch(e){} });
window.openSync=function(){ var code=_syncCode(); var bg=document.createElement('div'); bg.className='modal-bg';
  var ts=''; try{var t=+localStorage.getItem('aurSyncTs');if(t)ts=new Date(t).toLocaleString('ko-KR');}catch(e){}
  var inCss='flex:1;font-family:monospace;font-size:14px;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:10px 12px;color:var(--ink);outline:none';
  var body;
  if(code){ body='<div class="msub">이 기기는 아래 코드로 동기화 중이에요. <b style="color:var(--down)">코드를 아는 사람은 내 관심종목·일지에 접근할 수 있으니 남과 공유 금지.</b></div>'
    +'<div style="padding:0 20px"><div style="display:flex;gap:8px;align-items:center;margin:10px 0"><input id="syCode" readonly value="'+code+'" style="'+inCss+';font-weight:800;letter-spacing:1px"><button class="mbtn" id="syCopy">복사</button></div>'
    +(ts?'<div style="font-size:12px;color:var(--faint)">마지막 업로드 '+ts+'</div>':'')
    +'<div style="margin-top:14px;font-size:12.5px;color:var(--sub)">다른 기기에서 <b>같은 코드</b>를 입력하면 이 설정을 그대로 불러와요.</div>'
    +'<div style="display:flex;gap:8px;margin-top:8px"><input id="syIn" placeholder="다른 코드로 불러오기" style="'+inCss+'"><button class="mbtn" id="syLoad">불러오기</button></div></div>'; }
  else { body='<div class="msub">계정·비밀번호 없이 <b>코드 하나</b>로 여러 기기에서 관심종목·매매일지·설정을 공유해요.</div>'
    +'<div style="padding:0 20px"><button class="mbtn pri" id="syNew" style="width:100%;margin-bottom:12px">☁️ 동기화 코드 만들기</button>'
    +'<div style="font-size:12.5px;color:var(--sub);margin-bottom:6px">이미 코드가 있나요?</div>'
    +'<div style="display:flex;gap:8px"><input id="syIn" placeholder="예: VANTOR-ABCD-EFGH-JKLM" style="'+inCss+'"><button class="mbtn" id="syLoad">불러오기</button></div></div>'; }
  bg.innerHTML='<div class="modal" style="max-width:440px"><h3>☁️ 기기 간 동기화</h3>'+body+'<div id="syMsg" style="padding:8px 20px 2px;font-size:12px;color:var(--faint);min-height:16px"></div><div class="mfoot"><button class="mbtn" id="syClose">닫기</button></div></div>';
  document.body.appendChild(bg); function close(){bg.remove();}
  bg.addEventListener('click',function(e){if(e.target===bg)close();});
  var Q=function(s){return bg.querySelector(s);}; Q('#syClose').onclick=close;
  var msg=Q('#syMsg'); function say(t,c){msg.innerHTML=t;msg.style.color=c||'var(--faint)';}
  var cp=Q('#syCopy'); if(cp)cp.onclick=function(){ try{navigator.clipboard.writeText(code);say('복사됐어요 ✓','var(--up)');}catch(e){var i=Q('#syCode');i.select();try{document.execCommand('copy');}catch(_){}say('복사됨');} };
  var nw=Q('#syNew'); if(nw)nw.onclick=function(){ var c=_newSyncCode(); try{localStorage.setItem('aurSyncCode',c);}catch(e){} say('코드 생성 · 업로드 중…'); syncPush(function(j){ if(j&&j.ok){ close(); openSync(); } else say('업로드 실패 — 잠시 후 다시','var(--down)'); }); };
  var ld=Q('#syLoad'); if(ld)ld.onclick=function(){ var c=(Q('#syIn').value||'').trim().toUpperCase(); if(!/^[A-Z0-9-]{8,64}$/.test(c)){say('코드 형식을 확인하세요','var(--down)');return;} say(c+' 불러오는 중…'); syncPull(c,function(j){ if(j&&j.ok&&j.found&&j.data){ var n=syncApply(j.data); try{localStorage.setItem('aurSyncCode',c);}catch(e){} say(n+'개 항목 불러옴 · 새로고침…','var(--up)'); setTimeout(function(){location.reload();},800); } else if(j&&j.ok&&!j.found){ say('그 코드에 저장된 데이터가 없어요','var(--down)'); } else { say('불러오기 실패 — 코드를 확인하세요','var(--down)'); } }); };
};
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
    renderPressureFlow(r); renderWhy(r); if(typeof stockConfluence==='function')stockConfluence(r);
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
  _chartTF=tf; var cap=$('#chartCap'); window._chartPan=0; window._chartYScale=1; // 봉 전환 시 뷰 초기화
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
    renderPressureFlow(r); renderWhy(r); if(typeof stockConfluence==='function')stockConfluence(r);
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
            +'<button class="tfbtn2" title="차트 크게 보기" onclick="openChartFs()" style="margin-left:6px">⛶ 확대</button>'
            +(PROXY?'<span style="margin-left:auto;display:flex;align-items:center;gap:5px;font-size:10px;color:var(--faint);font-weight:700"><span id="liveDotChart" style="width:7px;height:7px;border-radius:50%;background:#16b364;box-shadow:0 0 5px #16b364;transition:opacity .4s"></span>LIVE 7초</span>':'')
          +'</div>'
          +'<div style="position:relative"><canvas class="schart" id="sChart"></canvas><div id="chartTip"></div></div>'
          +'<div id="chartCap" style="font-size:11px;color:var(--faint);margin-top:6px">불러오는 중…</div>'
          +'<div id="pressureFlow"></div>'
          +'<div id="stkConf"></div>'
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
        +'<div class="card" style="margin-top:16px"><div class="ch"><h2>🧭 왜 움직였나</h2></div><div class="pad" style="padding-top:10px"><div id="whyBox" style="font-size:13px;line-height:1.75;color:var(--sub)"></div><div style="font-size:11px;color:var(--faint);margin-top:8px">※ 규칙 기반 자동 요약 — 참고용, 매매 신호 아님</div></div></div>'
        +'<div class="card" style="margin-top:16px"><div class="ch"><h2>📰 관련 뉴스</h2><div class="r">'+(relCount?'<span style="color:var(--gold);font-weight:700">'+relCount+'건 연관</span>':'<span style="color:var(--faint)">시장 뉴스</span>')+'</div></div><div class="pad" style="padding-top:8px"><div class="nlist">'
          +relNews.slice(0,5).map(function(x){var rel=(x.title.indexOf(r.n)>-1||(newsCore(r.n).length>=2&&x.title.indexOf(newsCore(r.n))>-1));return '<a href="'+x.link+'" target="_blank" rel="noopener">'+(rel?'<span style="color:var(--gold);font-weight:800;font-size:10px;margin-right:4px">●연관</span>':'')+'<span class="tm">'+relTime(x.t)+'</span><span class="tt">'+esc(x.title)+'</span></a>';}).join('')+'</div></div></div>'
        +'<div class="card" style="margin-top:16px"><div class="ch"><h2>🔎 비교 종목</h2></div><div class="pad" style="padding-top:8px">'
          +peers.map(function(p){return '<div class="cmprow"><span>'+p.n+'</span><span><span class="'+cls(p.ch)+'" style="font-weight:700">'+pctTxt(p.ch)+'</span> <span class="scorepill'+(p.score>=80?'':' s2')+'" style="margin-left:8px">'+p.score+'</span></span></div>';}).join('')+'</div></div>'
      +'</div>'
    +'</div>'
    +'<div class="disc" id="stkDisc" style="margin-top:18px">🧪 차트·거래대금·시총·수급은 데모 값입니다. 시세 프록시 연결 시 실시간 시세·호가·투자자 수급이 채워집니다.</div>';
  window._chartZoom=Math.min(90,(r._candles&&r._candles.length)||90); window._chartPan=0; window._chartYScale=1; // 뷰 초기화
  drawStockChart($('#sChart'),r);
  renderWhy(r); if(typeof stockConfluence==='function')stockConfluence(r);
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
  _attachChartZoom($('#sChart')); // 휠 줌 + 드래그 팬
  enrichStock(r); // 실데이터 보강(비동기) — 실패해도 위 데모 화면 유지
  startDetailLive(r); // 열어둔 동안 15초마다 가격·매수매도세·투자자 자동 갱신
  var _is=$('#idxstrip'); if(_is)_is.style.display='none'; var _db=$('#demoban'); if(_db)_db.style.display='none'; // 상세 땐 시장 지수 스트립 숨김 → 상세가 네비 바로 아래
  window.scrollTo(0,0);
}

/* ═══════════ 네비게이션 ═══════════ */
function showView(v,noScroll){
  $$('.view').forEach(function(x){x.classList.remove('on');});
  var el=$('#v-'+v); if(el)el.classList.add('on');
  var _brf=$('#brief'); if(_brf)_brf.style.display=(!coinMode&&v==='home')?'':'none'; // 오늘의 브리핑은 HOME에서만
  if(!coinMode){ var _is=$('#idxstrip'); if(_is)_is.style.display=''; var _db=$('#demoban'); if(_db&&!useReal&&!useRealMkt)_db.style.display=''; }
  $$('#menu a').forEach(function(a){a.classList.toggle('on',a.dataset.v===v);});
  if(v!=='stock')stopDetailLive(); // 상세를 벗어나면 라이브 폴링 중단
  if(typeof initCards==='function')setTimeout(initCards,0); // 새로 보이는 카드에 접기 버튼 부여
  if(v==='news')fetchNews();
  if(v==='stock'&&!noScroll)renderStockBrowse();
  if(v==='watch')renderWatch();
  if(v==='learn')renderLearn();
  if(v==='market')renderHeatmap();
  if(v==='ai'&&typeof mountHomeAsk==='function')mountHomeAsk('#aiAsk','stock');
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
    if(cat==='KR'){ _lastNews=all.slice(); if(typeof renderBriefing==='function')renderBriefing(); }
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
    // 선물 터미널과 동일한 코인 유니버스(바이낸스 실시간 · 스테이블 없음)
    var COINU=[['BTC','비트코인'],['ETH','이더리움'],['SOL','솔라나'],['XRP','리플'],['DOGE','도지코인'],
      ['BNB','바이낸스코인'],['ADA','카르다노'],['AVAX','아발란체'],['LINK','체인링크'],['AAVE','AAVE'],
      ['NEAR','니어'],['UNI','유니스왑'],['SUI','SUI'],['TAO','TAO'],['BCH','비트코인캐시'],
      ['LTC','라이트코인'],['DOT','폴카닷'],['TRX','트론'],['ATOM','코스모스'],['ZEC','지캐시'],
      ['XLM','스텔라루멘'],['APT','앱토스'],['ARB','아비트럼'],['ICP','ICP'],['HBAR','HBAR'],
      ['ETC','이더리움클래식'],['1000SHIB','1000시바이누']];
    var all=await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr').then(function(r){return r.json();});
    if(!Array.isArray(all))throw 0;
    var mp={}; all.forEach(function(t){ mp[t.symbol]=t; });
    var rows=COINU.map(function(u){ var t=mp[u[0]+'USDT']; if(!t)return null;
      var px=+t.lastPrice, ch=+t.priceChangePercent, hi=+t.highPrice, lo=+t.lowPrice, qv=+t.quoteVolume;
      var rp=(hi>lo)?Math.round((px-lo)/(hi-lo)*100):50, st;
      if(ch<=-3)st='avoid'; else if(rp>=65)st='avoid'; else if(rp<=45)st='buy'; else st=(ch>=2?'buy':'wait');
      return {s:u[0],k:u[1],px:px,ch:ch,qv:qv,st:st}; }).filter(Boolean);
    if(!rows.length)throw 0; // 터미널과 동일한 고정 순서 유지(pill이 자연스럽게 섞이도록)
    var PILL={buy:['관심','#16b364','22,179,100'],wait:['관망','#e0a83e','224,168,62'],avoid:['주의','#f6465d','246,70,93']};
    rr.innerHTML='<thead><tr><th class="l">#</th><th class="l">코인</th><th>상태</th><th>가격</th><th>24h</th><th>거래대금</th></tr></thead><tbody>'
      +rows.map(function(c,i){ var p=PILL[c.st], col=cCol(c.ch);
        var _fav=(typeof isCoinFav==='function'&&isCoinFav(c.s));
        return '<tr class="rowbtn" data-sym="'+esc(c.s)+'" title="클릭 → 상세 차트"><td class="l"><span class="rank">'+(i+1)+'</span></td>'
          +'<td class="l"><div class="sym"><span class="cfav'+(_fav?' on':'')+'" data-sym="'+esc(c.s)+'" onclick="toggleCoinFav(\''+esc(c.s)+'\',event)" style="cursor:pointer;margin-right:5px;color:'+(_fav?'#f5b301':'var(--faint)')+'">'+(_fav?'★':'☆')+'</span>'+esc(c.s)+' <span style="color:#16b364;font-size:9px;font-weight:800;vertical-align:1px">●LIVE</span><small>'+esc(c.k)+'</small></div></td>'
          +'<td><span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:800;background:rgba('+p[2]+',.15);color:'+p[1]+'">'+p[0]+'</span></td>'
          +'<td class="num">'+coinPx(c.px)+'</td>'
          +'<td class="num" style="color:'+col+';font-weight:700">'+(c.ch>=0?'▲ +':'▼ ')+c.ch.toFixed(2)+'%</td>'
          +'<td class="num" style="color:var(--sub)">$'+fmtBig(c.qv)+'</td></tr>'; }).join('')+'</tbody>';
    $$('#coinRadar .rowbtn').forEach(function(tr){ tr.onclick=function(){ openCoin(tr.dataset.sym); }; });
    if($('#coinupd'))$('#coinupd').textContent='· '+nowHM()+' 실시간';
    // 코인 지표 카드(BTC/ETH/SOL) — 동일 바이낸스 실시간
    var cm=$('#coinMetrics'); if(cm){ var pk=function(sy){return mp[sy+'USDT'];};
      var cards=[['BTC','비트코인'],['ETH','이더리움'],['SOL','솔라나']].map(function(u){ var t=pk(u[0]); if(!t)return ''; var ch=+t.priceChangePercent, col=cCol(ch);
        return '<div class="idx"><div class="nm">'+u[0]+' · '+u[1]+'</div><div class="v num" style="color:'+col+'">'+coinPx(+t.lastPrice)+'</div><div class="d num" style="color:'+col+'">'+(ch>=0?'▲':'▼')+' '+Math.abs(ch).toFixed(2)+'%</div><div class="foot"><span>24h고 '+coinPx(+t.highPrice)+'</span><span>거래 $'+fmtBig(+t.quoteVolume)+'</span></div></div>'; }).join('');
      cm.innerHTML='<div class="idxstrip" style="margin-bottom:0">'+cards+'<div class="idx"><div class="nm">🪙 코인 RADAR</div><div class="v" style="color:var(--gold);font-size:22px">'+rows.length+'종목</div><div class="d" style="color:var(--sub)">바이낸스 실시간</div><div class="foot"><span>Binance</span><span>'+nowHM()+'</span></div></div></div>'; }
  }catch(e){ rr.innerHTML='<tbody><tr><td style="color:var(--faint);padding:14px">코인 데이터를 불러오지 못했어요(잠시 후 자동 재시도)</td></tr></tbody>'; }
  loadCoinMarket();
  loadSectors();
}
/* 🧭 섹터 히트 — 지금 돈이 도는 내러티브(CoinGecko 카테고리 · 24h). 4분 스로틀 */
var _lastSectors=0;
async function loadSectors(){ var el=$('#coinSectors'); if(!el)return;
  if(Date.now()-_lastSectors<240000 && el.querySelector('.secgrid'))return; // 4분 내 재조회 방지(레이트리밋)
  try{ var arr=await fetch('https://api.coingecko.com/api/v3/coins/categories').then(function(r){return r.json();});
    if(!Array.isArray(arr))throw 0; _lastSectors=Date.now();
    var WL=/(artificial intelligence|meme|defi|decentralized finance|real world|layer 1|layer 2|gaming|gamefi|depin|solana ecosystem|ethereum ecosystem|liquid staking|oracle|privacy|modular|restaking|payment|metaverse|derivatives|lending|perpetual|bitcoin ecosystem|data availability|zero knowledge|\bnft\b|\brwa\b|\bai\b|\bl1\b|\bl2\b)/i;
    var seen={}, cats=arr.filter(function(c){ if(c.market_cap_change_24h==null||!(c.market_cap>1.5e9)||!WL.test(c.name))return false; var key=c.name.toLowerCase().replace(/\s*\(.*\)/,''); if(seen[key])return false; seen[key]=1; return true; });
    cats.sort(function(a,b){return b.market_cap_change_24h-a.market_cap_change_24h;});
    var top=cats.slice(0,12);
    if(!top.length){ el.innerHTML='<div class="muted" style="font-size:12px;color:var(--faint)">섹터 데이터가 없어요</div>'; return; }
    el.innerHTML='<div class="secgrid">'+top.map(function(c){ var ch=c.market_cap_change_24h||0, col=cCol(ch);
      var tops=(c.top_3_coins_id||[]).slice(0,3).map(function(id){return (id||'').split('-')[0].toUpperCase();}).filter(Boolean).join(' · ');
      return '<div class="seccard"><div class="secname">'+esc(c.name.replace(/\s*\(.*\)/,''))+'</div><div class="secch" style="color:'+col+'">'+(ch>=0?'▲ +':'▼ ')+Math.abs(ch).toFixed(2)+'%</div><div class="sectop">'+esc(tops)+'</div><div class="secmc">시총 $'+fmtBig(c.market_cap)+'</div></div>'; }).join('')+'</div>';
    if($('#secupd'))$('#secupd').textContent='· '+nowHM();
  }catch(e){ if(!el.querySelector('.secgrid'))el.innerHTML='<div class="muted" style="font-size:12px;color:var(--faint)">섹터를 불러오지 못했어요(잠시 후 재시도)</div>'; }
}
window.loadSectors=loadSectors;
/* ===== 코인 모드 상단 메뉴(홈·RADAR·섹터·뉴스·관심·기초) ===== */
var _stockMenuHTML=null;
var _COIN_MENU='<a class="cmenu-a on" data-cs="home" onclick="coinNav(\'home\')">홈</a>'
  +'<a class="cmenu-a" data-cs="ai" onclick="coinNav(\'ai\')">🤖 분석</a>'
  +'<a class="cmenu-a" data-cs="radar" onclick="coinNav(\'radar\')">RADAR</a>'
  +'<a class="cmenu-a" data-cs="sector" onclick="coinNav(\'sector\')">섹터</a>'
  +'<a class="cmenu-a" data-cs="news" onclick="coinNav(\'news\')">뉴스</a>'
  +'<a class="cmenu-a" data-cs="watch" onclick="coinNav(\'watch\')">관심</a>'
  +'<a class="cmenu-a" data-cs="learn" onclick="coinNav(\'learn\')">기초</a>'
  +'<a class="cmenu-a" data-cs="bt" onclick="coinNav(\'bt\')">📼 백테스트</a>'
  +'<a class="cmenu-a" data-cs="flow" onclick="coinNav(\'flow\')">💥 흐름</a>'
  +'<a class="cmenu-a" data-cs="liq" onclick="coinNav(\'liq\')">🔥 청산맵</a>';
function _applyCoinMenu(on){ var menu=$('#menu'); if(!menu)return;
  if(on){ if(_stockMenuHTML===null)_stockMenuHTML=menu.innerHTML; menu.innerHTML=_COIN_MENU; menu.style.display='flex'; }
  else { if(_stockMenuHTML!==null){ menu.innerHTML=_stockMenuHTML; if(typeof bindNav==='function')$$('#menu a').forEach(bindNav); } menu.style.display='flex'; } }
function _ensureCoinSection(){ var s=$('#coinSection'); if(!s){ var host=$('#coinHost'); if(!host)return null; s=document.createElement('div'); s.id='coinSection'; s.style.display='none'; host.parentNode.insertBefore(s,host); } return s; }
window.coinNav=function(sec){ var body=$('#coinBody'), host=$('#coinHost'), sect=_ensureCoinSection(); if(!sect)return;
  if(sec==='liq'){ if(typeof openLiqMap==='function')openLiqMap(_coinCur||'BTC'); return; }
  if(typeof stopLiq==='function')stopLiq(); if(typeof stopFlow==='function')stopFlow(); // 다른 섹션으로 가면 엔진 정리
  $$('#menu .cmenu-a').forEach(function(a){ a.classList.toggle('on',a.dataset.cs===sec); });
  if(host){host.style.display='none';host.innerHTML='';}
  if(sec==='home'||sec==='radar'||sec==='sector'){ if(body)body.style.display=''; sect.style.display='none';
    if(sec==='radar'){ var c=$('#coinRadar'); if(c&&c.closest('.card'))c.closest('.card').scrollIntoView({behavior:'smooth',block:'start'}); else window.scrollTo({top:0,behavior:'smooth'}); }
    else if(sec==='sector'){ var s2=$('#coinSectors'); if(s2&&s2.closest('.card'))s2.closest('.card').scrollIntoView({behavior:'smooth',block:'start'}); }
    else window.scrollTo({top:0,behavior:'smooth'});
    return; }
  if(body)body.style.display='none'; sect.style.display=''; window.scrollTo({top:0,behavior:'smooth'});
  if(sec==='ai'){ sect.innerHTML='<div class="sec-title">🤖 차트 분석 도우미</div><p class="sec-sub">코인·종목을 입력하거나 <b>차트 사진(📎)</b>을 첨부해 물어보면, 지지·저항·추세·RSI를 읽어 <b>교육용</b>으로 분석해줘요. 매매 지시는 아니에요.</p><div id="aiAskCoin"></div>'; if(typeof mountHomeAsk==='function')mountHomeAsk('#aiAskCoin','coin'); return; }
  if(sec==='bt'){ if(typeof renderBacktestReplay==='function')renderBacktestReplay(sect); return; }
  if(sec==='flow'){ if(typeof renderFlowMarkers==='function')renderFlowMarkers(sect); return; }
  if(sec==='news')renderCoinNews(sect); else if(sec==='watch')renderCoinWatch(sect); else if(sec==='learn')renderCoinLearn(sect);
};
/* 관심 코인(즐겨찾기) */
function _coinFav(){ try{return JSON.parse(localStorage.getItem('coinFav')||'[]');}catch(e){return [];} }
function _coinFavSet(a){ try{localStorage.setItem('coinFav',JSON.stringify(a));}catch(e){} }
window.isCoinFav=function(sym){ return _coinFav().indexOf(sym)>=0; };
window.toggleCoinFav=function(sym,ev){ if(ev){ev.stopPropagation();} var f=_coinFav(), i=f.indexOf(sym); if(i>=0)f.splice(i,1); else f.push(sym); _coinFavSet(f); var on=f.indexOf(sym)>=0;
  document.querySelectorAll('.cfav[data-sym="'+sym+'"]').forEach(function(el){ el.classList.toggle('on',on); el.textContent=on?'★':'☆'; }); };
async function renderCoinWatch(el){ var f=_coinFav();
  var h='<div class="sec-title">⭐ 관심 코인</div><p class="sec-sub">코인 옆 <b>☆</b>를 눌러 추가한 종목을 실시간으로 봅니다.</p>';
  if(!f.length){ el.innerHTML=h+'<div class="card"><div class="pad" style="color:var(--faint);font-size:13px;padding:18px">아직 관심 코인이 없어요. <b>RADAR</b>나 <b>홈</b>에서 코인 옆의 <b>☆</b>를 눌러 추가하세요.</div></div>'; return; }
  el.innerHTML=h+'<div class="card"><div class="pad" id="cwList"><div class="muted" style="font-size:12px">불러오는 중…</div></div></div>';
  try{ var all=await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr').then(function(r){return r.json();}); var mp={}; all.forEach(function(t){mp[t.symbol]=t;});
    var rows=f.map(function(sym){ var t=mp[sym+'USDT']; if(!t)return ''; var ch=+t.priceChangePercent, col=cCol(ch);
      return '<div class="rowbtn" style="display:flex;justify-content:space-between;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line2);cursor:pointer" onclick="openCoin(\''+esc(sym)+'\')"><span><span class="cfav on" data-sym="'+esc(sym)+'" onclick="toggleCoinFav(\''+esc(sym)+'\',event)" style="cursor:pointer;color:#f5b301">★</span> <b>'+esc(sym)+'</b></span><span style="display:flex;gap:14px;align-items:center"><span class="num">'+coinPx(+t.lastPrice)+'</span><span class="num" style="color:'+col+';font-weight:700;min-width:66px;text-align:right">'+(ch>=0?'▲ +':'▼ ')+Math.abs(ch).toFixed(2)+'%</span></span></div>';
    }).join(''); var le=$('#cwList'); if(le)le.innerHTML=rows||'<div class="muted" style="font-size:12px">해당 코인 시세가 없어요</div>';
  }catch(e){ var le2=$('#cwList'); if(le2)le2.innerHTML='<div class="muted" style="font-size:12px">불러오지 못했어요</div>'; }
  if(typeof mountScan==='function')mountScan(el,'coin'); }
window.renderCoinWatch=renderCoinWatch;
/* 코인 뉴스 & 트렌딩 */
async function renderCoinNews(el){
  var srcs=[['Coinness','실시간 국문 속보','https://coinness.live/'],['CoinDesk','글로벌 표준','https://www.coindesk.com/'],['The Block','온체인·기관','https://www.theblock.co/'],['Blockmedia','국내 블록체인','https://www.blockmedia.co.kr/'],['CoinGecko','시세·데이터','https://www.coingecko.com/'],['Binance Square','거래소 피드·공지','https://www.binance.com/en/square/news']];
  var h='<div class="sec-title">📰 코인 뉴스 & 트렌딩</div><p class="sec-sub">지금 검색·거래가 몰리는 코인과 빠른 뉴스 소스.</p>'
    +'<div class="row a"><div class="card"><div class="ch"><h2>🔥 트렌딩 <span style="font-weight:600;color:var(--faint);font-size:12px">검색 급증 · CoinGecko</span></h2></div><div class="pad" id="cnTrend"><div class="muted" style="font-size:12px">불러오는 중…</div></div></div>'
    +'<div class="card"><div class="ch"><h2>⚡ 빠른 뉴스 소스</h2></div><div class="pad">'+srcs.map(function(s){return '<a href="'+s[2]+'" target="_blank" rel="noopener" class="rowbtn" style="display:flex;justify-content:space-between;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line2)"><span><b>'+s[0]+'</b> <span class="muted" style="font-size:11.5px">· '+s[1]+'</span></span><span class="muted">↗</span></a>';}).join('')+'<p class="muted" style="font-size:11px;margin-top:10px;line-height:1.5">외부 사이트로 이동합니다. 속보는 <b>Coinness</b>, 심층은 <b>The Block</b>가 빠릅니다.</p></div></div></div>';
  el.innerHTML=h;
  try{ var t=await fetch('https://api.coingecko.com/api/v3/search/trending').then(function(r){return r.json();}); var coins=(t&&t.coins)||[];
    var te=$('#cnTrend'); if(te)te.innerHTML=coins.slice(0,12).map(function(c,i){ var it=c.item||{}; var chp=(it.data&&it.data.price_change_percentage_24h&&it.data.price_change_percentage_24h.usd);
      return '<div class="rowbtn" style="display:flex;justify-content:space-between;align-items:center;padding:9px 4px;border-bottom:1px solid var(--line2);cursor:pointer" onclick="openCoin(\''+esc((it.symbol||'').toUpperCase())+'\')"><span><span class="muted">'+(i+1)+'</span> <b>'+esc((it.symbol||'').toUpperCase())+'</b> <span class="muted" style="font-size:11px">'+esc(it.name||'')+'</span></span><span class="num" style="'+(chp!=null?('color:'+cCol(chp)):'color:var(--faint)')+';font-weight:700">'+(chp!=null?((chp>=0?'+':'')+chp.toFixed(1)+'%'):('#'+(it.market_cap_rank||'-')))+'</span></div>';
    }).join('')||'<div class="muted" style="font-size:12px">트렌딩 없음</div>';
  }catch(e){ var te2=$('#cnTrend'); if(te2)te2.innerHTML='<div class="muted" style="font-size:12px">트렌딩을 불러오지 못했어요</div>'; } }
window.renderCoinNews=renderCoinNews;
/* 기초 자료 — 선물 기초 + 📈 선 그리는 법 */
function renderCoinLearn(el){
  var card=function(title,body){ return '<div class="lacc"><button class="lacc-h" onclick="_toggleLacc(this)"><span class="lacc-t">'+title+'</span><span class="lacc-x">＋</span></button><div class="lacc-b">'+body+'</div></div>'; };
  var cat=function(t){ return '<div class="lcat">'+t+'</div>'; };
  var svgSR='<svg viewBox="0 0 220 96" style="width:100%;max-width:300px;height:auto"><rect width="220" height="96" fill="transparent"/><line x1="8" y1="24" x2="212" y2="24" stroke="#f6465d" stroke-width="2" stroke-dasharray="5 4"/><line x1="8" y1="76" x2="212" y2="76" stroke="#2ebd85" stroke-width="2" stroke-dasharray="5 4"/><polyline points="12,70 40,40 66,72 96,30 120,74 150,34 180,70 208,40" fill="none" stroke="var(--sub)" stroke-width="2"/><text x="10" y="18" fill="#f6465d" font-size="10" font-weight="700">저항</text><text x="10" y="90" fill="#2ebd85" font-size="10" font-weight="700">지지</text></svg>';
  var svgTrend='<svg viewBox="0 0 220 96" style="width:100%;max-width:300px;height:auto"><line x1="10" y1="86" x2="210" y2="30" stroke="#e0a83e" stroke-width="2"/><polyline points="14,80 44,58 60,74 92,46 110,64 146,34 168,52 206,26" fill="none" stroke="var(--sub)" stroke-width="2"/><circle cx="14" cy="84" r="3" fill="#e0a83e"/><circle cx="60" cy="72" r="3" fill="#e0a83e"/><circle cx="110" cy="62" r="3" fill="#e0a83e"/><text x="120" y="88" fill="#e0a83e" font-size="10" font-weight="700">저점 잇기 = 상승추세선</text></svg>';
  var svgChan='<svg viewBox="0 0 220 96" style="width:100%;max-width:300px;height:auto"><line x1="10" y1="80" x2="210" y2="34" stroke="#4a9eff" stroke-width="2"/><line x1="10" y1="52" x2="210" y2="8" stroke="#4a9eff" stroke-width="2"/><polyline points="14,74 44,52 60,70 92,40 110,58 146,30 168,46 206,18" fill="none" stroke="var(--sub)" stroke-width="2"/><text x="120" y="92" fill="#4a9eff" font-size="10" font-weight="700">평행 두 선 = 채널</text></svg>';
  var svgFib='<svg viewBox="0 0 220 96" style="width:100%;max-width:300px;height:auto"><line x1="8" y1="16" x2="212" y2="16" stroke="#a06bff" stroke-width="1.5"/><line x1="8" y1="40" x2="212" y2="40" stroke="#a06bff" stroke-width="1.5" stroke-dasharray="3 3"/><line x1="8" y1="56" x2="212" y2="56" stroke="#a06bff" stroke-width="2"/><line x1="8" y1="80" x2="212" y2="80" stroke="#a06bff" stroke-width="1.5"/><text x="176" y="38" fill="#a06bff" font-size="9">0.382</text><text x="184" y="54" fill="#a06bff" font-size="9" font-weight="700">0.5</text><text x="176" y="72" fill="#a06bff" font-size="9" font-weight="700">0.618</text><polyline points="12,82 60,18 120,58 200,30" fill="none" stroke="var(--sub)" stroke-width="2"/></svg>';
  var html='<div class="sec-title">📚 기초 자료 — 코인 선물 & 차트</div><p class="sec-sub">교육용 자료입니다. 매매 신호가 아니라 <b>스스로 판단</b>하는 근거를 기릅니다. 제목을 누르면 펼쳐져요.</p>';
  html+='<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="tf" onclick="_toggleAllLacc(this)">전체 펼치기</button></div>';
  html+=cat('📈 선 그리는 법');
  html+=card('① 지지·저항',
    '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center"><div style="flex:1;min-width:180px">'
    +'<b>지지</b> = 내려오다 <b>멈추고 반등</b>하는 가격대(매수세). <b>저항</b> = 오르다 <b>막히는</b> 가격대(매도세).<br>'
    +'· 최근 <b>고점 2~3개</b>를 수평으로 이으면 저항, <b>저점 2~3개</b>를 이으면 지지.<br>'
    +'· 한 번 뚫리면 <b>역할이 바뀜</b>(저항→지지). 거래량 많은 가격대일수록 강합니다.<br>'
    +'· 대시보드 차트의 빨강/초록 점선이 24h 저항·지지예요.</div>'+svgSR+'</div>');
  html+=card('② 추세선',
    '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center"><div style="flex:1;min-width:180px">'
    +'<b>상승추세선</b> = <b>저점끼리</b> 이은 선(우상향). <b>하락추세선</b> = <b>고점끼리</b> 이은 선(우하향).<br>'
    +'· 점 <b>2개면 그리고, 3번째로 확인</b>. 선을 <b>지지/저항</b>처럼 씁니다(추세 유지 시나리오).<br>'
    +'· 추세선이 깨지면 추세 전환 신호일 수 있어요. 차트의 <b>금색 선</b>이 스윙 추세선.</div>'+svgTrend+'</div>');
  html+=card('③ 채널',
    '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center"><div style="flex:1;min-width:180px">'
    +'추세선과 <b>평행선</b>을 반대편에 그으면 <b>채널</b>. 상단=저항, 하단=지지.<br>'
    +'· <b>상승 채널</b>이면 하단 매수·상단 매도가 기본 시나리오.<br>'
    +'· 가격이 채널을 <b>이탈</b>하면 추세 가속 또는 전환. 차트의 <b>파란 두 선</b>이 회귀 채널.</div>'+svgChan+'</div>');
  html+=card('④ 피보나치 되돌림 & 매물대',
    '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center"><div style="flex:1;min-width:180px">'
    +'상승 후 눌릴 때 <b>0.382 / 0.5 / 0.618</b>에서 지지받는 경향. <b>0.618</b>을 "황금 되돌림"이라 함(보라 점선).<br>'
    +'· 저점→고점에 피보를 걸면 되돌림 눌림목 구간이 보여요.<br>'
    +'· <b>매물대(POC)</b> = 거래량이 가장 많이 쌓인 가격대(주황선) → 강한 지지·저항.<br>'
    +'· 여러 근거가 <b>겹치는 자리</b>일수록 신뢰↑ (피보+지지+매물대 겹침 = 좋은 타점).</div>'+svgFib+'</div>');
  html+=cat('🧩 패턴 & 전략');
  html+=card('① 가짜 이탈(페이크아웃) & 트랩',
    '지지/저항을 <b>살짝 깨고 도로 돌아오는</b> 속임수 패턴이에요.<br>'
    +'· <b>베어 트랩</b> — 하단(지지)을 이탈했다가 회복 → 이탈 보고 숏 친 사람·손절한 롱이 <b>갇히고</b>, 그 손절·숏커버가 위로 미는 연료가 됩니다.<br>'
    +'· <b>불 트랩</b> — 상단(저항)을 돌파했다 흘러내림 → 추격 롱이 갇힘. 방향만 반대예요.<br>'
    +'· <b>트리거</b> = 봉을 <b>종가로 되돌려 마감</b>(꼬리만 나갔다 들어온 건 무효).<br>'
    +'· <b>무효화</b> = 꼬리 저점/고점을 다시 종가로 이탈하면 논리 깨짐 → 여기가 손절 기준.<br>'
    +'· <b>확신 근거</b> = 반등에 <b>거래량 실림</b> + <b>RSI 다이버전스</b>가 겹치면 신뢰도↑.');
  html+=card('② 레인지(횡보) 매매 & 돌파',
    '박스권(횡보) 안에선 벽을 오가는 게 기본이에요.<br>'
    +'· <b>레인지 매매</b> — 하단 지지 확인 → 목표는 <b>박스 상단</b> / 상단 저항 → 목표는 하단.<br>'
    +'· <b>돌파 매매</b> — 박스 상단을 <b>종가로 돌파 + 되돌아와 지지로 리테스트(역할전환)</b> 되면 추세 재개 신호. 봉 하나 삐죽으론 판단 금물.<br>'
    +'· <b>측정이동(Measured Move)</b> — 돌파 목표는 대충 찍지 말고 <b>박스 높이를 돌파 지점에 더한</b> 값으로. 근거 있는 1차 목표가 됩니다.<br>'
    +'· 박스를 <b>확실히 넘고 지지로 굳으면</b> 그때 "추세 전환"을 논할 수 있어요(그전엔 여전히 레인지).');
  html+=card('③ 시간봉 보는 법 (탑다운)',
    '<b>1·15·30분봉만</b> 뚫어져라 봐도 실력은 안 늘어요 — 맥락(구조)이 안 보이거든요.<br>'
    +'· <b>높은 시간봉(일·4시간) = 지도</b> → 어디가 큰 지지/저항인지, 추세인지 레인지인지 <b>방향·위치</b>를 정함.<br>'
    +'· <b>낮은 시간봉(5·15분) = 시계</b> → 그 자리에서 <b>언제</b> 들어갈지 타이밍만.<br>'
    +'· 방향은 <b>위에서</b>, 트리거만 <b>아래에서</b> — 이게 <b>탑다운(Top-down)</b> 분석입니다.<br>'
    +'· 높은 시간봉 지지가 더 잘 지켜지는 이유 = <b>참여자·주문·기억</b>이 훨씬 많이 쌓여 있어서예요.<br>'
    +'· 저 시간봉만 돌리면 <b>수수료·펀딩·감정 소모</b>가 커져 오버트레이딩의 지름길입니다.');
  html+=card('④ 계단식 상승 (저점 높이기)',
    '<b>저점이 계속 높아지는(Higher Lows)</b> 상승 구조예요. 작은 박스를 만들며 <b>한 계단씩</b> 올라갑니다.<br>'
    +'· 상승추세의 <b>건강한 눌림</b> 형태 — 이 저점 라인(계단)이 깨지지 않는 한 추세 유효.<br>'
    +'· 계단(저점)이 깨지면 <b>추세 훼손 경고</b>. 저점 라인을 손절·추세 판단 기준으로 씁니다.<br>'
    +'· 저항 앞에서 저점을 높이며 숨고르기 = <b>돌파 준비(에너지 응축)</b>로 보기도 해요.');
  html+=card('⑤ 기간조정 vs 가격조정',
    '조정에는 두 종류가 있어요.<br>'
    +'· <b>가격조정</b> = 가격이 <b>아래로 빠지며</b>(세로) 과열을 식힘.<br>'
    +'· <b>기간조정</b> = 가격은 <b>옆으로 횡보하며</b>(가로) 시간으로 과열을 식힘.<br>'
    +'· 급등 후 저항 앞 <b>좁은 박스에서 며칠 횡보</b> = 기간조정 → 매물 소화·응축 후 재상승 발판이 되기도.<br>'
    +'· "며칠 옆으로 기는데 안 빠지네" = 대개 가격조정이 아니라 기간조정입니다.');
  html+=card('⑥ 가짜 돌파 & 추세 복귀 확인',
    '하락 채널·추세선을 <b>살짝 뛰어넘어도</b> 곧바로 "상승 전환"으로 단정하면 안 돼요.<br>'
    +'· 먼저 <b>다시 채널·추세 안으로 복귀하는지</b>를 봐야 합니다 → 복귀하면 <b>가짜 돌파(페이크)</b>.<br>'
    +'· 진짜 돌파는 <b>돌파 후 그 자리를 지지로 리테스트</b>(역할전환)하고 이어가요.<br>'
    +'· "넘었다!"가 아니라 "넘고 <b>안 돌아오나</b>"를 확인 — 한 박자 늦게 들어가도 늦지 않습니다.');
  html+=card('⑦ 채널 이탈 ≠ 추세 전환 (구조적 저점)',
    '<b>상승채널을 하방으로 이탈</b>해도 자동으로 하락 전환은 아니에요.<br>'
    +'· <b>직전 저점(구조적 지지)</b>을 안 깨고 지키면 조정 후 <b>재상승</b>이 흔합니다(채널은 잠깐의 숨고르기였던 것).<br>'
    +'· 그래서 "채널 이탈"보다 <b>구조적 저점 사수 여부</b>가 추세 유효/무효의 진짜 기준.<br>'
    +'· 큰 상승 구조엔 "여기 깨지면 추세 끝"이라는 <b>단 하나의 라인</b>이 있어요 — 그 라인만 지키면 중간 흔들림은 노이즈.');
  html+=cat('⚙️ 선물 기초');
  html+=card('롱·숏·레버리지',
    '<b>롱</b> = 오를 것에 베팅(싸게 사서 비싸게). <b>숏</b> = 내릴 것에 베팅(비싸게 팔고 싸게 되사기). 선물은 <b>양방향</b> 수익 가능.<br><br>'
    +'<b>레버리지</b> = 증거금 대비 배율. <b>청산까지 버티는 역행폭 ≈ 1/레버리지</b>.<br>· 10배 → 약 −10%에서 청산 · 25배 → 약 −4% · 100배 → <b>약 −1%만 역행해도 청산</b>.<br>배율↑ = 청산가가 진입가에 <b>바짝 붙음</b>. 초보는 <b>3~5배 이하</b> 권장.');
  html+=card('💥 청산 · 펀딩비 · 롱숏 비율',
    '<b>청산가 근사식</b> — 롱 ≈ 진입×(1−1/레버리지), 숏 ≈ 진입×(1+1/레버리지). (수수료·유지증거금 제외)<br><br>'
    +'<b>펀딩비</b> — <span class="up">+</span>면 롱이 숏에게 지불(롱 과열), <span class="down">−</span>면 숏이 롱에게 지불(숏 과열). 8시간마다 정산.<br><br>'
    +'<b>롱숏 비율·Top Trader</b> — 시장 쏠림. <b>극단값은 역방향 청산</b>을 주의(과도한 롱쏠림 = 하방 청산 연료).');
  html+=cat('🛡️ 리스크 관리');
  html+=card('손절 · 리스크 관리 (제일 중요)',
    '진입과 <b>동시에</b> 손절을 정합니다. 손절 자리는 임의의 %가 아니라 <b>"이 가격이면 내 판단이 틀렸다"</b>는 곳(지지 이탈, 스윙 저점 아래).<br><br>'
    +'· <b>1회 리스크는 시드의 1~2%</b>로 — 상세의 🧮 계산기가 수량을 역산해줍니다.<br>'
    +'· <b>손익비 2:1 이상</b>을 노리되, 손절폭이 너무 좁으면 숫자만 커 보이고 쉽게 털립니다.<br>'
    +'· 손절 없는 매매 한 번이 수십 번의 수익을 지웁니다. <b>계좌를 지키는 게 1순위.</b>');
  html+=cat('🌐 시황 · 매크로 읽기');
  html+=card('순환매 & BTC 도미넌스',
    '<b>BTC 도미넌스</b> = 전체 코인 시총 중 비트코인 비중이에요.<br>'
    +'· 유동성이 <b>BTC → 알트로</b> 돌면 도미넌스↓ = <b>알트 강세(알트장)</b>.<br>'
    +'· BTC가 저항 앞에서 쉬는 동안 돈이 알트로 흐르면 = <b>순환매</b> 장.<br>'
    +'· 도미넌스 방향으로 "지금 돈이 어디로 도는지" 읽어요. 알트만 오르고 BTC는 횡보면 순환매 신호.');
  html+=card('금리 · 매크로가 크립토에 미치는 영향',
    'BTC는 <b>위험자산</b>이라 금리·유동성에 민감해요.<br>'
    +'· <b>10년물 국채금리 ↑</b> = 위험자산 부담(조정 가능) · <b>안정</b> = 재반등 여력.<br><br>'
    +'<b>4분면 (서비스 경기 × 물가)</b><br>'
    +'· 경기 유지 + 물가 <span class="down">하락</span> = <b class="up">최상</b> (주식·BTC·알트 우호적)<br>'
    +'· 경기 강세 + 물가 <span class="up">상승</span> = 과열·물가부담, 인하기대 약화 → <b class="down">조정 가능</b><br>'
    +'· 경기 둔화 + 물가 <span class="down">하락</span> = 인하기대↑ → 초반 긍정적<br>'
    +'· 경기 둔화 + 물가 <span class="up">상승</span> = 스태그플레이션형, <b class="down">위험자산 최악</b><br><br>'
    +'※ <b>경향</b>일 뿐 확정 아님. 단기 변동성은 금리가 흔들지만, <b>큰 방향</b>은 금리만으로 정해지지 않아요.');
  html+=card('온체인 — 현물 매수압력 & 레버리지',
    '같은 상승이라도 <b>질</b>이 달라요.<br>'
    +'· <b>현물(시장가) 매수압력이 오르며</b> 반등 = <b class="up">건강한 반등</b> (진짜 돈이 들어옴).<br>'
    +'· 매수압력이 <b>빠지며</b> 반등 = 약한 반등(되돌림·숏커버 위주일 수 있음).<br>'
    +'· <b>레버리지(미결제약정)가 과하지 않으면</b> 청산 연쇄 위험↓ = 더 건강한 상승.<br>'
    +'· CryptoQuant 등 온체인 데이터로 "돈의 성격"을 확인해요.');
  html+=card('경제지표 & 이벤트 캘린더',
    '지표 발표 <b>전후로 단기 변동성 급증</b> → 이벤트 리스크예요.<br>'
    +'· 크립토가 보는 주요 지표: <b>ISM 비제조업(물가·고용), 서비스 PMI, 실업수당청구, 고용지수, 실업률, CPI/PCE</b>.<br>'
    +'· 연준 이벤트: <b>FOMC, 잭슨홀, 연준 위원 발언</b>(매파/비둘기).<br>'
    +'· "언제 발표"인지 <b>미리 알고</b>, 그 시각엔 무리한 진입·높은 레버리지 자제.<br>'
    +'· 발표로 <b>단기 변동</b>은 나와도, 그게 곧 <b>추세 전환</b>은 아님 — 구조와 함께 보세요.');
  html+=card('고점 후 조정 — 분산 vs 재축적',
    '고점 뒤 조정엔 성격이 다른 <b>두 종류</b>가 있어요(와이코프 개념).<br>'
    +'· <b>분산(Distribution·손바뀜)</b> — 큰손이 추격 매수자에게 물량 넘기고 빠짐 → 이후 <b class="down">하락 전환</b>.<br>'
    +'· <b>재축적(Re-accumulation·숨고르기)</b> — 급등 후 나오는 매도 물량을 받아주며 옆으로 → <b class="up">재상승 발판</b>.<br>'
    +'· 실시간엔 둘이 비슷해 보여요. <b>구조적 저점을 사수하면 재축적, 이탈하면 분산</b>으로 사후에 갈립니다 — 그 라인을 기준점으로.');
  html+=card('다이버전스는 "맥락"이다',
    'RSI <b>하락 다이버전스</b>(가격↑ 인데 RSI↓)는 보통 반전 경고예요. 근데 <b>단독으로 단정 금물</b>.<br>'
    +'· <b>급등 후 매물 소화(재축적)</b> 국면에선 같은 다이버전스가 <b>양성</b>일 수 있어요 — 힘이 빠진 게 아니라 물량을 소화하는 중.<br>'
    +'· <b>시장가 매도·거래량·OI·구조</b>와 함께 봐야 의미가 정해집니다. 지표 하나만 보고 "반전"이라 외치면 자주 틀려요.<br>'
    +'· 원칙: <b>지표는 근거를 보태는 재료</b>, 방향을 정하는 건 <b>구조와 컨플루언스</b>.');
  html+=cat('🧭 실전 시황 읽기 (사례)');
  html+=card('하락 중 반등 — 되돌림인가, 전환인가 (BTC 예시)',
    '<div style="color:var(--sub);font-size:12px;margin-bottom:8px">아래는 <b>하락 흐름에서 나온 반등</b>을 어떻게 읽는지 보여주는 교육용 사례예요(특정 시점 예시·예측 아님).</div>'
    +'<b>상황</b> — 76K 후반에서 추가 하락이 있었지만, 현재는 76.5K 부근에서 한 차례 강하게 받아준 뒤 77.1K까지 되돌림이 나온 모습입니다.<br><br>'
    +'<b>판단</b> — 이번 반등만으로는 흐름이 바뀌었다고 보기엔 이릅니다. 내려오는 과정에서 새로 만들어진 <b>고점들이 계속 낮아지고</b>(고점 하락), 현재 가격 위로 <b>단기 이평선들이 내려오고</b> 있으며, <b>77.2K~77.5K</b> 구간부터는 다시 매도 물량이 붙을 수 있는 자리입니다.<br><br>'
    +'<b>볼 것 = 반등의 "높이"</b> — 77.2K 부근에서 다시 저항받고 <b>77K 아래로 밀리면</b> 이번 움직임 역시 <b class="down">하락 중간의 되돌림</b>으로 볼 수 있습니다. 그 경우 76.7K를 거쳐 앞서 받아줬던 <b>76.5K를 다시 확인</b>할 가능성이 있습니다.<br>'
    +'· 반대로 <b>77.2K를 넘어 77.5K까지 회복</b>하면 단기적으로 매도세가 <b class="up">꺾이는 흐름</b>이 나올 수 있어, 그때는 대응을 다르게 해야 합니다.<br><br>'
    +'<b>결론</b> — 아래에서 반등은 나왔지만 아직 하락 구조를 뒤집을 정도의 힘은 없다고 판단됩니다. 가장 중요하게 볼 구간은 <b>77K 초반에서 반등이 다시 막히는지</b> 확인하는 것입니다.<br><br>'
    +'<div style="background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:8px;padding:10px 12px"><b>📌 여기서 배우는 원칙</b><br>'
    +'① <b>고점이 계속 낮아지면(LH)</b> 아직 하락 구조 — 반등 하나로 단정 금물.<br>'
    +'② 반등은 <b>"높이"로 판별</b> — 직전 고점·이평 저항을 <b>넘고 지켜내는지</b>가 되돌림/전환을 가른다.<br>'
    +'③ <b>단기 이평선이 위에서 눌러주면</b> 그 구간이 저항 역할.<br>'
    +'④ <b>조건부 A/B</b>로 미리 대응 정하기 — "X 넘고 유지면 전환 관점, Y 막히고 이탈이면 되돌림 지속".<br>'
    +'⑤ <b>반등 ≠ 전환</b> — 구조를 뒤집는 힘(거래량·종가 회복)이 확인되기 전엔 되돌림 가능성을 우선.</div>');
  el.innerHTML=html;
}
window.renderCoinLearn=renderCoinLearn;
/* ── 📼 백테스트 리플레이 (과거 시뮬 · 교육용 · 매매신호 아님) ── */
function _btRun(cs,rule){ var cl=cs.map(function(k){return +k[4];}), n=cl.length, tr=[], pos=null;
  function ma(i,p){ if(i-p+1<0)return null; var s=0,j; for(j=i-p+1;j<=i;j++)s+=cl[j]; return s/p; }
  for(var i=25;i<n;i++){ var sig=0;
    if(rule==='rsi'){ var r=_cRsi(cl.slice(0,i+1),14), rp=_cRsi(cl.slice(0,i),14); if(r==null||rp==null)continue; if(rp<30&&r>=30)sig=1; else if(rp>70&&r<=70)sig=-1; }
    else { var m5=ma(i,5),m20=ma(i,20),m5p=ma(i-1,5),m20p=ma(i-1,20); if(m5==null||m20==null||m5p==null||m20p==null)continue; if(m5>m20&&m5p<=m20p)sig=1; else if(m5<m20&&m5p>=m20p)sig=-1; }
    if(sig!==0){ if(pos&&pos.dir!==sig){ var ex=cl[i], pnl=pos.dir===1?(ex-pos.entryP)/pos.entryP*100:(pos.entryP-ex)/pos.entryP*100; tr.push({dir:pos.dir,iE:pos.iEntry,iX:i,entryP:pos.entryP,exitP:ex,pnl:pnl}); pos=null; }
      if(!pos)pos={dir:sig,iEntry:i,entryP:cl[i]}; } }
  if(pos){ var ex2=cl[n-1], pnl2=pos.dir===1?(ex2-pos.entryP)/pos.entryP*100:(pos.entryP-ex2)/pos.entryP*100; tr.push({dir:pos.dir,iE:pos.iEntry,iX:n-1,entryP:pos.entryP,exitP:ex2,pnl:pnl2,open:true}); }
  return tr; }
function _btSVG(cs,tr){ var N=cs.length; if(N<5)return ''; var W=680,H=360,PADL=6,PADR=52,PADT=34,PADB=30, cw=W-PADL-PADR, ch=H-PADT-PADB;
  var lo=Infinity,hi=-Infinity,i; for(i=0;i<N;i++){var l=+cs[i][3],h=+cs[i][2]; if(l<lo)lo=l; if(h>hi)hi=h;} var pad=(hi-lo)*0.08||1; lo-=pad; hi+=pad; var span=(hi-lo)||1;
  function y(p){return PADT+(hi-p)/span*ch;} var bw=cw/N; function x(i){return PADL+i*bw+bw/2;} var up='#2ebd85',dn='#f6465d';
  var s='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block;background:var(--panel2,#0f151f);border:1px solid var(--line2);border-radius:10px">';
  for(i=0;i<N;i++){ var o=+cs[i][1],hh=+cs[i][2],ll=+cs[i][3],c=+cs[i][4]; var col=c>=o?up:dn,cx=x(i),bwid=Math.max(1,bw*0.6),yo=y(o),yc=y(c),top=Math.min(yo,yc),hgt=Math.max(1,Math.abs(yc-yo)); s+='<line x1="'+cx.toFixed(1)+'" y1="'+y(hh).toFixed(1)+'" x2="'+cx.toFixed(1)+'" y2="'+y(ll).toFixed(1)+'" stroke="'+col+'" stroke-width="0.8"/><rect x="'+(cx-bwid/2).toFixed(1)+'" y="'+top.toFixed(1)+'" width="'+bwid.toFixed(1)+'" height="'+hgt.toFixed(1)+'" fill="'+col+'"/>'; }
  tr.forEach(function(t){ var xe=x(t.iE),xx=x(t.iX),ye=y(t.entryP),yx=y(t.exitP),pc=t.pnl>=0?up:dn;
    s+='<line x1="'+xe.toFixed(1)+'" y1="'+ye.toFixed(1)+'" x2="'+xx.toFixed(1)+'" y2="'+yx.toFixed(1)+'" stroke="'+pc+'" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>';
    if(t.dir===1){ var yl=y(+cs[t.iE][3]); s+='<text x="'+xe.toFixed(1)+'" y="'+(yl+13).toFixed(1)+'" fill="'+up+'" font-size="13" font-weight="800" text-anchor="middle">▲</text><text x="'+xe.toFixed(1)+'" y="'+(yl+24).toFixed(1)+'" fill="'+up+'" font-size="8.5" font-weight="800" text-anchor="middle">롱 진입</text>'; }
    else { var yh=y(+cs[t.iE][2]); s+='<text x="'+xe.toFixed(1)+'" y="'+(yh-13).toFixed(1)+'" fill="'+dn+'" font-size="13" font-weight="800" text-anchor="middle">▼</text><text x="'+xe.toFixed(1)+'" y="'+(yh-4).toFixed(1)+'" fill="'+dn+'" font-size="8.5" font-weight="800" text-anchor="middle">숏 진입</text>'; }
    s+='<circle cx="'+xx.toFixed(1)+'" cy="'+yx.toFixed(1)+'" r="2.8" fill="'+pc+'"/><text x="'+xx.toFixed(1)+'" y="'+(yx-6).toFixed(1)+'" fill="'+pc+'" font-size="9.5" font-weight="800" text-anchor="middle">종료 '+(t.pnl>=0?'+':'')+t.pnl.toFixed(1)+'%</text>'; });
  return s+'</svg>'; }
function _btStatsHTML(tr,ruleLab){ var n=tr.length; if(!n)return '<div class="muted" style="font-size:12px">이 구간에선 규칙에 걸린 거래가 없어요.</div>';
  var wins=tr.filter(function(x){return x.pnl>0;}).length, wr=wins/n*100, sum=tr.reduce(function(s,x){return s+x.pnl;},0), pnls=tr.map(function(x){return x.pnl;}), best=Math.max.apply(null,pnls), worst=Math.min.apply(null,pnls);
  var sc=function(k,v,c){return '<div style="flex:1;min-width:64px;text-align:center;padding:8px 4px;background:var(--panel2);border:1px solid var(--line);border-radius:9px"><div class="muted" style="font-size:10.5px;font-weight:700">'+k+'</div><div class="'+(c||'')+'" style="font-size:15px;font-weight:800;margin-top:2px">'+v+'</div></div>';};
  var verdict= n<6?'<span class="muted">표본 부족('+n+'회) — 신뢰도 낮음</span>':(sum>0&&wr>=50?'<span class="up">이 구간·이 규칙은 가정상 <b>플러스</b>였음</span>':'<span class="down">이 구간·이 규칙은 가정상 <b>안 통했음</b></span>');
  return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'+sc('거래',n+'회')+sc('승률',wr.toFixed(0)+'%',wr>=50?'up':'down')+sc('누적',(sum>=0?'+':'')+sum.toFixed(1)+'%',sum>=0?'up':'down')+sc('최고',(best>=0?'+':'')+best.toFixed(1)+'%','up')+sc('최악',worst.toFixed(1)+'%','down')+'</div>'
    +'<div style="font-size:12.5px;color:var(--sub);margin-bottom:6px">📊 '+ruleLab+' · '+verdict+'</div>'
    +'<div style="font-size:11px;color:var(--faint);line-height:1.5">⚠ <b>과거 데이터 가정</b>(수수료·슬리피지·펀딩 제외) · <b>실제 매매 신호가 아니에요</b>. 과거가 미래를 보장하지 않습니다. 내 전략이 "이 구간에서" 어땠는지 <b>검증·복기</b>용이에요.</div>'; }
function renderBacktestReplay(el){ var sym=(_coinCur||'BTC');
  var TFS=[['1h','1시간'],['15m','15분'],['4h','4시간'],['1d','일봉']];
  var h='<div class="sec-title">📼 백테스트 리플레이 <span style="color:var(--faint);font-weight:500;font-size:12px">· 과거 시뮬레이션(가정) · 신호 아님</span></div>'
    +'<p class="sec-sub"><b>과거 데이터</b>에 규칙을 돌려 어디서 진입·청산했고 <b>가상으로</b> 얼마였는지 봐요. TradingView 전략은 그대로 못 가져오지만, <b>규칙만 알려주면</b> 여기 똑같이 재현할 수 있어요.</p>'
    +'<div class="card"><div class="pad"><div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:10px">'
    +'<input id="btSym" value="'+esc(sym)+'" placeholder="심볼" style="width:110px;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;padding:8px 11px;color:var(--ink);font-family:inherit;font-size:13px;outline:none">'
    +'<span style="font-size:11.5px;color:var(--faint);font-weight:700">봉</span>'+TFS.map(function(t,i){return '<button class="btTf'+(i===0?' on':'')+'" data-tf="'+t[0]+'" style="background:'+(i===0?'var(--gold,#e0a83e)':'transparent')+';color:'+(i===0?'#1a1400':'var(--sub)')+';border:1px solid var(--line2);border-radius:16px;padding:4px 11px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">'+t[1]+'</button>';}).join('')
    +'<span style="font-size:11.5px;color:var(--faint);font-weight:700;margin-left:4px">규칙</span><select id="btRule" style="background:var(--panel2);border:1px solid var(--line2);border-radius:10px;padding:6px 9px;color:var(--ink);font-family:inherit;font-size:12px;outline:none"><option value="ma">이평 크로스(추세추종)</option><option value="rsi">RSI 반전(역추세)</option></select>'
    +'<button id="btGo" style="margin-left:auto;background:var(--gold,#e0a83e);color:#1a1400;border:none;border-radius:10px;padding:7px 18px;font-family:inherit;font-weight:800;font-size:12.5px;cursor:pointer">▶ 실행</button></div>'
    +'<div id="btChart"><div class="muted" style="font-size:12px">‘실행’을 누르면 최근 120봉에 규칙을 돌려요.</div></div><div id="btStats" style="margin-top:10px"></div></div></div>';
  el.innerHTML=h; el._btTf='1h';
  var tfBtns=el.querySelectorAll('.btTf'); tfBtns.forEach(function(b){ b.onclick=function(){ tfBtns.forEach(function(x){x.classList.remove('on');x.style.background='transparent';x.style.color='var(--sub)';}); b.classList.add('on');b.style.background='var(--gold,#e0a83e)';b.style.color='#1a1400'; el._btTf=b.dataset.tf; }; });
  function run(){ var sym2=((el.querySelector('#btSym').value||'BTC').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/USDT$/,'')), tf=el._btTf||'1h', rule=el.querySelector('#btRule').value, ruleLab=el.querySelector('#btRule').selectedOptions[0].text+' · '+esc(sym2)+' '+tf; var ch=el.querySelector('#btChart'), st=el.querySelector('#btStats');
    ch.innerHTML='<div class="muted" style="font-size:12px">불러오는 중…</div>'; st.innerHTML='';
    fetch('https://fapi.binance.com/fapi/v1/klines?symbol='+sym2+'USDT&interval='+tf+'&limit=200').then(function(r){return r.json();}).then(function(kl){ if(!Array.isArray(kl)||kl.length<40){ ch.innerHTML='<div class="muted" style="font-size:12px">데이터가 부족해요(심볼 확인).</div>'; return; } var cs=kl.map(function(k){return [k[0],+k[1],+k[2],+k[3],+k[4],+k[5]];}); var view=cs.slice(-80); var tr=_btRun(view,rule); ch.innerHTML=_btSVG(view,tr); st.innerHTML=_btStatsHTML(tr,ruleLab); }).catch(function(){ ch.innerHTML='<div class="muted" style="font-size:12px">불러오지 못했어요.</div>'; }); }
  el.querySelector('#btGo').onclick=run; el.querySelector('#btSym').addEventListener('keydown',function(e){ if(e.key==='Enter'){e.preventDefault();run();} }); el.querySelector('#btRule').onchange=run;
  run();
}
window.renderBacktestReplay=renderBacktestReplay;
/* ── 💥 대량 흐름 마커 (실시간 큰손 진입/청산을 캔들 차트에 · 관찰용 · 신호 아님) ── */
var _flowEng=null;
function stopFlow(){ if(_flowEng&&_flowEng.stop){try{_flowEng.stop();}catch(e){}} _flowEng=null; }
window.stopFlow=stopFlow;
function renderFlowMarkers(el){ var sym=(_coinCur||'BTC');
  el.innerHTML='<div class="sec-title">💥 대량 흐름 마커 <span style="color:var(--faint);font-weight:500;font-size:12px">· 실시간 큰손 진입·청산 · 관찰용(신호 아님)</span></div>'
    +'<p class="sec-sub"><b>대량 체결</b>(공격적 매수=롱 진입 / 매도=숏 진입)과 <b>청산</b>을 캔들에 마커로 표시해요. 바이낸스는 <b>실시간</b>만 줘서 <b>켜둔 동안 쌓여요</b>(과거 이력 없음).</p>'
    +'<div class="card"><div class="pad"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">'
    +'<input id="flSym" value="'+esc(sym)+'" style="width:110px;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;padding:8px 11px;color:var(--ink);font-family:inherit;font-size:13px;outline:none">'
    +'<span style="font-size:11.5px;color:var(--faint);font-weight:700">최소 규모</span><select id="flThr" style="background:var(--panel2);border:1px solid var(--line2);border-radius:10px;padding:6px 9px;color:var(--ink);font-family:inherit;font-size:12px"><option value="100000">1.3억↑</option><option value="300000" selected>4억↑</option><option value="700000">9억↑</option><option value="1500000">20억↑</option></select>'
    +'<span style="font-size:11px;color:#8b96a7">● <span id="flLive">연결 중…</span></span></div>'
    +'<canvas id="flCv" style="width:100%;height:300px;display:block"></canvas>'
    +'<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:11.5px;color:var(--faint)"><span style="color:#2ebd85">▲ 롱 진입(대량 매수)</span><span style="color:#f6465d">▼ 숏 진입(대량 매도)</span><span style="color:#e0b552">✕ 청산</span></div>'
    +'<div style="font-weight:800;font-size:12.5px;margin-top:12px">🔴 실시간 대량 체결·청산</div><div id="flFeed" style="max-height:220px;overflow:auto;margin-top:6px"></div>'
    +'<div style="font-size:11px;color:var(--faint);margin-top:8px;line-height:1.5">⚠ 큰손 흐름 <b>관찰</b>이에요. "롱 진입 많다=사라"가 아니라, 대량 매수/매도가 <b>어디서</b> 나오는지 보는 거예요. 청산은 반대 압력 신호일 수 있어요(롱 청산=하방·숏 청산=상방).</div>'
    +'</div></div>';
  stopFlow(); _flowEng=_makeFlowEngine(sym); _flowEng.start();
  el.querySelector('#flSym').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); var s=(this.value||'BTC').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/USDT$/,''); stopFlow(); _flowEng=_makeFlowEngine(s); _flowEng.start(); } });
  el.querySelector('#flThr').onchange=function(){ if(_flowEng&&_flowEng.setThr)_flowEng.setThr(+this.value); };
}
window.renderFlowMarkers=renderFlowMarkers;
function _makeFlowEngine(sym){ var $=function(s){return document.querySelector(s);};
  var st={sym:(sym||'BTC').toUpperCase(),candles:[],price:0,markers:[],thr:300000,feed:[],ws1:null,ws2:null};
  var stopped=false,timers=[],dirty=true,cv,ctx,W=0,H=0,DPR=Math.min(2,window.devicePixelRatio||1),PADL=6,PADR=64,PADT=30,PADB=18;
  function fmtKR(usd){ var k=usd*1380; if(k>=1e12)return (k/1e12).toFixed(1)+'조'; if(k>=1e8)return (k/1e8).toFixed(k>=1e9?0:1)+'억'; if(k>=1e4)return Math.round(k/1e4)+'만'; return Math.round(k)+''; }
  function fmtPx(v){ if(v>=1000)return v.toLocaleString('en-US',{maximumFractionDigits:1}); if(v>=1)return v.toFixed(3); return v.toFixed(5); }
  function loadK(){ return fetch('https://fapi.binance.com/fapi/v1/klines?symbol='+st.sym+'USDT&interval=1m&limit=90').then(function(r){return r.json();}).then(function(a){ if(Array.isArray(a)&&a.length){ st.candles=a.map(function(k){return {t:k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4]};}); st.price=st.candles[st.candles.length-1].c; dirty=true; } }).catch(function(){}); }
  function addMark(p,usd,side,type){ st.markers.push({t:Date.now(),p:p,usd:usd,side:side,type:type}); if(st.markers.length>60)st.markers.shift(); st.feed.unshift({t:Date.now(),p:p,usd:usd,side:side,type:type}); if(st.feed.length>50)st.feed.pop(); st.price=p; dirty=true; renderFeed(); }
  function renderFeed(){ var el=$('#flFeed'); if(!el)return; el.innerHTML=st.feed.map(function(f){ var lab=f.type==='liq'?((f.side==='long'?'롱':'숏')+' 청산'):((f.side==='long'?'롱':'숏')+' 진입'); var col=f.type==='liq'?'#e0b552':(f.side==='long'?'#2ebd85':'#f6465d'); var tm=new Date(f.t); return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 2px;border-bottom:1px solid var(--line2);font-size:12px"><span style="color:'+col+';font-weight:700">'+lab+'</span><span class="muted">'+fmtPx(f.p)+'</span><span style="font-weight:800;color:'+col+'">'+fmtKR(f.usd)+'원</span><span class="muted" style="font-size:10.5px">'+('0'+tm.getHours()).slice(-2)+':'+('0'+tm.getMinutes()).slice(-2)+':'+('0'+tm.getSeconds()).slice(-2)+'</span></div>'; }).join('')||'<div class="muted" style="font-size:12px;padding:8px 2px">대량 체결·청산 대기 중… (큰 거래가 나오면 여기 표시)</div>'; }
  function connect(){ var lo=st.sym.toLowerCase()+'usdt';
    try{ st.ws1=new WebSocket('wss://fstream.binance.com/ws/'+lo+'@aggTrade'); st.ws1.onopen=function(){ var l=$('#flLive'); if(l)l.textContent='실시간 연결됨'; }; st.ws1.onmessage=function(e){ var m; try{m=JSON.parse(e.data);}catch(x){return;} var p=+m.p,q=+m.q; if(!(p>0)||!(q>0))return; var usd=p*q; if(usd>=st.thr)addMark(p,usd,m.m?'short':'long','entry'); }; }catch(e){}
    try{ st.ws2=new WebSocket('wss://fstream.binance.com/ws/'+lo+'@forceOrder'); st.ws2.onmessage=function(e){ var m; try{m=JSON.parse(e.data);}catch(x){return;} var o=m.o||m; if(!o||!o.p)return; var p=+o.p,q=+(o.q||o.l||0),usd=p*q; if(usd>=Math.max(50000,st.thr*0.5))addMark(p,usd,o.S==='SELL'?'long':'short','liq'); }; }catch(e){}
  }
  function resize(){ if(!cv)return; var r=cv.getBoundingClientRect(); if(r.width<20)return; W=r.width;H=r.height; cv.width=W*DPR;cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); dirty=true; }
  function draw(){ if(stopped)return; if(!dirty){ requestAnimationFrame(draw); return; } dirty=false; ctx.clearRect(0,0,W,H); var cs=st.candles; if(!cs.length){ requestAnimationFrame(draw); return; }
    var lo=Infinity,hi=-Infinity,i; for(i=0;i<cs.length;i++){ if(cs[i].l<lo)lo=cs[i].l; if(cs[i].h>hi)hi=cs[i].h; } for(i=0;i<st.markers.length;i++){ if(st.markers[i].p<lo)lo=st.markers[i].p; if(st.markers[i].p>hi)hi=st.markers[i].p; } var pad=(hi-lo)*0.08||1; lo-=pad; hi+=pad; var span=(hi-lo)||1;
    var cl=PADL,cr=W-PADR,cw=cr-cl,ct=PADT,cb=H-PADB,chh=cb-ct; function y(p){ return ct+(hi-p)/span*chh; }
    var t0=cs[0].t, tN=Date.now(); function xT(t){ return cl+(t-t0)/((tN-t0)||1)*cw; }
    var n=cs.length,bw=cw/ (n+2);
    for(i=0;i<n;i++){ var c=cs[i],cx=xT(c.t),up=c.c>=c.o,col=up?'#2ebd85':'#f6465d',bwid=Math.max(1,bw*0.6),yo=y(c.o),yc=y(c.c),top=Math.min(yo,yc),hg=Math.max(1,Math.abs(yc-yo)); ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1; ctx.beginPath();ctx.moveTo(cx,y(c.h));ctx.lineTo(cx,y(c.l));ctx.stroke(); ctx.fillRect(cx-bwid/2,top,bwid,hg); }
    // price line
    if(st.price){ var yp=y(st.price); ctx.strokeStyle='rgba(224,181,82,0.8)';ctx.setLineDash([2,3]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cl,yp);ctx.lineTo(cr,yp);ctx.stroke();ctx.setLineDash([]); ctx.fillStyle='#e0b552';ctx.fillRect(cr,yp-8,PADR,16);ctx.fillStyle='#1a1400';ctx.font='700 10px sans-serif';ctx.textAlign='left';ctx.fillText(fmtPx(st.price),cr+4,yp+3);ctx.textAlign='start'; }
    // markers
    ctx.textAlign='center'; st.markers.forEach(function(mk){ var mx=xT(mk.t); if(mx<cl)mx=cl; if(mx>cr)mx=cr; var my=y(mk.p); if(mk.type==='liq'){ ctx.fillStyle='#e0b552'; ctx.font='800 12px sans-serif'; ctx.fillText('✕',mx,my+4); ctx.font='700 8px sans-serif'; ctx.fillText(fmtKR(mk.usd),mx,my-8); } else if(mk.side==='long'){ ctx.fillStyle='#2ebd85'; ctx.font='800 13px sans-serif'; ctx.fillText('▲',mx,my+16); ctx.font='800 8.5px sans-serif'; ctx.fillText('롱 '+fmtKR(mk.usd),mx,my+27); } else { ctx.fillStyle='#f6465d'; ctx.font='800 13px sans-serif'; ctx.fillText('▼',mx,my-10); ctx.font='800 8.5px sans-serif'; ctx.fillText('숏 '+fmtKR(mk.usd),mx,my-20); } });
    ctx.textAlign='start';
    ctx.fillStyle='#5a6576';ctx.font='10px sans-serif';ctx.textAlign='left'; for(var g=0;g<=4;g++){ var pp=hi-(hi-lo)*g/4, yy=ct+chh*g/4; ctx.strokeStyle='rgba(33,42,56,0.4)';ctx.beginPath();ctx.moveTo(cl,yy);ctx.lineTo(cr,yy);ctx.stroke(); ctx.fillStyle='#5a6576';ctx.fillText(fmtPx(pp),cr+4,yy+3); } ctx.textAlign='start';
    requestAnimationFrame(draw); }
  function start(){ cv=$('#flCv'); if(!cv)return; ctx=cv.getContext('2d'); renderFeed(); resize(); [60,200,500,1200].forEach(function(ms){ timers.push(setTimeout(resize,ms)); });
    loadK(); connect(); requestAnimationFrame(draw);
    timers.push(setInterval(function(){ loadK(); },30000)); timers.push(setInterval(function(){ dirty=true; },1000)); window.addEventListener('resize',resize); }
  function stop(){ stopped=true; [st.ws1,st.ws2].forEach(function(w){ if(w){try{w.onclose=null;w.close();}catch(e){}} }); timers.forEach(function(t){clearTimeout(t);clearInterval(t);}); timers=[]; }
  function setThr(v){ st.thr=+v||300000; }
  return { start:start, stop:stop, setThr:setThr }; }
window._toggleLacc=function(btn){ var it=btn.closest('.lacc'); if(!it)return; it.classList.toggle('open'); var x=btn.querySelector('.lacc-x'); if(x)x.textContent=it.classList.contains('open')?'−':'＋'; };
window._toggleAllLacc=function(btn){ var root=btn.closest('#coinSection')||document, accs=root.querySelectorAll('.lacc'); var anyClosed=[].some.call(accs,function(a){return !a.classList.contains('open');});
  accs.forEach(function(a){ a.classList.toggle('open',anyClosed); var x=a.querySelector('.lacc-x'); if(x)x.textContent=anyClosed?'−':'＋'; }); btn.textContent=anyClosed?'전체 접기':'전체 펼치기'; };
/* ===== 🔥 청산맵(네이티브 이식: 구 VANTOR 터미널 liqmap) ===== */
function _liqHTML(){ return '<div id="lqRoot">'
  +'<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px"><div style="font-weight:800;font-size:17px">🔥 청산맵 <span style="color:#8b96a7;font-weight:500;font-size:13px">· Liquidation Heatmap</span></div><span style="font-size:11px;color:#8b96a7">● <span id="lqLiveTxt">연결 중…</span></span><input id="lqSearch" placeholder="🔍 코인 검색 (예: ADA·1000PEPE·SUI)" style="margin-left:auto;background:#0f151f;border:1px solid #222d3d;border-radius:10px;padding:9px 13px;color:#e8ecf3;font-family:inherit;font-size:13px;outline:none;min-width:200px"></div>'
  +'<div id="lqSyms" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>'
  +'<div id="lqTfs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"></div>'
  +'<div id="lqCtl" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#0f151f;border:1px solid #222d3d;border-radius:12px;padding:9px 13px;margin-bottom:14px">'
    +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:#8b96a7;font-weight:700">히트맵 강도</span>'
      +'<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#c9d3e0"><i style="width:15px;height:11px;border-radius:3px;display:inline-block;background:rgba(28,60,180,.5)"></i>약</span>'
      +'<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#c9d3e0"><i style="width:15px;height:11px;border-radius:3px;display:inline-block;background:rgba(60,110,220,.75)"></i>중</span>'
      +'<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#c9d3e0"><i style="width:15px;height:11px;border-radius:3px;display:inline-block;background:rgba(150,150,120,.9)"></i>강</span>'
      +'<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#c9d3e0"><i style="width:15px;height:11px;border-radius:3px;display:inline-block;background:linear-gradient(90deg,#e0a83e,#16b364)"></i>극강</span></div>'
    +'<div style="display:flex;align-items:center;gap:8px;min-width:210px;flex:1"><span style="font-size:11px;color:#8b96a7;font-weight:700;white-space:nowrap">유동성 임계값 = <b id="lqThreshV" style="color:#e8ecf3">0.15</b></span>'
      +'<input id="lqThresh" type="range" min="0" max="0.9" step="0.01" value="0.15" style="flex:1;min-width:90px;accent-color:#6f8bff;cursor:pointer"></div>'
    +'<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#c9d3e0;cursor:pointer;user-select:none"><input id="lqSbs" type="checkbox" checked style="accent-color:#6f8bff;cursor:pointer"><b>슈퍼 바이셀</b> <span style="color:#8b96a7">압력전환 ▲▼</span></label>'
    +'<div style="display:flex;align-items:center;gap:4px;margin-left:auto"><span style="font-size:11px;color:#8b96a7;font-weight:700">확대</span>'
      +'<button id="lqZin" class="lqpill" style="padding:5px 11px;font-size:14px;line-height:1">＋</button>'
      +'<button id="lqZout" class="lqpill" style="padding:5px 11px;font-size:14px;line-height:1">－</button>'
      +'<button id="lqZrst" class="lqpill" style="padding:5px 10px;font-size:11px">전체</button></div>'
  +'</div>'
  +'<div id="lqDeriv"></div>'
  +'<div class="lqStats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">'
  +'<div class="lqStat"><div class="lqk"><span style="color:#2ebd85">■</span> 숏 청산 최대</div><div class="lqv" id="lqStShort">—</div><div class="lqs" id="lqStShortAmt">가격이 오르면 청산</div></div>'
  +'<div class="lqStat"><div class="lqk"><span style="color:#f6465d">■</span> 롱 청산 최대</div><div class="lqv" id="lqStLong">—</div><div class="lqs" id="lqStLongAmt">가격이 내리면 청산</div></div>'
  +'<div class="lqStat"><div class="lqk">현재가</div><div class="lqv" id="lqStPx">—</div><div class="lqs" id="lqStChg">24h</div></div>'
  +'<div class="lqStat"><div class="lqk">미결제약정 OI</div><div class="lqv" id="lqStTot">—</div><div class="lqs" id="lqStCnt">실측 청산 0건 · $0</div></div></div>'
  +'<div class="lqMain" style="display:grid;grid-template-columns:1fr 300px;gap:14px">'
  +'<div style="position:relative"><div style="font-size:12px;color:#8b96a7;margin-bottom:6px"><b id="lqLgSym">BTC</b> · <span id="lqLgTf">15분</span> · Binance 무기한 · 히트맵(추정+실측)·레버리지 청산대·매물대·오더블럭</div><canvas id="lqChart" style="width:100%;height:460px;display:block"></canvas></div>'
  +'<div><div style="font-weight:800;font-size:13px;margin-bottom:8px">🔥 실시간 청산 <span style="color:#8b96a7;font-weight:500">· $50k↑</span></div><div id="lqFeed" style="max-height:460px;overflow-y:auto"></div></div></div>'
  +'<p style="font-size:11px;color:#5a6576;margin-top:12px;line-height:1.6"><b>읽는 법</b> — 밝은 가로 띠 = 청산 물량이 몰린 <b>자석 구간</b>. 현재가 위쪽 띠는 숏 청산대(뚫리면 상방 스퀴즈), 아래쪽 띠는 롱 청산대(깨지면 하방 가속). <b>데이터</b> — 가격·거래량·OI로 레버리지별 청산가를 역산한 <b>추정 모델</b> + 실시간 청산 스트림(WS) 실측. 개별 레버리지는 비공개라 추정이며 <b>교육·참고용</b>입니다. <b>확대</b> — 차트 위에서 <b>휠(스크롤)</b>로 확대·축소, <b>드래그</b>로 이동, ＋／－／전체 버튼도 사용. <b>유동성 임계값</b> — 값을 올리면 약한 띠를 걸러 <b>굵은 자석 구간</b>만 보임(약→중→강→극강 4단계). <b>슈퍼 바이셀 ▲▼</b> — 거래량·캔들로 잡은 <b>매수/매도 압력 전환</b> 관찰 표시로, 매매 신호가 아니라 흐름을 읽는 <b>교육용 보조지표</b>입니다.</p></div>'; }
function stopLiq(){ var e=window._liqEngine; if(e&&e.stop){try{e.stop();}catch(x){}} window._liqEngine=null; }
window.stopLiq=stopLiq;
window.openLiqMap=function(sym){ var sect=_ensureCoinSection(); if(!sect)return; var body=$('#coinBody'), host=$('#coinHost');
  if(body)body.style.display='none'; if(host){host.style.display='none';host.innerHTML='';}
  sect.style.display=''; window.scrollTo({top:0,behavior:'smooth'});
  $$('#menu .cmenu-a').forEach(function(a){a.classList.toggle('on',a.dataset.cs==='liq');});
  sect.innerHTML=_liqHTML(); stopLiq();
  window._liqEngine=_makeLiqEngine((sym||_coinCur||'BTC').toUpperCase().replace(/USDT$/,'')); window._liqEngine.start(); };
function _makeLiqEngine(initSym){
  var $=function(s){return document.querySelector(s);};
  var SYMS=['BTC','ETH','SOL','BNB','XRP','DOGE']; if(SYMS.indexOf(initSym)<0)SYMS.unshift(initSym);
  var TFS=[['1m','1분'],['5m','5분'],['15m','15분'],['1h','1시간'],['4h','4시간'],['12h','12시간'],['1d','24시간'],['3d','3일']];
  var st={sym:initSym||'BTC',tf:'15m',candles:[],price:0,chg:0,bins:new Map(),model:new Map(),binUsd:50,binFixed:false,oiUsd:0,tot:0,cnt:0,ws:null,feed:[],hover:null,deriv:null,visN:0,pan:0,thresh:0.15,sbs:true};
  var stopped=false, timers=[], dirty=true;
  function fmtPx(v){ if(!v&&v!==0)return '—'; if(v>=1000)return v.toLocaleString('en-US',{maximumFractionDigits:1}); if(v>=1)return v.toFixed(3); return v.toFixed(5); }
  function fmtUsd(v){ if(v>=1e9)return '$'+(v/1e9).toFixed(2)+'B'; if(v>=1e6)return '$'+(v/1e6).toFixed(2)+'M'; if(v>=1e3)return '$'+(v/1e3).toFixed(1)+'K'; return '$'+Math.round(v); }
  function fmtKrw(v){ var k=v*1380; if(k>=1e12)return (k/1e12).toFixed(1)+'조'; if(k>=1e8)return Math.round(k/1e8)+'억'; if(k>=1e4)return Math.round(k/1e4)+'만'; return Math.round(k)+''; }
  function binOf(p){ return Math.round(p/st.binUsd); } function binPx(b){ return b*st.binUsd; }
  function niceStep(x){ if(!(x>0))return 1; var e=Math.pow(10,Math.floor(Math.log10(x))); var f=x/e; var s=f<1.5?1:(f<3.5?2:(f<7.5?5:10)); return s*e; }
  function fixBin(){ var cs=st.candles; if(!cs.length)return; var lo=Infinity,hi=-Infinity; for(var i=0;i<cs.length;i++){ if(cs[i].l<lo)lo=cs[i].l; if(cs[i].h>hi)hi=cs[i].h; } st.binUsd=niceStep((hi-lo)*1.3/150)||st.binUsd; st.binFixed=true; }
  function addModel(p,side,w,idx){ if(!(p>0))return; var b=binOf(p),c=st.model.get(b)||{long:0,short:0,tw:0,wsum:0}; c[side]+=w; c.tw+=w*(idx||0); c.wsum+=w; st.model.set(b,c); }
  function buildModelHeat(){ st.model=new Map(); var cs=st.candles; if(!cs.length||!st.price)return; var tiers=[[10,0.16],[25,0.26],[50,0.31],[100,0.27]]; var n=cs.length;
    for(var i=0;i<n;i++){ var c=cs[i], notion=(c.v||0)*c.c; if(notion<=0)continue; var recency=0.30+0.70*(i/(n-1||1)); var upBias=c.c>=c.o?0.55:0.45; var entry=(c.h+c.l+c.c)/3;
      for(var t=0;t<tiers.length;t++){ var L=tiers[t][0], w=tiers[t][1]*recency*notion, lLiq=entry*(1-1/L), sLiq=entry*(1+1/L);
        if(lLiq<st.price) addModel(lLiq,'long', w*upBias, i); if(sLiq>st.price) addModel(sLiq,'short',w*(1-upBias), i); } } }
  function allBins(){ var m=new Map(), liveMax=0; st.bins.forEach(function(v){ var s=v.long+v.short; if(s>liveMax)liveMax=s; }); var modelMax=0; st.model.forEach(function(v){ var s=v.long+v.short; if(s>modelMax)modelMax=s; }); var boost=(liveMax>0&&modelMax>0)?(modelMax/liveMax*1.4):1; var last=(st.candles.length-1)||0;
    st.model.forEach(function(v,b){ m.set(b,{long:v.long,short:v.short,col:v.wsum>0?(v.tw/v.wsum):last}); }); st.bins.forEach(function(v,b){ var c=m.get(b)||{long:0,short:0,col:last}; c.long+=v.long*boost; c.short+=v.short*boost; m.set(b,c); }); return m; }
  function findOB(cs,cur){ var n=cs.length; if(n<8)return []; var s=0; for(var i=0;i<n;i++)s+=(cs[i].h-cs[i].l); var avg=s/n; if(!(avg>0))return []; var bulls=[],bears=[];
    for(var i=2;i<n-2;i++){ var a=cs[i],b=cs[i+1],bb=Math.abs(b.c-b.o); if(a.c<a.o&&b.c>b.o&&bb>avg*1.1&&b.c>a.h) bulls.push({type:'bull',top:a.h,bottom:a.l,idx:i}); if(a.c>a.o&&b.c<b.o&&bb>avg*1.1&&b.c<a.l) bears.push({type:'bear',top:a.h,bottom:a.l,idx:i}); }
    function fresh(ob){ for(var j=ob.idx+2;j<n;j++){ if(ob.type==='bull'&&cs[j].l<ob.bottom)return false; if(ob.type==='bear'&&cs[j].h>ob.top)return false; } return true; }
    var out=[]; bulls.filter(fresh).filter(function(o){return o.top<=cur;}).slice(-2).forEach(function(o){out.push(o);}); bears.filter(fresh).filter(function(o){return o.bottom>=cur;}).slice(-2).forEach(function(o){out.push(o);}); return out; }
  function api(sym){ return sym+'USDT'; }
  function tfMin(){ return {'1m':1,'5m':5,'15m':15,'1h':60,'4h':240,'12h':720,'1d':1440,'3d':4320}[st.tf]||15; }
  function loadKlines(){ return fetch('https://fapi.binance.com/fapi/v1/klines?symbol='+api(st.sym)+'&interval='+st.tf+'&limit=200').then(function(r){return r.json();}).then(function(a){ if(!Array.isArray(a))throw 0; st.candles=a.map(function(k){return {t:k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]};}); var last=st.candles[st.candles.length-1]; st.price=last.c; var first24=st.candles[Math.max(0,st.candles.length-Math.round((24*60)/tfMin()))]; st.chg=first24?((last.c-first24.o)/first24.o*100):0; if(!st.binFixed)fixBin(); buildModelHeat(); }); }
  function loadTicker(){ return fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol='+api(st.sym)).then(function(r){return r.json();}).then(function(t){ if(t&&t.lastPrice){ st.price=+t.lastPrice; st.chg=+t.priceChangePercent; } }).catch(function(){}); }
  function loadOI(){ return fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol='+api(st.sym)).then(function(r){return r.json();}).then(function(o){ if(o&&o.openInterest){ st.oiUsd=+o.openInterest*(st.price||1); } }).catch(function(){}); }
  function loadDeriv(){ var s=api(st.sym), F='https://fapi.binance.com/fapi/v1/', D='https://fapi.binance.com/futures/data/'; Promise.all([
      fetch(F+'premiumIndex?symbol='+s).then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(D+'globalLongShortAccountRatio?symbol='+s+'&period=5m&limit=1').then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(D+'topLongShortPositionRatio?symbol='+s+'&period=5m&limit=1').then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(D+'openInterestHist?symbol='+s+'&period=5m&limit=2').then(function(r){return r.json();}).catch(function(){return null;})
    ]).then(function(r){ if(stopped)return; st.deriv={ fund:r[0], ls:(r[1]&&r[1][0]), top:(r[2]&&r[2][0]), oih:r[3] }; renderDeriv(); }); }
  function renderDeriv(){ var el=$('#lqDeriv'); if(!el)return; var d=st.deriv; if(!d){ el.innerHTML=''; return; }
    function chip(inner){ return '<div style="flex:1;min-width:150px;background:#0f151f;border:1px solid #222d3d;border-radius:12px;padding:9px 12px">'+inner+'</div>'; }
    function k(t){ return '<div style="color:#8b96a7;font-size:11px;font-weight:600;margin-bottom:5px">'+t+'</div>'; } var html='';
    if(d.ls){ var la=+d.ls.longAccount*100, sa=+d.ls.shortAccount*100; html+=chip(k('롱/숏 계정 비율')+'<div style="height:8px;border-radius:5px;overflow:hidden;display:flex;background:#f6465d"><span style="width:'+la.toFixed(1)+'%;background:#2ebd85"></span></div><div style="display:flex;justify-content:space-between;font-size:12px;font-weight:800;margin-top:5px"><span style="color:#2ebd85">롱 '+la.toFixed(1)+'%</span><span style="color:#f6465d">숏 '+sa.toFixed(1)+'%</span></div>'); }
    if(d.top){ var tl=+d.top.longAccount*100, dom=tl>=50?'롱':'숏', domc=tl>=50?'#2ebd85':'#f6465d', domv=tl>=50?tl:100-tl; html+=chip(k('상위 트레이더 (스마트머니)')+'<div style="font-size:17px;font-weight:800;color:'+domc+'">'+dom+' '+domv.toFixed(1)+'% 우위</div><div style="font-size:11px;color:#5a6576;margin-top:2px">롱 '+tl.toFixed(1)+'% · 숏 '+(100-tl).toFixed(1)+'%</div>'); }
    if(d.fund&&d.fund.lastFundingRate!=null){ var fr=+d.fund.lastFundingRate*100, fc=fr>=0?'#2ebd85':'#f6465d'; var nt=d.fund.nextFundingTime?Math.max(0,d.fund.nextFundingTime-Date.now()):0, hh=Math.floor(nt/3600000), mm=Math.floor(nt%3600000/60000); html+=chip(k('펀딩비 (8시간)')+'<div style="font-size:17px;font-weight:800;color:'+fc+'">'+(fr>=0?'+':'')+fr.toFixed(4)+'%</div><div style="font-size:11px;color:#5a6576;margin-top:2px">'+(fr>=0?'롱→숏 지불':'숏→롱 지불')+' · 다음 '+hh+'h'+mm+'m</div>'); }
    if(d.oih&&d.oih.length>=2){ var a=+d.oih[0].sumOpenInterestValue, b=+d.oih[1].sumOpenInterestValue, ch=a>0?((b-a)/a*100):0, oc=ch>=0?'#2ebd85':'#f6465d'; html+=chip(k('미결제약정 OI 추이')+'<div style="font-size:17px;font-weight:800">'+fmtUsd(b)+'</div><div style="font-size:11px;font-weight:700;color:'+oc+';margin-top:2px">'+(ch>=0?'▲ +':'▼ ')+ch.toFixed(2)+'% (5m)</div>'); }
    el.innerHTML=html?('<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'+html+'</div>'):''; }
  function connectWS(){ if(st.ws){ try{st.ws.onclose=null;st.ws.close();}catch(e){} st.ws=null; } if(stopped)return; var stream=api(st.sym).toLowerCase()+'@forceOrder', ws; try{ ws=new WebSocket('wss://fstream.binance.com/ws/'+stream); }catch(e){ return; } st.ws=ws;
    ws.onopen=function(){ var lt=$('#lqLiveTxt'); if(lt)lt.textContent='Binance 선물 실시간 연결됨'; };
    ws.onclose=function(){ if(!stopped&&st.ws===ws){ var lt=$('#lqLiveTxt'); if(lt)lt.textContent='재연결 중…'; setTimeout(function(){ if(!stopped&&st.ws===ws)connectWS(); },2500); } };
    ws.onmessage=function(ev){ var m; try{ m=JSON.parse(ev.data); }catch(e){ return; } var o=m.o||m; if(!o||!o.p)return; ingest(+o.p, +(o.q||o.l||0), (o.S==='SELL')?'long':'short'); }; }
  function ingest(p,q,side){ if(!p||!q)return; var usd=p*q, b=binOf(p), cur=st.bins.get(b)||{long:0,short:0}; cur[side]+=usd; st.bins.set(b,cur); st.tot+=usd; st.cnt++; if(usd>=50000){ st.feed.unshift({side:side,p:p,usd:usd,t:Date.now()}); if(st.feed.length>60)st.feed.pop(); renderFeed(); } dirty=true; }
  function renderFeed(){ var el=$('#lqFeed'); if(!el)return; el.innerHTML=st.feed.map(function(f){ var cls=f.side==='long'?'long':'short', lab=f.side==='long'?'롱 청산':'숏 청산'; return '<div class="frow"><span class="side '+cls+'">'+lab+'</span><span class="px">'+fmtPx(f.p)+'</span><span class="amt" style="color:'+(f.side==='long'?'#f6465d':'#2ebd85')+'">'+fmtUsd(f.usd)+'</span></div>'; }).join('')||'<div style="color:#5a6576;font-size:12px;padding:10px 2px">청산 대기 중… 큰 청산이 발생하면 여기 표시됩니다.</div>'; }
  function topLevels(){ var longs=[],shorts=[], HB=allBins(); HB.forEach(function(v,b){ if(v.long>0)longs.push([b,v.long]); if(v.short>0)shorts.push([b,v.short]); }); longs.sort(function(a,b){return b[1]-a[1];}); shorts.sort(function(a,b){return b[1]-a[1];}); return {longs:longs,shorts:shorts}; }
  function usdScale(){ var tot=0; st.model.forEach(function(v){ tot+=v.long+v.short; }); return (st.oiUsd>0&&tot>0)?(st.oiUsd/tot):0; }
  function amtLabel(w){ var s=usdScale(); if(s>0){ var u=w*s; return '추정 '+fmtUsd(u)+' · 약 '+fmtKrw(u)+'원'; } return '유동성 집중'; }
  function renderStats(){ if(stopped)return; var t=topLevels(), sT=t.shorts[0], lT=t.longs[0]; var g=function(id){return $('#'+id);}; if(g('lqStShort'))g('lqStShort').textContent=sT?fmtPx(binPx(sT[0])):'—'; if(g('lqStShortAmt'))g('lqStShortAmt').textContent=sT?amtLabel(sT[1]):'가격이 오르면 청산'; if(g('lqStLong'))g('lqStLong').textContent=lT?fmtPx(binPx(lT[0])):'—'; if(g('lqStLongAmt'))g('lqStLongAmt').textContent=lT?amtLabel(lT[1]):'가격이 내리면 청산'; if(g('lqStPx'))g('lqStPx').textContent=fmtPx(st.price); var chg=st.chg||0; if(g('lqStChg'))g('lqStChg').innerHTML='<span style="color:'+(chg>=0?'#2ebd85':'#f6465d')+'">'+(chg>=0?'▲ +':'▼ ')+chg.toFixed(2)+'% 24h</span>'; if(g('lqStTot'))g('lqStTot').textContent=st.oiUsd>0?fmtUsd(st.oiUsd):'—'; if(g('lqStCnt'))g('lqStCnt').textContent='실측 청산 '+st.cnt.toLocaleString()+'건 · '+fmtUsd(st.tot); }
  function visRange(){ var N=st.candles.length; if(!N)return {i0:0,i1:0,N:0}; var vn=st.visN>0?Math.min(st.visN,N):N; if(vn<8)vn=Math.min(8,N); var i1=N-st.pan; if(i1>N)i1=N; if(i1<vn)i1=vn; var i0=i1-vn; if(i0<0){i0=0;i1=Math.min(N,vn);} return {i0:i0,i1:i1,N:N}; }
  function computeSBS(){ var cs=st.candles, n=cs.length, out=[]; if(n<6)return out; var s=0; for(var i=0;i<n;i++)s+=(cs[i].h-cs[i].l); var avg=s/n; if(!(avg>0))return out;
    for(var i=2;i<n-1;i++){ var a=cs[i-1], b=cs[i], body=Math.abs(b.c-b.o), vol=b.v*b.c; var vs=0,c=0; for(var j=Math.max(0,i-10);j<i;j++){vs+=cs[j].v*cs[j].c;c++;} var vavg=c?vs/c:vol; var strongVol=vol>vavg*1.4, bigBody=body>avg*0.85;
      if(a.c<a.o && b.c>b.o && b.c>a.o && bigBody && strongVol) out.push({i:i,type:'buy',p:b.l}); else if(a.c>a.o && b.c<b.o && b.c<a.o && bigBody && strongVol) out.push({i:i,type:'sell',p:b.h}); } return out; }
  function zoomBy(f,anchor){ var N=st.candles.length; if(!N)return; var cur=st.visN>0?st.visN:N; var nv=Math.round(cur*f); nv=Math.max(12,Math.min(N,nv)); st.visN=(nv>=N)?0:nv; if(st.visN===0)st.pan=0; else { var maxPan=N-st.visN; if(st.pan>maxPan)st.pan=maxPan; if(st.pan<0)st.pan=0; } dirty=true; }
  var cv,ctx,DPR=Math.min(2,window.devicePixelRatio||1),W=0,H=0,PADR=76,PADL=8,PADT=14,PADB=26;
  function resize(){ if(!cv)return; var r=cv.getBoundingClientRect(); if(r.width<20)return; W=r.width; H=r.height; cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); dirty=true; }
  function hoverAt(clientX){ var r=cv.getBoundingClientRect(), mx=clientX-r.left; var vr=visRange(); if(!vr.N)return; var vn=vr.i1-vr.i0; var cl=PADL, cr=W-PADR, bw=(cr-cl)/vn, k=Math.floor((mx-cl)/bw), idx=vr.i0+k; st.hover=(k>=0&&k<vn)?idx:null; dirty=true; }
  function draw(){ if(stopped)return; if(!dirty){ requestAnimationFrame(draw); return; } dirty=false; ctx.clearRect(0,0,W,H); var cs=st.candles; if(!cs.length){ requestAnimationFrame(draw); return; }
    var vr=visRange(), i0=vr.i0, i1=vr.i1, vn=i1-i0; if(vn<1){ requestAnimationFrame(draw); return; }
    var lo=Infinity,hi=-Infinity; for(var i=i0;i<i1;i++){ if(cs[i].l<lo)lo=cs[i].l; if(cs[i].h>hi)hi=cs[i].h; } var pad=(hi-lo)*0.08; lo-=pad; hi+=pad; if(st.price&&st.pan===0){ lo=Math.min(lo,st.price*0.985); hi=Math.max(hi,st.price*1.015); }
    var cl=PADL, cr=W-PADR, cw=cr-cl, ct=PADT, cb=H-PADB, ch=cb-ct; function y(p){ return ct+(hi-p)/(hi-lo)*ch; } var bw=cw/vn; function xIdx(i){ return cl+(i-i0)*bw+bw/2; }
    var HB=allBins(), maxV=0; HB.forEach(function(v){ var s=v.long+v.short; if(s>maxV)maxV=s; }); var thr=Math.max(0.02,st.thresh||0);
    if(maxV>0){ var hpx=Math.max(1.2,ch/((hi-lo)/st.binUsd)); HB.forEach(function(v,b){ var p=binPx(b); if(p<lo||p>hi)return; var sum=v.long+v.short; if(sum<=0)return; var ratio=sum/maxV; if(ratio<thr)return; var yy=y(p), inten=Math.pow(ratio,0.95), a=Math.min(0.95,0.015+inten*1.05); var R,G,B; if(ratio>=0.8){ R=224; G=Math.round(150+18*((ratio-0.8)/0.2)); B=62; } else if(ratio>=0.6){ R=150; G=150; B=120; } else { R=Math.round(24+74*inten); G=Math.round(40+86*inten); B=Math.round(150+95*inten); } var col=(v.col!=null)?v.col:(i1-1), xStart=cl+((col-i0)/((vn-1)||1))*cw; if(xStart<cl)xStart=cl; if(xStart>cr-3)xStart=cr-3; ctx.fillStyle='rgba('+R+','+G+','+B+','+a.toFixed(3)+')'; ctx.fillRect(xStart,yy-hpx/2,cr-xStart,hpx*0.9); if(inten>0.16){ var edge=v.long>=v.short?'246,70,93':'46,189,133', ew=Math.min(cw*0.42,cw*inten*0.5); ctx.fillStyle='rgba('+edge+','+(0.3+inten*0.55).toFixed(3)+')'; ctx.fillRect(cr-ew,yy-hpx/2,ew,Math.max(1,hpx*0.6)); } }); }
    var vp={}, vpMax=0, pocBin=null; for(var i=i0;i<i1;i++){ var c3=cs[i], q3=c3.v*c3.c; if(q3<=0)continue; var b0=binOf(c3.l), b1b=binOf(c3.h), span=Math.max(1,b1b-b0+1), per=q3/span; for(var pb=b0;pb<=b1b;pb++){ vp[pb]=(vp[pb]||0)+per; if(vp[pb]>vpMax){vpMax=vp[pb];pocBin=pb;} } }
    if(vpMax>0){ var hpx2=Math.max(1.2,ch/((hi-lo)/st.binUsd)), vpW=cw*0.14; for(var pk in vp){ var pp=binPx(+pk); if(pp<lo||pp>hi)continue; var yy2=y(pp), w2=vp[pk]/vpMax*vpW; ctx.fillStyle='rgba(190,205,225,0.09)'; ctx.fillRect(cl,yy2-hpx2/2,w2,hpx2*0.9); } if(pocBin!=null){ var pocP=binPx(pocBin); if(pocP>=lo&&pocP<=hi){ var yy3=y(pocP); ctx.strokeStyle='rgba(190,205,225,0.35)'; ctx.setLineDash([2,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cl,yy3); ctx.lineTo(cl+vpW,yy3); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='rgba(190,205,225,0.6)'; ctx.font='9px sans-serif'; ctx.textAlign='left'; ctx.fillText('POC 매물대',cl+vpW+3,yy3+3); ctx.textAlign='start'; } } }
    if(st.price){ var levs=[[100,'100x'],[50,'50x'],[25,'25x'],[10,'10x']]; ctx.save(); ctx.setLineDash([4,4]); ctx.font='10px sans-serif'; levs.forEach(function(L){ var frac=1/L[0]; [['short',st.price*(1+frac),'46,189,133'],['long',st.price*(1-frac),'246,70,93']].forEach(function(d){ var pp=d[1]; if(pp<lo||pp>hi)return; var yy=y(pp); ctx.strokeStyle='rgba('+d[2]+',0.22)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cl,yy); ctx.lineTo(cr,yy); ctx.stroke(); ctx.fillStyle='rgba('+d[2]+',0.7)'; ctx.fillText(L[1],cl+4,yy-2); }); }); ctx.restore(); }
    var volH=ch*0.22, maxVol=0; for(var iv=i0;iv<i1;iv++){ var q=cs[iv].v*cs[iv].c; if(q>maxVol)maxVol=q; } if(maxVol>0){ var vw=Math.max(1.5,bw*0.9); for(var iv2=i0;iv2<i1;iv2++){ var c2=cs[iv2], q2=c2.v*c2.c, bh=Math.max(0.6,q2/maxVol*volH), x2=xIdx(iv2); ctx.fillStyle=(c2.c>=c2.o)?'rgba(46,189,133,0.42)':'rgba(246,70,93,0.42)'; ctx.fillRect(x2-vw/2, cb-bh, vw, bh); } }
    var obs=findOB(cs, st.price); obs.forEach(function(ob){ if(ob.idx>=i1)return; var yt=y(ob.top), ybt=y(ob.bottom); if(ob.top<lo||ob.bottom>hi)return; var ox=Math.max(cl,xIdx(ob.idx)-bw/2), rgb=ob.type==='bull'?'46,189,133':'246,70,93'; ctx.fillStyle='rgba('+rgb+',0.20)'; ctx.fillRect(ox,yt,cr-ox,ybt-yt); ctx.strokeStyle='rgba('+rgb+',0.95)'; ctx.lineWidth=1.8; ctx.setLineDash([5,3]); ctx.strokeRect(ox,yt,cr-ox,ybt-yt); ctx.setLineDash([]); var lb=(ob.type==='bull'?'🟩 OB 지지':'🟥 OB 저항'); ctx.font='800 11px sans-serif'; var lw=ctx.measureText(lb).width+8; ctx.fillStyle='rgba('+rgb+',0.92)'; ctx.fillRect(ox,yt,lw,15); ctx.fillStyle='#0b0f16'; ctx.textAlign='left'; ctx.fillText(lb,ox+4,yt+11); ctx.textAlign='start'; });
    for(var i2=i0;i2<i1;i2++){ var c=cs[i2], x=xIdx(i2), up=c.c>=c.o, col2=up?'#2ebd85':'#f6465d'; ctx.strokeStyle=col2; ctx.fillStyle=col2; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x,y(c.h)); ctx.lineTo(x,y(c.l)); ctx.stroke(); var bodyW=Math.max(1,bw*0.62), yo=y(c.o), yc=y(c.c); ctx.fillRect(x-bodyW/2,Math.min(yo,yc),bodyW,Math.max(1,Math.abs(yc-yo))); }
    if(st.sbs){ var mk=computeSBS(); ctx.font='800 12px sans-serif'; ctx.textAlign='center'; mk.forEach(function(m){ if(m.i<i0||m.i>=i1)return; var x=xIdx(m.i); if(m.type==='buy'){ var yy=y(cs[m.i].l)+13; ctx.fillStyle='#2ebd85'; ctx.fillText('▲',x,yy); } else { var yy2=y(cs[m.i].h)-6; ctx.fillStyle='#f6465d'; ctx.fillText('▼',x,yy2); } }); ctx.textAlign='start'; }
    if(st.price){ var yp=y(st.price); if(st.price>=lo&&st.price<=hi){ ctx.strokeStyle='rgba(46,189,133,0.95)'; ctx.setLineDash([2,3]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cl,yp); ctx.lineTo(cr,yp); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='#2ebd85'; ctx.fillRect(cr,yp-9,PADR,18); ctx.fillStyle='#04120c'; ctx.font='700 11px sans-serif'; ctx.textAlign='left'; ctx.fillText(fmtPx(st.price),cr+5,yp+4); ctx.textAlign='start'; } }
    var t=topLevels(), NEAR=0.015, nearHit=false, pulse=0.4+0.6*Math.abs(Math.sin(Date.now()/350)); [[t.shorts[0],'46,189,133','숏'],[t.longs[0],'246,70,93','롱']].forEach(function(d){ if(!d[0])return; var p=binPx(d[0][0]); if(p<lo||p>hi)return; var yy=y(p); var dist=st.price?Math.abs(p-st.price)/st.price:9, near=dist<=NEAR; if(near){ nearHit=true; ctx.strokeStyle='rgba('+d[1]+','+(0.35+pulse*0.6).toFixed(2)+')'; ctx.lineWidth=2; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(cl,yy); ctx.lineTo(cr,yy); ctx.stroke(); } ctx.fillStyle='rgba('+d[1]+',0.98)'; ctx.font='700 10.5px sans-serif'; var sc=usdScale(), label=(near?'⚠ ':'◀ ')+d[2]+' 청산벽'+(sc>0?(' 추정 '+fmtUsd(d[0][1]*sc)):'')+(near?' 근접 '+(dist*100).toFixed(2)+'%':''); ctx.textAlign='right'; ctx.fillText(label,cr-6,yy-3); ctx.textAlign='start'; }); if(nearHit)dirty=true;
    ctx.fillStyle='#5a6576'; ctx.font='10px sans-serif'; ctx.textAlign='left'; for(var g=0;g<=5;g++){ var pp2=hi-(hi-lo)*g/5, yy4=ct+ch*g/5; ctx.strokeStyle='rgba(33,42,56,0.5)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cl,yy4); ctx.lineTo(cr,yy4); ctx.stroke(); ctx.fillStyle='#5a6576'; ctx.fillText(fmtPx(pp2),cr+5,yy4+3); }
    ctx.textAlign='center'; var step=Math.max(1,Math.ceil(vn/7)); for(var kk=i0;kk<i1;kk+=step){ var dd=new Date(cs[kk].t), xk=xIdx(kk), big=tfMin()>=1440; var lab=(dd.getMonth()+1)+'/'+dd.getDate()+(big?'':(' '+('0'+dd.getHours()).slice(-2)+':'+('0'+dd.getMinutes()).slice(-2))); ctx.fillStyle='#5a6576'; ctx.fillText(lab,xk,H-9); } ctx.textAlign='start';
    if(st.hover!=null && st.hover>=i0 && st.hover<i1){ var hc=cs[st.hover], hx=xIdx(st.hover), hup=hc.c>=hc.o, dcol=hup?'#2ebd85':'#f6465d'; ctx.strokeStyle='rgba(90,120,240,0.6)'; ctx.setLineDash([3,3]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(hx,ct); ctx.lineTo(hx,cb); ctx.stroke(); ctx.setLineDash([]); var hd=new Date(hc.t), ds=(hd.getMonth()+1)+'/'+hd.getDate()+' '+('0'+hd.getHours()).slice(-2)+':'+('0'+hd.getMinutes()).slice(-2); var q4=hc.v*hc.c, chg2=((hc.c-hc.o)/hc.o*100), vol=hc.v; var rows=[['시간',ds,'#c9d3e0'],['시가',fmtPx(hc.o),'#8b96a7'],['고가',fmtPx(hc.h),'#2ebd85'],['저가',fmtPx(hc.l),'#f6465d'],['종가',fmtPx(hc.c)+' ('+(chg2>=0?'+':'')+chg2.toFixed(2)+'%)',dcol],['거래량',vol.toLocaleString('en-US',{maximumFractionDigits:0})+' '+st.sym,'#c9d3e0'],['거래대금',fmtUsd(q4)+' · '+fmtKrw(q4)+'원','#6f8bff']]; ctx.font='11px sans-serif'; var bw2=196, bh2=rows.length*16+10, bx=hx+12; if(bx+bw2>cr)bx=hx-12-bw2; if(bx<cl)bx=cl+4; var by=ct+6; ctx.fillStyle='rgba(9,13,20,0.95)'; ctx.fillRect(bx,by,bw2,bh2); ctx.strokeStyle='rgba(90,120,240,0.5)'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw2,bh2); rows.forEach(function(l,li){ var ly=by+17+li*16; ctx.textAlign='left'; ctx.fillStyle='#5a6576'; ctx.fillText(l[0],bx+9,ly); ctx.textAlign='right'; ctx.fillStyle=l[2]; ctx.fillText(l[1],bx+bw2-9,ly); }); ctx.textAlign='start'; }
    requestAnimationFrame(draw); }
  function buildPills(){ var sp=$('#lqSyms'), tp=$('#lqTfs'); if(sp){ sp.innerHTML=SYMS.map(function(s){return '<button class="lqpill'+(s===st.sym?' on':'')+'" data-s="'+s+'">'+s+'</button>';}).join(''); sp.querySelectorAll('.lqpill').forEach(function(b){ b.onclick=function(){ switchSym(b.dataset.s); }; }); } if(tp){ tp.innerHTML=TFS.map(function(t){return '<button class="lqpill'+(t[0]===st.tf?' on':'')+'" data-t="'+t[0]+'">'+t[1]+'</button>';}).join(''); tp.querySelectorAll('.lqpill').forEach(function(b){ b.onclick=function(){ switchTf(b.dataset.t); }; }); } }
  function switchSym(s){ if(s===st.sym)return; st.sym=s; st.binFixed=false; st.bins=new Map(); st.model=new Map(); st.oiUsd=0; st.tot=0; st.cnt=0; st.feed=[]; st.candles=[]; st.deriv=null; st.visN=0; st.pan=0; buildPills(); var lg=$('#lqLgSym'); if(lg)lg.textContent=s; renderFeed(); renderDeriv(); loadKlines().then(function(){ return loadOI(); }).then(renderStats).catch(function(){}); connectWS(); loadDeriv(); dirty=true; }
  function switchTf(t){ if(t===st.tf)return; st.tf=t; st.binFixed=false; st.bins=new Map(); st.visN=0; st.pan=0; buildPills(); var lg=$('#lqLgTf'); if(lg)lg.textContent=(TFS.filter(function(x){return x[0]===t;})[0]||['','15분'])[1]; loadKlines().then(function(){dirty=true;}).catch(function(){}); }
  function searchCoin(raw){ var inp=$('#lqSearch'), s=(raw||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/USDT$/,''); if(!s)return; if(inp)inp.placeholder='🔍 '+s+' 확인 중…'; fetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol='+s+'USDT').then(function(r){return r.json();}).then(function(j){ if(j&&j.price){ if(SYMS.indexOf(s)<0){ SYMS.unshift(s); if(SYMS.length>9)SYMS.pop(); } switchSym(s); if(inp){ inp.value=''; inp.placeholder='🔍 코인 검색 (예: ADA·1000PEPE·SUI)'; } } else { if(inp)inp.placeholder='❌ 없는 심볼: '+s; } }).catch(function(){ if(inp)inp.placeholder='❌ 검색 실패 · 다시'; }); }
  function start(){ cv=$('#lqChart'); if(!cv)return; ctx=cv.getContext('2d'); var lg=$('#lqLgSym'); if(lg)lg.textContent=st.sym; cv.style.cursor='grab';
    var drag=null; function bwNow(){ var vn=st.visN>0?st.visN:(st.candles.length||1); return (W-PADR-PADL)/(vn||1); }
    function panBy(dx,pan0){ var N=st.candles.length; var vn=st.visN>0?st.visN:N; var steps=Math.round(dx/(bwNow()||1)); var maxPan=Math.max(0,N-vn); var np=pan0+steps; if(np<0)np=0; if(np>maxPan)np=maxPan; if(np!==st.pan){ st.pan=np; dirty=true; } }
    cv.addEventListener('wheel',function(e){ e.preventDefault(); zoomBy(e.deltaY>0?1.12:0.89); },{passive:false});
    cv.addEventListener('mousedown',function(e){ drag={x:e.clientX,pan0:st.pan,moved:false}; cv.style.cursor='grabbing'; });
    window.addEventListener('mouseup',function(){ if(drag){ drag=null; if(cv)cv.style.cursor='grab'; } });
    cv.addEventListener('mousemove',function(e){ if(drag){ var dx=e.clientX-drag.x; if(Math.abs(dx)>2)drag.moved=true; panBy(dx,drag.pan0); st.hover=null; } else { hoverAt(e.clientX); } });
    cv.addEventListener('mouseleave',function(){ st.hover=null; dirty=true; });
    cv.addEventListener('touchstart',function(e){ if(e.touches[0]){ drag={x:e.touches[0].clientX,pan0:st.pan,moved:false}; hoverAt(e.touches[0].clientX); } },{passive:true});
    cv.addEventListener('touchmove',function(e){ if(!e.touches[0])return; if(drag){ var dx=e.touches[0].clientX-drag.x; if(Math.abs(dx)>3){ drag.moved=true; panBy(dx,drag.pan0); st.hover=null; } else hoverAt(e.touches[0].clientX); } },{passive:true});
    cv.addEventListener('touchend',function(){ drag=null; },{passive:true});
    var zin=$('#lqZin'); if(zin)zin.onclick=function(){ zoomBy(0.7); }; var zout=$('#lqZout'); if(zout)zout.onclick=function(){ zoomBy(1.4); }; var zrst=$('#lqZrst'); if(zrst)zrst.onclick=function(){ st.visN=0; st.pan=0; dirty=true; };
    var thr=$('#lqThresh'); if(thr)thr.oninput=function(){ st.thresh=+thr.value; var tv=$('#lqThreshV'); if(tv)tv.textContent=(+thr.value).toFixed(2); dirty=true; };
    var sbsC=$('#lqSbs'); if(sbsC)sbsC.onchange=function(){ st.sbs=sbsC.checked; dirty=true; };
    var inp=$('#lqSearch'); if(inp)inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); searchCoin(inp.value); } });
    buildPills(); renderFeed(); resize(); [60,200,500,1200,2500].forEach(function(ms){ timers.push(setTimeout(resize,ms)); });
    loadKlines().then(function(){ dirty=true; return loadOI(); }).then(function(){ renderStats(); }).catch(function(){ var lt=$('#lqLiveTxt'); if(lt)lt.textContent='캔들 로드 실패(잠시 후 재시도)'; });
    connectWS(); loadDeriv(); requestAnimationFrame(draw);
    timers.push(setInterval(function(){ loadTicker().then(function(){ dirty=true; }); },5000));
    timers.push(setInterval(function(){ loadKlines().then(function(){ return loadOI(); }).then(function(){dirty=true;}).catch(function(){}); },30000));
    timers.push(setInterval(loadDeriv,30000)); timers.push(setInterval(renderStats,1000)); }
  function stop(){ stopped=true; if(st.ws){ try{st.ws.onclose=null;st.ws.close();}catch(e){} st.ws=null; } timers.forEach(function(t){ clearTimeout(t); clearInterval(t); }); timers=[]; }
  window.addEventListener('resize',resize);
  return { start:start, stop:stop };
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
/* 코인 상세 — VANTOR 네이티브(주식 상세와 동일 디자인). Binance 실데이터 + drawStockChart 재사용 */
var _coinCur=null;
async function openCoin(sym){
  sym=(sym||'BTC').toUpperCase().replace(/USDT$/,''); _coinCur=sym;
  var host=$('#coinHost'), body=$('#coinBody'); if(!host)return;
  host.style.display='block'; if(body)body.style.display='none'; var _cs=$('#coinSection'); if(_cs)_cs.style.display='none'; if(typeof stopLiq==='function')stopLiq(); if(typeof stopFlow==='function')stopFlow(); window.scrollTo({top:0,behavior:'smooth'});
  host.innerHTML='<button class="more" onclick="closeCoin()" style="background:none;border:none;font-family:inherit;padding:0;margin-bottom:10px;cursor:pointer">◀ 코인 목록</button><div style="padding:30px;color:var(--faint)">'+esc(sym)+' 불러오는 중…</div>';
  var s=sym+'USDT', F='https://fapi.binance.com/fapi/v1/', D='https://fapi.binance.com/futures/data/';
  var TF=window._coinTF||'1h'; window._coinTF=TF;
  var TFLIM={'1m':500,'5m':500,'15m':500,'30m':500,'1h':500,'4h':500,'1d':500};
  var TFLAB={'1m':'1분','5m':'5분','15m':'15분','30m':'30분','1h':'1시간','4h':'4시간','1d':'1일'};
  if(!window._coinLineOn){ try{window._coinLineOn=JSON.parse(localStorage.getItem('coinLines'))||null;}catch(e){} if(!window._coinLineOn)window._coinLineOn={sr:true,ch:true,tr:true,fib:true,poc:true,ma:true,ob:true,fvg:false,bos:false,liq:false,kz:false}; }
  try{
    var res=await Promise.all([
      fetch(F+'ticker/24hr?symbol='+s).then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(F+'klines?symbol='+s+'&interval='+TF+'&limit='+(TFLIM[TF]||120)).then(function(r){return r.json();}).catch(function(){return [];}),
      fetch(F+'premiumIndex?symbol='+s).then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(F+'openInterest?symbol='+s).then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(D+'globalLongShortAccountRatio?symbol='+s+'&period=5m&limit=1').then(function(r){return r.json();}).catch(function(){return null;})
    ]);
    if(_coinCur!==sym)return; // 그새 다른 코인 선택
    var tk=res[0], kl=res[1], fund=res[2], oi=res[3], ls=res[4];
    if(!tk||!tk.lastPrice){ host.innerHTML='<button class="more" onclick="closeCoin()" style="background:none;border:none;font-family:inherit;cursor:pointer">◀ 코인 목록</button><div style="padding:24px;color:var(--down)">'+esc(sym)+' 데이터를 불러오지 못했어요</div>'; return; }
    var px=+tk.lastPrice, ch=+tk.priceChangePercent, hi=+tk.highPrice, lo=+tk.lowPrice, qv=+tk.quoteVolume;
    var candles=Array.isArray(kl)?kl.map(function(k){return [k[0],+k[1],+k[2],+k[3],+k[4],+k[5]];}):[];
    var r={c:sym,n:sym,mk:'COIN',ccy:'USD',px:px,ch:ch,hi:hi,lo:lo,_candles:candles}; window._coinR=r;
    var fr=(fund&&fund.lastFundingRate!=null)?(+fund.lastFundingRate*100):null;
    var oiUsd=(oi&&oi.openInterest)?(+oi.openInterest*px):null;
    var la=(ls&&ls[0])?(+ls[0].longAccount*100):null;
    var rp=Math.max(0,Math.min(100,Math.round((px-lo)/((hi-lo)||1)*100)));
    var summaryBox='<div class="sect">📊 24H 시세 요약</div><div class="lqcard" style="margin-top:0">'
      +'<div class="kv"><span class="muted">24h 레인지 위치</span><span class="num"><span class="bar"><i style="left:'+rp+'%"></i></span> '+rp+'%</span></div>'
      +'<div class="kv"><span class="muted">매수세 (호가)</span><span class="num" id="cBpTxt"><span class="muted">로딩…</span></span></div>'
      +'<div class="kv"><span class="muted">저항 (돌파목표)</span><span class="num" style="font-weight:700">'+coinPx(hi)+'</span></div>'
      +'<div class="kv"><span class="muted">지지</span><span class="num" style="font-weight:700">'+coinPx(lo)+'</span></div>'
      +'<p class="rsub" id="cRangeNote">레인지 '+rp+'%'+(rp>=85?' (고점권·추격 롱 손익비 불리)':rp<=25?' (저점권)':'')+' · 펀딩 '+(fr==null?'—':((fr>=0?'+':'')+fr.toFixed(4)+'%'))+'.</p></div>';
    var tfRow='<div class="tfrow" id="cTfRow" style="display:flex;gap:5px;flex-wrap:wrap;margin:12px 0 7px">'+['1m','5m','15m','30m','1h','4h','1d'].map(function(t){return '<button class="tf'+(t===TF?' on':'')+'" onclick="setCoinTF(\''+t+'\')">'+TFLAB[t]+'</button>';}).join('')+'<button class="tf" onclick="openChartFs()" title="차트 크게 보기" style="margin-left:auto">⛶ 확대</button></div>';
    var LK=[['sr','지지/저항','#2ebd85'],['ch','채널','#4a9eff'],['tr','추세선','#e0a83e'],['fib','피보','#a06bff'],['poc','매물대','#ff9800'],['ma','이평','#f5a623'],['ob','오더블럭','#22a374'],['fvg','FVG','#26c6da'],['bos','BOS/CHoCH','#ec40a6'],['liq','유동성','#ffa726'],['kz','킬존','#7e57c2']];
    var legend='<div class="clegend">'+'<span class="muted" style="font-weight:700;font-size:11px;align-self:center">선 표시 ›</span>'+LK.map(function(k){var on=window._coinLineOn[k[0]]!==false;return '<span class="lgd'+(on?'':' off')+'" onclick="toggleCoinLine(\''+k[0]+'\')"><i style="background:'+k[2]+'"></i>'+k[1]+'</span>';}).join('')+'</div>';
    var drawbar='<div class="drawbar" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin:2px 0 6px"><span class="muted" style="font-weight:700;font-size:11px">✏️ 그림 ›</span>'+[['move','🖱 이동'],['trend','／ 추세선'],['hline','― 수평선'],['box','▭ 박스']].map(function(t){return '<button class="tf drawbtn'+(t[0]==='move'?' on':'')+'" data-tool="'+t[0]+'" onclick="setDrawTool(\''+t[0]+'\')" style="padding:4px 10px;font-size:12px">'+t[1]+'</button>';}).join('')+'<button class="tf" onclick="undoDraw()" style="padding:4px 10px;font-size:12px">↩ 취소</button><button class="tf" onclick="clearDraws()" style="padding:4px 10px;font-size:12px">🗑 전체</button></div>';
    var alertBox='<div class="lqcard" style="margin-top:12px"><div class="lqh">🔔 가격 알림</div><div class="alrow"><select id="cAlDir"><option value="above">이상</option><option value="below">이하</option></select><input id="cAlPrice" type="number" inputmode="decimal" placeholder="목표 가격"><button class="tf" onclick="addCoinAlert()">＋ 추가</button></div><div id="cAlList" style="margin-top:8px"></div><div class="muted" style="font-size:11px;margin-top:6px;line-height:1.5">이 탭이 켜져 있을 때 목표가 도달하면 알림이 뜹니다.</div></div>';
    var _fav=(typeof isCoinFav==='function'&&isCoinFav(sym));
    var mark=(fund&&fund.markPrice)?+fund.markPrice:px; window._fundNextTime=(fund&&fund.nextFundingTime)?+fund.nextFundingTime:0; window._coinFundingPct=fr;
    var infoBar='<div class="cinfobar"><span>마크가 <b>'+coinPx(mark)+'</b></span><span class="cib-sep"></span><span>펀딩 <b class="'+(fr==null?'':(fr>=0?'up':'down'))+'">'+(fr==null?'—':((fr>=0?'+':'')+fr.toFixed(4)+'%'))+'</b></span><span class="cib-sep"></span><span>다음 정산 <b id="cFundCd">—</b></span><span class="cib-live">● 실시간</span></div>';
    host.innerHTML=
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><button class="more" onclick="closeCoin()" style="background:none;border:none;font-family:inherit;padding:0;cursor:pointer">◀ 코인 목록</button>'
        +'<button class="cliqbtn" style="margin-left:auto" onclick="openLiqMap(\''+esc(sym)+'\')">🔥 청산맵</button></div>'
      +'<div class="cticker"><div class="cid"><div class="csym">'+esc(sym)
        +' <span class="clive" id="cLiveDot" title="30초 자동 갱신">● LIVE</span>'
        +' <span class="cfav'+(_fav?' on':'')+'" data-sym="'+esc(sym)+'" onclick="toggleCoinFav(\''+esc(sym)+'\',event)" title="관심 추가">'+(_fav?'★':'☆')+'</span></div>'
        +'<div class="csub">'+esc(sym)+'USDT · Binance 무기한 선물</div></div>'
        +'<div class="cpxwrap"><div id="cDetPx">'+_coinPxHtml(px,ch)+'</div></div></div>'
      +'<div class="metrics" id="cDetMet">'+_coinMetricsHtml(hi,lo,qv,fr,oiUsd,la)+'</div>'
      +infoBar
      +tfRow+legend+drawbar
      +'<canvas class="schart" id="coinChartCv"></canvas>'
      +'<p id="cChartCap" style="color:var(--faint);font-size:11.5px;margin:8px 2px 0">📊 Binance '+TFLAB[TF]+'봉 · 위 버튼으로 시간봉·선 전환 · 휠·드래그로 확대/축소·이동 · 오른쪽 가격축 세로 드래그, 아래 시간축 가로 드래그로 늘리기/줄이기 · 더블클릭 리셋. 청산 히트맵은 🔥 청산맵에서.</p>'
      +'<div id="cChartTip" style="margin:9px 2px 0;font-size:12.5px;font-weight:600;color:var(--ink);background:color-mix(in srgb,var(--gold) 10%,var(--panel2));border:1px solid color-mix(in srgb,var(--gold) 30%,transparent);border-radius:10px;padding:9px 12px;line-height:1.55;cursor:pointer" title="클릭하면 다음 팁" onclick="_nextChartTip()"></div>'
      +summaryBox
      +alertBox
      +'<div id="coinTopsig" class="sigcard" style="display:none"></div>'
      +'<div class="sect">📊 수급 · 매매 판단 · 도구</div>'
      +'<div id="coinFlow" class="flowcard"><div class="muted" style="font-size:12px;padding:6px 0">롱·숏 & 매물대 불러오는 중…</div></div>'
      +'<div class="sect">📓 매매 일지 <span style="font-weight:400;color:var(--faint);font-size:11px;text-transform:none">· 진입 근거 남기고 복기</span></div>'
      +'<div id="cJournal" class="flowcard"></div>';
    window._chartZoom=Math.min(90,candles.length||90); window._chartPan=0; window._chartYScale=1; // 뷰 초기화
    var cv=host.querySelector('#coinChartCv'); if(cv&&typeof drawStockChart==='function'){ drawStockChart(cv,r); _attachChartZoom(cv); if(typeof _attachDraw==='function')_attachDraw(cv,function(){return window._coinR;}); }
    window._drawTool='move';
    if(typeof coinFlow==='function')coinFlow(sym,s,px);
    if(typeof mountAskBox==='function')mountAskBox('#coinFlow', function(){ return window._coinR; });
    if(typeof coinDepth==='function')coinDepth(sym);
    if(typeof renderCoinAlerts==='function')renderCoinAlerts(sym);
    if(typeof renderCoinJournal==='function')renderCoinJournal();
    if(typeof _startCoinRefresh==='function')_startCoinRefresh();
    if(typeof _startChartTips==='function')_startChartTips();
    if(typeof _startFundCd==='function')_startFundCd();
  }catch(e){ if(_coinCur===sym)host.innerHTML='<button class="more" onclick="closeCoin()" style="background:none;border:none;font-family:inherit;cursor:pointer">◀ 코인 목록</button><div style="padding:24px;color:var(--down)">불러오기 실패</div>'; }
}
function closeCoin(){ if(typeof stopLiq==='function')stopLiq(); if(typeof stopFlow==='function')stopFlow(); if(typeof _stopChartTips==='function')_stopChartTips(); if(typeof _stopFundCd==='function')_stopFundCd(); var host=$('#coinHost'), body=$('#coinBody'); if(host){host.style.display='none';host.innerHTML='';} var _cs=$('#coinSection'); if(_cs)_cs.style.display='none'; if(body)body.style.display=''; if(typeof coinNav==='function'){ $$('#menu .cmenu-a').forEach(function(a){a.classList.toggle('on',a.dataset.cs==='home');}); } _coinCur=null; if(typeof _cTakerWS!=='undefined'&&_cTakerWS){try{_cTakerWS.close()}catch(e){}_cTakerWS=null;} if(typeof _stopCoinRefresh==='function')_stopCoinRefresh(); }
window.openCoin=openCoin; window.closeCoin=closeCoin;
/* 💡 차트 팁 — 차트 볼 때 도움 팁 회전(클릭 시 다음) */
var CHART_TIPS=[
 '지지·저항은 <b>선이 아니라 구간(존)</b>으로 보세요. 딱 떨어지는 한 가격이 아니라 반응하는 띠입니다.',
 '한 번 뚫린 저항은 다음에 <b>지지로 역할이 바뀝니다</b>(역할전환). 반대도 마찬가지예요.',
 '<b>가짜 이탈(페이크아웃)</b>: 지지를 살짝 깨고 <b>봉 종가로 되돌아오면</b> 오히려 상방 트랩 신호. 꼬리만 나갔다 들어온 건 무효.',
 '돌파는 <b>봉 마감</b>으로 확인하세요. 장중에 삐죽 나온 꼬리로 "뚫렸다"고 판단하면 자주 당합니다.',
 '돌파 후 <b>그 자리를 지지로 리테스트</b>하면 진짜 돌파. 리테스트 실패면 불트랩일 수 있어요.',
 '<b>거래량</b>이 실렸는지 보세요. 거래량 없는 돌파·반등은 신뢰도가 낮습니다.',
 '방향은 <b>높은 시간봉(일·4시간)</b>에서, 진입 타이밍만 낮은 봉에서. 낮은 봉만 보면 노이즈에 휘둘려요.',
 '높은 시간봉의 지지/저항이 더 잘 지켜집니다 — <b>참여자·주문이 더 많이 쌓여</b> 있기 때문이에요.',
 '레인지(횡보)에선 <b>하단 지지→상단 목표</b>, 상단 저항→하단 목표가 기본 시나리오.',
 '박스 돌파 목표는 <b>측정이동</b>: 박스 높이를 돌파 지점에 더한 값이 근거 있는 1차 목표.',
 'RSI <b>다이버전스</b>(가격 저점↓인데 RSI 저점↑)는 반전 신호가 될 수 있어요. 단독 말고 지지와 겹칠 때.',
 '<b>매물대(POC)</b>는 거래량이 가장 많이 쌓인 가격 — 강한 지지·저항으로 작동합니다.',
 '펀딩비가 <b>극단적으로 높으면</b> 한쪽 쏠림 과열 → 반대방향 청산 스퀴즈를 조심하세요.',
 '진입 전 체크: <b>셋업·손절·손익비·1~2% 룰·청산가·심리</b> 전부 "예"일 때만. 하나라도 아니오면 관망.',
 '손절은 % 로 찍지 말고 <b>"이 가격이면 내 판단이 틀렸다"</b>는 구조 자리(스윙 저점 아래 등)에 두세요.',
 '<b>계단식 상승(저점 높이기)</b>은 건강한 상승 구조예요. 저점 라인이 안 깨지는 한 추세 유효, 깨지면 경고.',
 '<b>기간조정</b> = 안 빠지고 옆으로 횡보하며 시간으로 식히는 것. 급등 후 저항 앞 좁은 박스가 대표적.',
 '<b>BTC 도미넌스</b>가 내리면 알트로 돈이 도는 <b>순환매·알트장</b> 신호. BTC 횡보 중 알트만 오를 때 특히.',
 '<b>10년물 국채금리↑</b>는 위험자산(코인)에 하방 압력. 금리 안정되면 재반등 여력. 큰 방향은 금리만으론 안 정해져요.',
 '같은 반등도 <b>현물 매수압력이 오르며</b> 반등하면 건강, <b>빠지며</b> 반등하면 약함. 온체인으로 "돈의 성격"을 봐요.',
 'CPI·FOMC·잭슨홀 <b>지표 발표 시각</b>엔 변동성 급증. 그 시간대엔 무리한 진입·고배율 자제가 안전해요.',
 '추세선을 넘어도 <b>다시 안으로 복귀하는지</b> 먼저 보세요. 복귀하면 가짜 돌파 — "넘고 안 돌아오나"가 진짜.',
 '<b>상승채널 하방 이탈 ≠ 하락 전환</b>. 직전 저점(구조적 지지)을 지키면 재상승 흔해요. 진짜 기준은 그 저점 사수 여부.',
 '고점 후 조정엔 <b>분산(손바뀜→하락)</b> vs <b>재축적(숨고르기→재상승)</b>. 구조적 저점 사수면 재축적, 이탈이면 분산.',
 'RSI 하락 다이버전스도 <b>맥락</b>이에요. 급등 후 매물 소화 중엔 양성일 수 있어요. 지표 하나로 단정 금물.'
];
var _chartTipIdx=0, _chartTipTimer=null;
function _showChartTip(){ var el=$('#cChartTip'); if(!el)return; el.innerHTML='💡 <b style="color:var(--gold)">차트 팁</b> · '+CHART_TIPS[_chartTipIdx%CHART_TIPS.length]; }
window._nextChartTip=function(){ _chartTipIdx++; _showChartTip(); };
function _startChartTips(){ _stopChartTips(); _chartTipIdx=Math.floor(Math.random()*CHART_TIPS.length); _showChartTip(); _chartTipTimer=setInterval(function(){ if(!$('#cChartTip')){_stopChartTips();return;} _chartTipIdx++; _showChartTip(); },11000); }
function _stopChartTips(){ if(_chartTipTimer){clearInterval(_chartTipTimer);_chartTipTimer=null;} }
/* 다음 펀딩 정산 카운트다운 */
var _fundCdTimer=null;
function _updateFundCd(){ var el=$('#cFundCd'); if(!el)return; var t=window._fundNextTime||0, d=t-Date.now(); if(!(t>0)){el.textContent='—';return;} if(d<=0){el.textContent='정산 임박';return;} var h=Math.floor(d/3600000), m=Math.floor(d%3600000/60000), sec=Math.floor(d%60000/1000); el.textContent=(h>0?h+'시간 ':'')+m+'분 '+('0'+sec).slice(-2)+'초'; }
function _startFundCd(){ _stopFundCd(); _updateFundCd(); _fundCdTimer=setInterval(function(){ if(!$('#cFundCd')){_stopFundCd();return;} _updateFundCd(); },1000); }
function _stopFundCd(){ if(_fundCdTimer){clearInterval(_fundCdTimer);_fundCdTimer=null;} }
/* ===== 코인 상세 분석 도구(선물 터미널 이식): 수급·타점·레버리지·포지션 계산기 ===== */
function _cEma(v,p){var k=2/(p+1),e=v[0],o=[e],i;for(i=1;i<v.length;i++){e=v[i]*k+e*(1-k);o.push(e);}return o;}
function _cRsi(cl,p){if(!cl||cl.length<p+1)return null;var g=0,l=0,i;for(i=1;i<=p;i++){var dd=cl[i]-cl[i-1];if(dd>=0)g+=dd;else l-=dd;}g/=p;l/=p;for(i=p+1;i<cl.length;i++){var d2=cl[i]-cl[i-1],gg=d2>0?d2:0,ll=d2<0?-d2:0;g=(g*(p-1)+gg)/p;l=(l*(p-1)+ll)/p;}if(l===0)return 100;return 100-100/(1+g/l);}
function _cMacd(cl){if(!cl||cl.length<35)return null;var e12=_cEma(cl,12),e26=_cEma(cl,26),md=[],i;for(i=0;i<cl.length;i++)md.push(e12[i]-e26[i]);var sig=_cEma(md,9);var h=md[md.length-1]-sig[sig.length-1],hp=md[md.length-2]-sig[sig.length-2];return {hist:h,rising:h>hp,bull:h>0};}
function _cSig(kl){if(!kl||kl.length<12)return null;var n=kl.length,sx=0,sy=0,sxy=0,sxx=0,i;for(i=0;i<n;i++){var c=+kl[i][4];sx+=i;sy+=c;sxy+=i*c;sxx+=i*i;}var den=n*sxx-sx*sx,sl=den?(n*sxy-sx*sy)/den:0,itc=(sy-sl*sx)/n;var ab=-1e18,be=1e18;for(i=0;i<n;i++){var r=itc+sl*i,h=+kl[i][2]-r,l=+kl[i][3]-r;if(h>ab)ab=h;if(l<be)be=l;}var last=itc+sl*(n-1),lo=last+be,up=last+ab,chH=(ab-be)||1,dir=sl>=0?'long':'short',e,tg,sp,rr;if(dir==='long'){e=lo;tg=up;sp=lo-chH*0.15;rr=(tg-e)/((e-sp)||1);}else{e=up;tg=lo;sp=up+chH*0.15;rr=(e-tg)/((sp-e)||1);}return {dir:dir,entry:e,target:tg,stop:sp,rr:rr};}
function _cVolP(kl){if(!Array.isArray(kl)||!kl.length)return null;var lo=Infinity,hi=-Infinity;kl.forEach(function(k){var l=+k[3],h=+k[2];if(l<lo)lo=l;if(h>hi)hi=h;});var bins=24,w=(hi-lo)/bins;if(!(w>0))return null;var vol=new Array(bins).fill(0);kl.forEach(function(k){var tp=(+k[2]+ +k[3]+ +k[4])/3,v=+k[5];var idx=Math.floor((tp-lo)/w);if(idx<0)idx=0;if(idx>=bins)idx=bins-1;vol[idx]+=v;});var mi=0;for(var i=1;i<bins;i++)if(vol[i]>vol[mi])mi=i;return {low:lo+mi*w,high:lo+(mi+1)*w};}
function _cFmt(n,d){return (+n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});}
function _cDecOf(p){p=Math.abs(+p);if(!isFinite(p))return 2;if(p>=100)return 2;if(p>=1)return 3;if(p>=0.1)return 4;if(p>=0.01)return 5;return 6;}
function _cMoney(v){v=+v||0;return '$'+v.toLocaleString('en-US',{maximumFractionDigits:v<1000?2:0});}
function _cAmt(v){v=+v||0;if(v>=1e12)return (v/1e12).toFixed(2)+'T';if(v>=1e9)return (v/1e9).toFixed(2)+'B';if(v>=1e6)return (v/1e6).toFixed(2)+'M';if(v>=1e3)return (v/1e3).toFixed(1)+'K';return v.toFixed(0);}
var _cTakerWin=[],_cTakerB=0,_cTakerS=0,_cTakerSym=null,_cTakerWS=null,_cTakerLast=0;
function _updateCoinTaker(force){var now=Date.now(),cut=now-90000;while(_cTakerWin.length&&_cTakerWin[0].t<cut){var o=_cTakerWin.shift();_cTakerB-=o.b;_cTakerS-=o.s;}if(!force&&now-_cTakerLast<700)return;_cTakerLast=now;var el=document.getElementById('cLivetaker');if(!el)return;var b=_cTakerB,s=_cTakerS,cnt=_cTakerWin.length,tot=b+s;if(tot<=0)return;var bp=b/tot*100;var gf=el.querySelector('.gf');if(gf)gf.style.width=bp.toFixed(1)+'%';var gl=el.querySelector('.gl');if(gl)gl.textContent='매수 '+bp.toFixed(1)+'%';var gr=el.querySelector('.gr');if(gr)gr.textContent='매도 '+(100-bp).toFixed(1)+'%';var amt=document.getElementById('cLiveamt');if(amt)amt.innerHTML='매수 <b class="up">$'+_cAmt(b)+'</b> · 매도 <b class="down">$'+_cAmt(s)+'</b> · '+cnt+'건 <span class="muted">(최근 90초 공격적 체결)</span>';}
function _openCoinTaker(bn){if(_cTakerWS){try{_cTakerWS.close()}catch(e){}_cTakerWS=null;}if(_cTakerSym!==bn){_cTakerWin=[];_cTakerB=0;_cTakerS=0;_cTakerSym=bn;}try{_cTakerWS=new WebSocket('wss://fstream.binance.com/ws/'+bn.toLowerCase()+'@aggTrade');_cTakerWS.onmessage=function(ev){try{var m=JSON.parse(ev.data);var p=+m.p;if(!p)return;var qv=(+m.q||0)*p;if(qv<=0)return;var isBuy=(m.m===false);_cTakerWin.push({t:(m.T||Date.now()),b:isBuy?qv:0,s:isBuy?0:qv});if(isBuy)_cTakerB+=qv;else _cTakerS+=qv;_updateCoinTaker(false);}catch(e){}};}catch(e){}}
var _cLev=25;try{var _csl=+localStorage.getItem('oxlev');if(_csl)_cLev=_csl;}catch(e){}
window.setCLev=function(n){_cLev=n;try{localStorage.setItem('oxlev',n);}catch(e){}renderCoinLev();coinCalcPos();};
function renderCoinLev(){var el=document.getElementById('cLevblk');if(!el)return;var sg=window._csig,d=sg?_cDecOf(sg.entry):2,mx=75;var steps=[5,10,20,25,50,75].filter(function(v){return v<=Math.max(mx,_cLev);});var btns=steps.map(function(v){return '<button class="tf'+(v===_cLev?' on':'')+'" onclick="setCLev('+v+')">'+v+'x</button>';}).join('');var body='';
  if(sg&&sg.entry&&isFinite(sg.entry)){var isLong=sg.dir==='long',mmr=0.005,liqFrac=Math.max(0.0005,1/_cLev-mmr),liq=isLong?sg.entry*(1-liqFrac):sg.entry*(1+liqFrac),stopDist=Math.abs(sg.entry-sg.stop)/sg.entry*100,liqDist=liqFrac*100,safe=stopDist*1.2<liqDist,safeLev=Math.max(1,Math.floor(1/(stopDist/100*1.2+mmr)));if(safeLev>mx)safeLev=mx;
    body='<div class="lqrow"><span class="muted">청산가 ('+_cLev+'x · '+(isLong?'롱':'숏')+' 진입 '+_cFmt(sg.entry,d)+')</span><span class="num down">'+_cFmt(liq,d)+'</span></div>'
      +'<div class="lqrow"><span class="muted">손절까지 '+stopDist.toFixed(2)+'% · 청산까지 '+liqDist.toFixed(2)+'%</span><span class="num '+(safe?'up':'down')+'">'+(safe?'✅ 손절이 먼저':'⚠️ 청산이 먼저')+'</span></div>'
      +'<div class="lqrow"><span class="muted">이 타점 안전 최대 레버리지</span><span class="num up">'+safeLev+'x</span></div>'
      +(safe?'<div class="muted" style="font-size:11px;margin-top:4px">손절이 청산보다 앞에 있어 계획된 손절이 정상 작동합니다.</div>':'<div style="font-size:11px;margin-top:4px;color:var(--down)">⚠️ '+_cLev+'x에선 손절 전에 청산됩니다. <b>'+safeLev+'x 이하</b>로 낮추세요.</div>');
  }else body='<div class="muted" style="font-size:11.5px">신호가 계산되면 청산·안전 레버리지가 표시됩니다.</div>';
  el.innerHTML='<div class="lqh">⚙️ 레버리지 · 타점 안전도 <span class="muted" style="font-weight:400">(격리 근사)</span></div><div style="margin:6px 0 8px;display:flex;flex-wrap:wrap;gap:4px">'+btns+'</div>'+body+'<div class="muted" style="font-size:11px;margin-top:6px;line-height:1.5">청산=격리 근사(유지증거금 0.5% 가정·수수료 제외). 정확값은 거래소 청산가로 재확인.</div>';}
window.showCHz=function(tf){document.querySelectorAll('#coinHost .hzt').forEach(function(b){b.classList.toggle('on',b.dataset.tf===tf);});var out=document.getElementById('cHzout');if(!out)return;var sg=(window._chz||{})[tf],d=window._chzDec||2;if(!sg){out.innerHTML='<div class="muted" style="font-size:12px;padding:4px 0">이 구간 데이터가 부족해요.</div>';return;}var isLong=sg.dir==='long',tgtPct=Math.abs(sg.target-sg.entry)/sg.entry*100,stpPct=Math.abs(sg.entry-sg.stop)/sg.entry*100,rr=stpPct?tgtPct/stpPct:0;
  out.innerHTML='<div class="lqrow"><span class="muted">방향</span><span class="'+(isLong?'up':'down')+'" style="font-weight:800">'+(isLong?'▲ 롱 (오르면 이익)':'▼ 숏 (내리면 이익)')+'</span></div>'
   +'<div class="lqrow"><span class="muted">'+(isLong?'매수 진입가':'숏 진입가')+'</span><span class="num" style="font-weight:800">'+_cFmt(sg.entry,d)+'</span></div>'
   +'<div class="lqrow"><span class="muted">🎯 목표가 (익절)</span><span class="num up">'+_cFmt(sg.target,d)+' <span class="muted" style="font-size:11px">(+'+tgtPct.toFixed(2)+'%)</span></span></div>'
   +'<div class="lqrow"><span class="muted">✕ 손절가</span><span class="num down">'+_cFmt(sg.stop,d)+' <span class="muted" style="font-size:11px">(−'+stpPct.toFixed(2)+'%)</span></span></div>'
   +'<div class="muted" style="font-size:11.5px;margin-top:7px;line-height:1.6;background:var(--panel);border-radius:8px;padding:8px 10px">💡 <b>손익비 '+rr.toFixed(1)+' : 1</b> — 목표 닿으면 <b class="up">+'+tgtPct.toFixed(2)+'%</b>, 손절되면 <b class="down">−'+stpPct.toFixed(2)+'%</b>. 보통 <b>2:1 이상</b>이면 유리.</div>';};
window.coinCalcPos=function(){var out=document.getElementById('cCalcOut');if(!out)return;var g=function(id){return +(document.getElementById(id)||{}).value||0;};var bal=g('cBal'),rk=g('cRisk'),en=g('cEntry'),st=g('cStop');try{localStorage.setItem('oxbal',bal||'');localStorage.setItem('oxrisk',rk||'');}catch(e){}
  if(!(bal>0&&rk>0&&en>0&&st>0&&en!==st)){out.innerHTML='<div class="muted" style="font-size:11.5px">시드·리스크·진입·손절을 채우면 자동 계산됩니다.</div>';return;}
  var lev=_cLev||1,riskAmt=bal*rk/100,stopDist=Math.abs(en-st)/en,notional=riskAmt/stopDist,qty=notional/en,margin=notional/lev,marginPct=margin/bal*100,liqFrac=Math.max(0.0005,1/lev-0.005),stopFirst=stopDist<liqFrac;
  function R(k,v){return '<div class="calcrow"><span class="muted">'+k+'</span><span class="num">'+v+'</span></div>';}
  var h=R('리스크 금액','<b class="down">'+_cMoney(riskAmt)+'</b> · '+rk+'%')+R('손절까지 거리',(stopDist*100).toFixed(2)+'%')+R('포지션 명목가치',_cMoney(notional))+R('진입 수량',qty.toLocaleString('en-US',{maximumFractionDigits:qty<1?4:2}))+R('필요 증거금 ('+lev+'x)',_cMoney(margin)+' <span class="'+(marginPct>100?'down':'muted')+'">('+marginPct.toFixed(marginPct<10?1:0)+'%)</span>');
  if(marginPct>100)h+='<div class="calcwarn">⚠️ 필요 증거금이 시드를 초과합니다. 레버리지↑ 또는 리스크%↓.</div>';
  else if(!stopFirst)h+='<div class="calcwarn">⚠️ '+lev+'x에선 손절 전에 청산됩니다. 레버리지를 낮추세요.</div>';
  else h+='<div class="calcok">✅ 손절 맞으면 딱 '+_cMoney(riskAmt)+'('+rk+'%)만 잃습니다.</div>';
  out.innerHTML=h;};
async function coinFlow(sym,bn,px){var box=document.getElementById('coinFlow');if(!box)return;var d=_cDecOf(px);
  try{var B='https://fapi.binance.com/futures/data/',F='https://fapi.binance.com/fapi/v1/';
    var r=await Promise.all([
      fetch(B+'globalLongShortAccountRatio?symbol='+bn+'&period=5m&limit=1').then(function(r){return r.json();}).catch(function(){return [];}),
      fetch(B+'topLongShortAccountRatio?symbol='+bn+'&period=5m&limit=1').then(function(r){return r.json();}).catch(function(){return [];}),
      fetch(B+'takerlongshortRatio?symbol='+bn+'&period=5m&limit=1').then(function(r){return r.json();}).catch(function(){return [];}),
      fetch(F+'klines?symbol='+bn+'&interval=15m&limit=200').then(function(r){return r.json();}).catch(function(){return [];}),
      fetch(F+'klines?symbol='+bn+'&interval=4h&limit=120').then(function(r){return r.json();}).catch(function(){return [];}),
      fetch(B+'openInterestHist?symbol='+bn+'&period=1h&limit=6').then(function(r){return r.json();}).catch(function(){return [];}),
      fetch(F+'klines?symbol='+bn+'&interval=5m&limit=200').then(function(r){return r.json();}).catch(function(){return [];}),
      fetch(F+'klines?symbol='+bn+'&interval=1h&limit=200').then(function(r){return r.json();}).catch(function(){return [];})
    ]);
    if(_coinCur!==sym)return;
    var g=(r[0]&&r[0][0])||{},tt=(r[1]&&r[1][0])||{},tk=(r[2]&&r[2][0])||{},kl=r[3]||[],kl4=r[4]||[],oih=r[5]||[],kl5=r[6]||[],kl1h=r[7]||[];
    var gL=+g.longAccount*100||50,gS=100-gL,tL=+tt.longAccount*100||50,tS=100-tL,bV=+tk.buyVol||0,sV=+tk.sellVol||0,tot=bV+sV,bP=tot?bV/tot*100:50;
    var poc=_cVolP(kl),closes=kl.map(function(k){return +k[4];});
    var h='<div class="lqh">실시간 체결 & 롱·숏 수급 <span class="muted" style="font-weight:400">(체결=실시간 · 비율=5분)</span></div>';
    h+='<div class="rlab2"><span>⚡ 실시간 체결 흐름</span><span class="livebadge">● LIVE</span></div>';
    h+='<div id="cLivetaker" class="gbar"><div class="gf" style="width:50%"></div><span class="gl">매수 –</span><span class="gr">매도 –</span></div>';
    h+='<div class="rsub" id="cLiveamt">체결 대기 중… <span class="muted">(최근 90초 공격적 체결)</span></div>';
    h+='<div class="rlab2" style="margin-top:13px"><span>롱 / 숏 계정 비율</span><span class="muted" style="font-weight:600">5분</span></div>';
    h+='<div class="gbar"><div class="gf" data-w="'+gL.toFixed(1)+'"></div><span class="gl">롱 '+gL.toFixed(1)+'%</span><span class="gr">숏 '+gS.toFixed(1)+'%</span></div>';
    h+='<div class="rlab2" style="margin-top:11px"><span>Top Trader 롱 / 숏</span></div>';
    h+='<div class="gbar"><div class="gf" data-w="'+tL.toFixed(1)+'"></div><span class="gl">롱 '+tL.toFixed(1)+'%</span><span class="gr">숏 '+tS.toFixed(1)+'%</span></div>';
    h+='<div class="rsub">Taker 거래량(5분) — 매수 <b class="up">'+bV.toFixed(1)+'</b> / 매도 <b class="down">'+sV.toFixed(1)+'</b> <span class="'+(bP>=50?'up':'down')+'">('+(bP>=50?'매수 우위':'매도 우위')+')</span></div>';
    if(poc)h+='<div class="rsub">📊 매물대 집중(POC) <b>'+_cFmt(poc.low,d)+' ~ '+_cFmt(poc.high,d)+'</b> — 이 구간 거래량 최다(지지·저항↑)</div>';
    var _chips='';
    var rv=_cRsi(closes,14); if(rv!=null){ var rz=rv>=70?'과매수':rv<=30?'과매도':'중립', rc=rv>=70?'down':rv<=30?'up':''; _chips+='<div class="cind"><div class="cind-k">RSI(14)</div><div class="cind-v '+rc+'">'+rv.toFixed(1)+'</div><div class="cind-s">'+rz+'</div></div>'; }
    var mc=_cMacd(closes); if(mc)_chips+='<div class="cind"><div class="cind-k">MACD</div><div class="cind-v '+(mc.bull?'up':'down')+'">'+(mc.bull?'상승 우위':'하락 우위')+'</div><div class="cind-s">'+(mc.rising?'강해지는 중':'약해지는 중')+'</div></div>';
    if(Array.isArray(oih)&&oih.length>=2){ var o1=+oih[oih.length-1].sumOpenInterest,o0=+oih[0].sumOpenInterest,oc=o0?((o1-o0)/o0*100):0; _chips+='<div class="cind"><div class="cind-k">OI 6h</div><div class="cind-v '+(oc>=0?'up':'down')+'">'+(oc>=0?'+':'')+oc.toFixed(1)+'%</div><div class="cind-s">'+(oc>=0?'포지션 증가':'감소')+'</div></div>'; }
    if(_chips)h+='<div class="cindgrid">'+_chips+'</div>';
    var t5=_cSig(kl5),t15=_cSig(kl),t1h=_cSig(kl1h),t4=_cSig(kl4);
    window._chz={'5m':t5,'15m':t15,'1h':t1h,'4h':t4};window._chzDec=d;
    var HZ=[['초단기','5m',t5],['단기','15m',t15],['중기','1h',t1h],['장기','4h',t4]];
    var dirs=HZ.map(function(z){return z[2]?z[2].dir:null;}).filter(Boolean),longs=dirs.filter(function(x){return x==='long';}).length,shorts=dirs.length-longs,consensus=longs>=shorts?'long':'short',allAgree=dirs.length>0&&(longs===dirs.length||shorts===dirs.length);
    h+='<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:9px"><div class="lqh">🎯 타점 — 구간 선택 <span class="muted" style="font-weight:400">(버튼을 누르면 진입·목표·손절)</span></div>'
      +'<div class="hztabs">'+HZ.map(function(z){var dc=z[2]?(z[2].dir==='long'?'up':'down'):'muted',ar=z[2]?(z[2].dir==='long'?'▲롱':'▼숏'):'-';return '<button class="hzt" data-tf="'+z[1]+'" onclick="showCHz(\''+z[1]+'\')">'+z[0]+'<span class="'+dc+'">'+ar+'</span></button>';}).join('')+'</div><div id="cHzout"></div>'
      +'<div class="muted" style="font-size:11px;margin-top:5px;line-height:1.5">'+(allAgree?('✅ 네 구간 방향이 모두 '+(longs?'상승':'하락')+' → 신뢰 높음'):'⚠️ 구간별 방향이 엇갈립니다 — 볼 구간을 정하고 그 버튼만 보세요.')+'</div></div>';
    var n=kl.length,sx=0,sy=0,sxy=0,sxx=0,i;for(i=0;i<n;i++){var cc=+kl[i][4];sx+=i;sy+=cc;sxy+=i*cc;sxx+=i*i;}
    var den=n*sxx-sx*sx,sl=den?(n*sxy-sx*sy)/den:0,itc=(sy-sl*sx)/n,above=-1e18,below=1e18;
    for(i=0;i<n;i++){var r0=itc+sl*i,hh=+kl[i][2]-r0,ll=+kl[i][3]-r0;if(hh>above)above=hh;if(ll<below)below=ll;}
    var last=itc+sl*(n-1),lower=last+below,upper=last+above,chH=(above-below)||1,stop=lower-chH*0.15;
    h+='<div id="cLevblk" class="lqcard" style="margin-top:10px"></div>';
    var _bal='',_rk='1';try{_bal=localStorage.getItem('oxbal')||'';_rk=localStorage.getItem('oxrisk')||'1';}catch(e){}
    var _pd=Math.max(2,_cDecOf(px));
    h+='<div class="lqcard" style="margin-top:10px"><div class="lqh">🧮 포지션 계산기 <span class="muted" style="font-weight:400">(리스크 관리 · '+_cLev+'x)</span></div>'
     +'<div class="calcgrid"><label>시드 (USDT)<input id="cBal" type="number" inputmode="decimal" placeholder="예: 1000" value="'+_bal+'" oninput="coinCalcPos()"></label>'
     +'<label>1회 리스크 %<input id="cRisk" type="number" inputmode="decimal" placeholder="1~2" value="'+_rk+'" oninput="coinCalcPos()"></label>'
     +'<label>진입가<input id="cEntry" type="number" inputmode="decimal" value="'+(+lower.toFixed(_pd))+'" oninput="coinCalcPos()"></label>'
     +'<label>손절가<input id="cStop" type="number" inputmode="decimal" value="'+(+stop.toFixed(_pd))+'" oninput="coinCalcPos()"></label></div><div id="cCalcOut"></div>'
     +'<div class="muted" style="font-size:11px;margin-top:6px;line-height:1.5">레버리지는 위 ⚙️의 '+_cLev+'x 사용. 손절 시 리스크%만 잃도록 수량 역산.</div>'
     +'<button class="tf" style="margin-top:9px" onclick="coinLogTrade()">📓 이 설정 일지에 기록</button></div>';
    h+='<div class="lqcard" style="margin-top:10px"><button class="tf" onclick="runCoinBacktest()">🔬 이 지표 과거에 맞았나 검증</button><div id="cBtBox" style="margin-top:8px"></div></div>';
    box.innerHTML=h;
    box.querySelectorAll('.gf[data-w]').forEach(function(f){var w=f.dataset.w;requestAnimationFrame(function(){f.style.width=w+'%';});});
    var e,tg,sp;if(consensus==='long'){e=lower;tg=upper;sp=stop;}else{e=upper;tg=lower;sp=upper+chH*0.15;}
    window._csig={dir:consensus,entry:e,stop:sp,target:tg,px:px};
    renderCoinLev();coinCalcPos();showCHz('15m');_updateCoinTaker(true);
    var ts=document.getElementById('coinTopsig');
    // 🧭 진입 환경(컨플루언스) — 매수세·수급·지표가 몇 개나 겹치는지(교육용, 신호 아님)
    var _cf=[]; var _vote=function(l,d,x){ _cf.push({l:l,d:d,x:x}); };
    _vote('실시간 매수세', bP>=55?'long':(bP<=45?'short':'flat'), bP>=55?'매수 우위':bP<=45?'매도 우위':'균형');
    _vote('Top Trader', tL>=52?'long':(tL<=48?'short':'flat'), '롱 '+tL.toFixed(0)+'%');
    if(rv!=null)_vote('RSI(14)', rv<=35?'long':(rv>=65?'short':'flat'), rv.toFixed(0)+(rv<=35?' 과매도':rv>=65?' 과매수':' 중립'));
    if(mc)_vote('MACD', mc.bull?'long':'short', mc.bull?'상승 우위':'하락 우위');
    var _fp=window._coinFundingPct; if(_fp!=null)_vote('펀딩 극단', _fp>=0.05?'short':(_fp<=-0.03?'long':'flat'), (_fp>=0?'+':'')+_fp.toFixed(4)+'%'+(_fp>=0.05?' 롱과열':_fp<=-0.03?' 숏과열':' 보통'));
    var _vols=kl.map(function(k){return +k[5];}), _vn=_vols.length; if(_vn>=25){ var _vr=_vols.slice(-5).reduce(function(a,b){return a+b;},0)/5, _vp2=_vols.slice(-25,-5).reduce(function(a,b){return a+b;},0)/20, _volUp=_vr>_vp2*1.1; _vote('거래량 동력', _volUp?consensus:'flat', _volUp?'실림(동력↑)':'빈약'); }
    _vote('타점 4구간', consensus, (consensus==='long'?longs:shorts)+'/'+dirs.length+' 일치');
    var _lv=_cf.filter(function(f){return f.d==='long';}).length, _sv=_cf.filter(function(f){return f.d==='short';}).length, _tot=_cf.length;
    var _env,_ec; if(_lv-_sv>=2){_env='매수 우호';_ec='up';} else if(_sv-_lv>=2){_env='매도 우호';_ec='down';} else {_env='중립·혼조';_ec='';}
    var _cfRows=_cf.map(function(f){ var a=f.d==='long'?'<span class="up">▲ 롱</span>':f.d==='short'?'<span class="down">▼ 숏</span>':'<span class="muted">– 중립</span>'; return '<div class="cfrow"><span class="muted">'+f.l+'</span><span>'+a+' <span class="muted" style="font-size:11px">'+f.x+'</span></span></div>'; }).join('');
    var _cfBox='<div class="cfbox"><div class="cfhead">🧭 진입 환경 <span class="muted" style="font-weight:400;text-transform:none">(컨플루언스 · 교육용)</span> <span class="'+_ec+'" style="margin-left:auto;font-weight:800">'+_env+' '+Math.max(_lv,_sv)+'/'+_tot+'</span></div>'+_cfRows+'<div class="muted" style="font-size:11px;margin-top:8px;line-height:1.5">근거가 <b>몇 개나 겹치는지(컨플루언스)</b>를 보여주는 <b>교육용 참고</b>예요. "지금 사라"는 신호가 아닙니다. 진입은 항상 <b>손절·손익비</b>와 함께 — 아래 🎯 타점에서 진입가·손절을 확인하세요.</div></div>';
    if(ts){var cnt2=(consensus==='long'?longs:shorts)+'/'+dirs.length,verdict=allAgree?((consensus==='long'?'▲ 롱 우세':'▼ 숏 우세')+' ('+cnt2+')'):'⚖ 혼조 · 관망';
      ts.className='sigcard '+(allAgree?(consensus==='long'?'sig-long':'sig-short'):'');ts.style.display='block';
      ts.innerHTML='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="sigdir '+(allAgree?(consensus==='long'?'up':'down'):'')+'"'+(allAgree?'':' style="color:var(--gold)"')+'>'+verdict+'</span><span class="muted" style="font-size:11.5px">4구간 종합 · 교육용</span></div><div class="muted" style="font-size:11.5px;margin-top:5px;line-height:1.5">'+(allAgree?'네 구간 방향 일치 — 아래 🎯 타점에서 구간별 진입가를 확인하세요.':'⚠️ 구간 방향이 엇갈립니다 — 확신 진입보다 관망 권장.')+'</div>'+_cfBox;}
    _openCoinTaker(bn);
  }catch(e){if(_coinCur===sym)box.innerHTML='<div class="muted" style="font-size:12px;padding:2px 0">수급 데이터를 불러오지 못했어요</div>';}
}
window.coinFlow=coinFlow;
/* 코인 상세 지표 카드 HTML(오픈·갱신 공용) */
function _coinFUsd(a){ a=+a||0; return a>=1e9?'$'+(a/1e9).toFixed(2)+'B':(a>=1e6?'$'+(a/1e6).toFixed(1)+'M':'$'+Math.round(a).toLocaleString('en-US')); }
function _coinPxHtml(px,ch){ var cls=ch>=0?'up':'down'; return '<span class="cpx">'+coinPx(px)+'</span> <span class="chgpill '+cls+'">'+(ch>=0?'▲ +':'▼ ')+Math.abs(ch).toFixed(2)+'%</span>'; }
function _coinMetricsHtml(hi,lo,qv,fr,oiUsd,la){
  var cmet=function(k,v,su,c){ return '<div class="met"><div class="k">'+k+'</div><div class="v '+(c||'')+'">'+v+'</div><div class="s">'+(su||'')+'</div></div>'; };
  return cmet('24h 고가',coinPx(hi),'',null)+cmet('24h 저가',coinPx(lo),'',null)+cmet('거래대금',_coinFUsd(qv),'24h',null)
    +cmet('펀딩비',fr==null?'—':((fr>=0?'+':'')+fr.toFixed(4)+'%'),fr==null?'':(fr>=0?'롱→숏 지불':'숏→롱 지불'),fr==null?'':(fr>=0?'up':'down'))
    +cmet('미결제약정',oiUsd==null?'—':_coinFUsd(oiUsd),'OI',null)
    +cmet('롱/숏 계정',la==null?'—':('롱 '+la.toFixed(0)+'%'),la==null?'':('숏 '+(100-la).toFixed(0)+'%'),la==null?'':(la>=50?'up':'down'));
}
/* 시간봉 전환 */
window.setCoinTF=function(tf){ if(window._coinTF===tf)return; window._coinTF=tf; if(_coinCur)openCoin(_coinCur); };
/* 선 표시 토글(차트만 다시 그림) */
window.toggleCoinLine=function(k){ if(!window._coinLineOn)window._coinLineOn={sr:true,ch:true,tr:true,fib:true,poc:true,ma:true,ob:true,fvg:false,bos:false,liq:false,kz:false}; window._coinLineOn[k]=(window._coinLineOn[k]===false); try{localStorage.setItem('coinLines',JSON.stringify(window._coinLineOn));}catch(e){}
  var host=$('#coinHost'), LK=['sr','ch','tr','fib','poc','ma','ob','fvg','bos','liq','kz'];
  if(host){ var lgds=host.querySelectorAll('.clegend .lgd'); lgds.forEach(function(el,i){ var key=LK[i]; if(key)el.classList.toggle('off', window._coinLineOn[key]===false); }); }
  var cv=$('#coinChartCv'); if(cv&&window._coinR&&typeof drawStockChart==='function')drawStockChart(cv,window._coinR);
};
/* 상세 자동 갱신(30초) — 가격·지표·차트 + 알림 체크 */
var _coinRefTimer=null;
function _startCoinRefresh(){ _stopCoinRefresh(); _coinRefTimer=setInterval(function(){ if(coinMode&&_coinCur){ refreshCoinDetail(); } else _stopCoinRefresh(); }, 30000); }
function _stopCoinRefresh(){ if(_coinRefTimer){clearInterval(_coinRefTimer);_coinRefTimer=null;} }
async function refreshCoinDetail(){ var sym=_coinCur; if(!sym)return; var s=sym+'USDT', F='https://fapi.binance.com/fapi/v1/', D='https://fapi.binance.com/futures/data/';
  var TF=window._coinTF||'1h', TFLIM={'1m':500,'5m':500,'15m':500,'30m':500,'1h':500,'4h':500,'1d':500};
  try{ var res=await Promise.all([
      fetch(F+'ticker/24hr?symbol='+s).then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(F+'klines?symbol='+s+'&interval='+TF+'&limit='+(TFLIM[TF]||120)).then(function(r){return r.json();}).catch(function(){return [];}),
      fetch(F+'premiumIndex?symbol='+s).then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(F+'openInterest?symbol='+s).then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(D+'globalLongShortAccountRatio?symbol='+s+'&period=5m&limit=1').then(function(r){return r.json();}).catch(function(){return null;})
    ]);
    if(_coinCur!==sym)return; var tk=res[0]; if(!tk||!tk.lastPrice)return;
    var px=+tk.lastPrice, ch=+tk.priceChangePercent, hi=+tk.highPrice, lo=+tk.lowPrice, qv=+tk.quoteVolume;
    var kl=res[1], fund=res[2], oi=res[3], ls=res[4];
    var fr=(fund&&fund.lastFundingRate!=null)?(+fund.lastFundingRate*100):null, oiUsd=(oi&&oi.openInterest)?(+oi.openInterest*px):null, la=(ls&&ls[0])?(+ls[0].longAccount*100):null;
    var pxEl=$('#cDetPx'); if(pxEl)pxEl.innerHTML=_coinPxHtml(px,ch);
    var metEl=$('#cDetMet'); if(metEl)metEl.innerHTML=_coinMetricsHtml(hi,lo,qv,fr,oiUsd,la);
    var candles=Array.isArray(kl)?kl.map(function(k){return [k[0],+k[1],+k[2],+k[3],+k[4],+k[5]];}):[];
    var r={c:sym,n:sym,mk:'COIN',ccy:'USD',px:px,ch:ch,hi:hi,lo:lo,_candles:candles}; window._coinR=r;
    var cv=$('#coinChartCv'); if(cv&&typeof drawStockChart==='function')drawStockChart(cv,r);
    var dot=$('#cLiveDot'); if(dot){dot.style.opacity='.35';setTimeout(function(){if($('#cLiveDot'))$('#cLiveDot').style.opacity='1';},400);}
    if(typeof coinDepth==='function')coinDepth(sym);
    checkCoinAlerts(sym,px);
  }catch(e){}
}
window.refreshCoinDetail=refreshCoinDetail;
/* 🔔 가격 알림 */
function _loadCoinAlerts(){ try{return JSON.parse(localStorage.getItem('coinAlerts')||'{}');}catch(e){return {};} }
function _saveCoinAlerts(a){ try{localStorage.setItem('coinAlerts',JSON.stringify(a));}catch(e){} }
window.addCoinAlert=function(){ var sym=_coinCur; if(!sym)return; var dir=($('#cAlDir')||{}).value||'above', price=+($('#cAlPrice')||{}).value||0; if(!(price>0)){alert('목표 가격을 입력하세요');return;}
  var all=_loadCoinAlerts(); if(!all[sym])all[sym]=[]; all[sym].push({dir:dir,price:price,id:(Date.now()+''+Math.floor(price))}); _saveCoinAlerts(all);
  var pe=$('#cAlPrice'); if(pe)pe.value=''; renderCoinAlerts(sym); };
window.removeCoinAlert=function(sym,id){ var all=_loadCoinAlerts(); if(all[sym]){ all[sym]=all[sym].filter(function(a){return a.id!==id;}); _saveCoinAlerts(all); } renderCoinAlerts(sym); };
function renderCoinAlerts(sym){ var el=$('#cAlList'); if(!el)return; var all=_loadCoinAlerts(), list=all[sym]||[];
  if(!list.length){ el.innerHTML='<div class="muted" style="font-size:11.5px">설정된 알림이 없어요.</div>'; return; }
  el.innerHTML=list.map(function(a){ return '<div class="lqrow"><span class="muted">'+(a.dir==='above'?'▲ 이상':'▼ 이하')+' <b style="color:var(--ink)">'+coinPx(a.price)+'</b></span><button class="tf" style="padding:3px 8px;font-size:11px" onclick="removeCoinAlert(\''+esc(sym)+'\',\''+a.id+'\')">삭제</button></div>'; }).join(''); }
window.renderCoinAlerts=renderCoinAlerts;
function checkCoinAlerts(sym,px){ var all=_loadCoinAlerts(), list=all[sym]||[]; if(!list.length)return; var hit=[], keep=[];
  list.forEach(function(a){ if((a.dir==='above'&&px>=a.price)||(a.dir==='below'&&px<=a.price))hit.push(a); else keep.push(a); });
  if(hit.length){ all[sym]=keep; _saveCoinAlerts(all); renderCoinAlerts(sym);
    hit.forEach(function(a){ var msg='🔔 '+sym+' '+(a.dir==='above'?'▲':'▼')+' '+coinPx(a.price)+' 도달 (현재 '+coinPx(px)+')'; if(typeof toast==='function')toast(msg); try{ if(window.Notification&&Notification.permission==='granted')new Notification(msg); }catch(e){} }); }
}
window.checkCoinAlerts=checkCoinAlerts;
/* 매수세 (호가 depth) */
async function coinDepth(sym){ var s=sym+'USDT'; try{ var dd=await fetch('https://fapi.binance.com/fapi/v1/depth?symbol='+s+'&limit=20').then(function(r){return r.json();});
  if(_coinCur!==sym||!dd||!dd.bids)return; var sum=function(a){return a.slice(0,10).reduce(function(t,r){return t+ +r[1];},0);};
  var b=sum(dd.bids), a=sum(dd.asks), bp=Math.round(b/((b+a)||1)*100);
  var el=$('#cBpTxt'); if(el)el.innerHTML='<span class="fill"><span style="width:'+bp+'%"></span></span> '+bp+'% '+(bp>=55?'<span class="up">(매수우위)</span>':bp<=35?'<span class="down">(매도우위)</span>':'<span class="muted">(균형)</span>'); }catch(e){} }
window.coinDepth=coinDepth;
/* 차트 조작(코인·주식 공용, CHART 전역):
   본문=드래그 팬·휠 시간축 줌 / 가격축(오른쪽)=세로 스케일 / 시간축(하단)=가로 스케일 */
var _chDrag={active:false,mode:'pan',sx:0,sy:0,sPan:0,sZoom:90,sYS:1,moved:false,cv:null};
function _chLen(){ return (typeof CHART!=='undefined'&&CHART&&CHART.r&&CHART.r._candles)?CHART.r._candles.length:0; }
function _chRedraw(cv){ if(cv._ivRAF)cancelAnimationFrame(cv._ivRAF); cv._ivRAF=requestAnimationFrame(function(){ if(typeof CHART!=='undefined'&&CHART&&CHART.r)drawStockChart(cv,CHART.r); }); }
function _chRegion(cv,e){ var w=cv.clientWidth||0, h=cv.clientHeight||0; if(w<60||h<60)return 'main'; // 레이아웃 전이면 본문 취급
  var ox=(e.offsetX!=null?e.offsetX:0), oy=(e.offsetY!=null?e.offsetY:0); // CSS 픽셀 기준
  if(ox>w-40) return 'y';   // 오른쪽 가격축 스트립(~40px)
  if(oy>h-24) return 'x';   // 하단 시간축 스트립(~24px)
  return 'main'; }
var _clamp=function(v,a,b){ return Math.max(a,Math.min(b,v)); };
function _attachChartZoom(cv){
  if(!window._chDragBound){ window._chDragBound=true; // 전역 1회: 드래그 이동/종료
    window.addEventListener('mousemove',function(e){ var dg=_chDrag; if(!dg.active)return; var len=_chLen();
      if(dg.mode==='yscale'){ var dy=e.clientY-dg.sy; if(Math.abs(dy)>2){dg.moved=true;window._chartPanning=true;} var ns=_clamp(dg.sYS*(1+(-dy)/220),0.25,10); if(ns!==(window._chartYScale||1)){window._chartYScale=ns;_chRedraw(dg.cv);} return; }
      if(!len)return;
      if(dg.mode==='xzoom'){ var dxx=e.clientX-dg.sx; if(Math.abs(dxx)>2){dg.moved=true;window._chartPanning=true;} var nzx=_clamp(Math.round(dg.sZoom*(1-dxx/320)),20,len); if(nzx!==(window._chartZoom||90)){window._chartZoom=nzx;_chRedraw(dg.cv);} return; }
      var dx=e.clientX-dg.sx; if(Math.abs(dx)>3){dg.moved=true;window._chartPanning=true;}
      var visN=Math.max(20,Math.min(len,window._chartZoom||90)), cwCss=(dg.cv.clientWidth||600)/visN, dC=Math.round(dx/cwCss), maxPan=Math.max(0,len-visN), np=_clamp(dg.sPan+dC,0,maxPan);
      if(np!==(window._chartPan||0)){ window._chartPan=np; _chRedraw(dg.cv); } });
    window.addEventListener('mouseup',function(){ var dg=_chDrag; if(!dg.active)return; dg.active=false; window._chartPanning=false; if(dg.moved)window._chartJustPanned=true; if(dg.cv)dg.cv.style.cursor='grab'; }); }
  if(!cv||cv._wheelBound)return; cv._wheelBound=true; cv.style.cursor='grab';
  cv.addEventListener('wheel', function(e){ var len=_chLen(); if(!len)return; e.preventDefault();
    if(_chRegion(cv,e)==='y'){ var ns=_clamp((window._chartYScale||1)*(e.deltaY<0?1.1:0.9),0.25,10); window._chartYScale=ns; _chRedraw(cv); return; } // 가격축 위 휠=세로 스케일
    var cur=window._chartZoom||90, factor=e.deltaY<0?0.85:1.18, nz=_clamp(Math.round(cur*factor),20,len); if(nz===cur)return; window._chartZoom=nz; _chRedraw(cv);
  }, {passive:false});
  cv.addEventListener('mousedown', function(e){ if(e.button!==0&&e.button!==1)return; if(window._drawTool&&window._drawTool!=='move'&&e.button===0)return; if(e.button===1)e.preventDefault();
    var rg=_chRegion(cv,e); if(rg!=='y'&&!_chLen())return;
    _chDrag.active=true; _chDrag.moved=false; _chDrag.mode=(rg==='y'?'yscale':rg==='x'?'xzoom':'pan'); _chDrag.sx=e.clientX; _chDrag.sy=e.clientY; _chDrag.sPan=window._chartPan||0; _chDrag.sZoom=window._chartZoom||90; _chDrag.sYS=window._chartYScale||1; _chDrag.cv=cv;
    cv.style.cursor=(rg==='y'?'ns-resize':rg==='x'?'ew-resize':'grabbing'); });
  cv.addEventListener('mousemove', function(e){ if(_chDrag.active)return; var rg=_chRegion(cv,e); cv.style.cursor=(rg==='y'?'ns-resize':rg==='x'?'ew-resize':'grab'); }); // 커서 힌트
  cv.addEventListener('auxclick', function(e){ if(e.button===1)e.preventDefault(); });
  cv.addEventListener('dblclick', function(){ window._chartYScale=1; window._chartPan=0; _chRedraw(cv); }); // 더블클릭=세로/팬 리셋
}
window._attachCoinWheel=_attachChartZoom; window._attachChartZoom=_attachChartZoom;
/* ── ✏️ 차트 그림 도구 (추세선·수평선·박스, 저장·동기화 · 가격/시간 좌표로 저장돼 줌·TF 바뀌어도 유지) ── */
function _draws(){ try{return JSON.parse(localStorage.getItem('aurDraw')||'{}')||{};}catch(e){return {};} }
function _drawsSave(m){ try{localStorage.setItem('aurDraw',JSON.stringify(m));}catch(e){} }
function _symDraws(sym){ return (_draws()[sym])||[]; }
function _addDraw(sym,d){ if(!sym)return; var m=_draws(); (m[sym]=m[sym]||[]).push(d); if(m[sym].length>80)m[sym].shift(); _drawsSave(m); }
window.setDrawTool=function(t){ window._drawTool=(window._drawTool===t)?'move':t; var host=document.querySelector('#coinHost')||document; host.querySelectorAll('.drawbtn').forEach(function(b){ b.classList.toggle('on', b.dataset.tool===window._drawTool); }); var cv=document.querySelector('#coinChartCv'); if(cv)cv.style.cursor=(window._drawTool&&window._drawTool!=='move')?'crosshair':'grab'; };
window.undoDraw=function(){ var r=window._coinR; if(!r)return; var m=_draws(); if(m[r.c]&&m[r.c].length){ m[r.c].pop(); _drawsSave(m); var cv=document.querySelector('#coinChartCv'); if(cv)drawStockChart(cv,r); } };
window.clearDraws=function(){ var r=window._coinR; if(!r)return; if(!confirm('이 종목의 그림을 모두 지울까요?'))return; var m=_draws(); delete m[r.c]; _drawsSave(m); var cv=document.querySelector('#coinChartCv'); if(cv)drawStockChart(cv,r); };
function _attachDraw(cv,getR){ if(!cv||cv._drawAttached)return; cv._drawAttached=true;
  function toData(e){ var C=CHART; if(!C||C.cv!==cv)return null; var rect=cv.getBoundingClientRect(); if(!rect.width)return null; var cx=(e.clientX-rect.left)*(cv.width/rect.width), cy=(e.clientY-rect.top)*(cv.height/rect.height); var f=(cx-C.padL)/((C.plotR-C.padL)||1); var t=C.data[0][5]+f*((C.data[C.n-1][5]-C.data[0][5])||1); var p=C.hi-(cy-C.padT)/((C.priceB-C.padT)||1)*(C.hi-C.lo); return {t:t,p:p}; }
  var dg=null;
  cv.addEventListener('mousedown',function(e){ var tool=window._drawTool; if(!tool||tool==='move'||e.button!==0)return; e.stopPropagation(); e.preventDefault(); var d=toData(e); if(!d)return; var r=getR&&getR(); if(tool==='hline'){ if(r){_addDraw(r.c,{type:'hline',p:d.p,color:'#e0b552'}); drawStockChart(cv,r);} return; } dg={tool:tool,t1:d.t,p1:d.p}; });
  cv.addEventListener('mousemove',function(e){ if(!dg)return; var d=toData(e); if(!d)return; window._drawPreview={cv:cv,type:dg.tool,t1:dg.t1,p1:dg.p1,t2:d.t,p2:d.p,color:'#e0b552'}; var r=getR&&getR(); if(r)drawStockChart(cv,r); });
  window.addEventListener('mouseup',function(){ if(!dg)return; var pv=window._drawPreview; window._drawPreview=null; var r=getR&&getR(); if(pv&&r&&(Math.abs(pv.t2-pv.t1)>1||Math.abs(pv.p2-pv.p1)>0)){ _addDraw(r.c,{type:dg.tool,t1:pv.t1,p1:pv.p1,t2:pv.t2,p2:pv.p2,color:'#e0b552'}); } dg=null; if(r)drawStockChart(cv,r); });
}
window._attachDraw=_attachDraw;
/* 📓 매매 일지 (localStorage, 종목 공용) */
function _cjLoad(){ try{return JSON.parse(localStorage.getItem('coinTrades')||'[]');}catch(e){return [];} }
function _cjSave(t){ try{localStorage.setItem('coinTrades',JSON.stringify(t));}catch(e){} }
window.coinLogTrade=function(){ var g=function(id){return (document.getElementById(id)||{}).value||'';}; var sg=window._csig||{};
  var en=+g('cEntry')||(sg.entry||0), st=+g('cStop')||(sg.stop||0), tg=sg.target||0, sym=_coinCur||'';
  if(!sym||!(en>0)){ alert('진입가가 필요합니다(계산기에 입력).'); return; }
  var memo=prompt('진입 근거 메모 (선택)')||''; var t=_cjLoad();
  t.unshift({id:Date.now(),sym:sym,dir:(sg.dir||'long'),en:en,st:st,tg:tg,memo:memo.trim(),status:'open',exitP:null,pnl:null,lesson:''});
  _cjSave(t); renderCoinJournal(); var jr=$('#cJournal'); if(jr)jr.scrollIntoView({block:'center',behavior:'smooth'}); };
window.coinCloseTrade=function(id){ var t=_cjLoad(), it=t.find(function(x){return x.id===id;}); if(!it)return;
  var ex=prompt('청산가 입력 ('+it.sym+' '+(it.dir==='long'?'롱':'숏')+' · 진입 '+it.en+')'); if(ex==null)return; ex=+ex; if(!(ex>0)){alert('숫자를 입력하세요');return;}
  it.pnl=it.dir==='long'?(ex-it.en)/it.en*100:(it.en-ex)/it.en*100; it.status='closed'; it.exitP=ex;
  var ls=prompt('이번 매매에서 배운 점 (복기 · 선택)'); it.lesson=(ls||'').trim(); _cjSave(t); renderCoinJournal(); };
window.coinDelTrade=function(id){ if(!confirm('이 기록을 삭제할까요?'))return; _cjSave(_cjLoad().filter(function(x){return x.id!==id;})); renderCoinJournal(); };
/* 📊 매매일지 인사이트 — 내 성향 자기점검(교육용, 매매지시 아님) */
function _journalInsights(trades){ var cl=(trades||[]).filter(function(x){return x.status==='closed'&&x.pnl!=null;}); if(cl.length<3)return null; var out=[];
  function wr(a){ return a.length?a.filter(function(x){return x.pnl>0;}).length/a.length*100:null; }
  var L=cl.filter(function(x){return x.dir==='long';}), S=cl.filter(function(x){return x.dir==='short';});
  if(L.length>=2&&S.length>=2){ var wl=wr(L),ws=wr(S); if(Math.abs(wl-ws)>=20)out.push('<b>'+(wl>ws?'롱':'숏')+'</b>에서 승률이 높아요(롱 '+wl.toFixed(0)+'% · 숏 '+ws.toFixed(0)+'%). 약한 쪽은 진입 조건을 더 깐깐하게.'); }
  var noStop=cl.filter(function(x){return !x.st;});
  if(noStop.length>=2){ var avgNo=noStop.reduce(function(s,x){return s+x.pnl;},0)/noStop.length; out.push('<b>손절 없이</b> 들어간 매매 '+noStop.length+'건 평균 '+(avgNo>=0?'+':'')+avgNo.toFixed(1)+'%'+(avgNo<0?' — 손절 미설정이 손실로 이어지는 패턴.':'.')); }
  var wins=cl.filter(function(x){return x.pnl>0;}), loss=cl.filter(function(x){return x.pnl<0;});
  if(wins.length&&loss.length){ var aw=wins.reduce(function(s,x){return s+x.pnl;},0)/wins.length, al=Math.abs(loss.reduce(function(s,x){return s+x.pnl;},0)/loss.length); out.push('평균 이익 <b class="up">+'+aw.toFixed(1)+'%</b> vs 평균 손실 <b class="down">−'+al.toFixed(1)+'%</b>'+(al>aw*1.2?' — <b>손실이 더 커요</b>. 손절을 더 빨리(손익비 관리).':' — 손익비 양호 👍')); }
  var streak=0,mx=0,i; for(i=0;i<cl.length;i++){ if(cl[i].pnl<0){streak++;if(streak>mx)mx=streak;}else streak=0; }
  if(mx>=3)out.push('<b>연속 손실 최대 '+mx+'회</b> 기록 — 연속 손실 땐 <b>사이즈 축소·휴식</b>이 정석.');
  var les=cl.filter(function(x){return x.lesson;}).length; out.push('복기(배운 점) 기록 <b>'+les+'/'+cl.length+'</b>건'+(les<cl.length*0.5?' — <b>복기율</b>을 높이면 실력이 빨리 늘어요.':' — 복기 습관 좋아요 👍'));
  return out.slice(0,5); }
function renderCoinJournal(){ var el=$('#cJournal'); if(!el)return; var t=_cjLoad(), closed=t.filter(function(x){return x.status==='closed';});
  var _ins=_journalInsights(t), _insHtml=(_ins&&_ins.length)?('<div style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:10px"><div style="font-weight:800;font-size:13px;margin-bottom:6px">📊 내 매매 패턴 <span class="muted" style="font-weight:400;font-size:11px">· 교육용 자기점검</span></div><ul style="margin:0;padding-left:17px;font-size:12.5px;line-height:1.6;display:flex;flex-direction:column;gap:5px">'+_ins.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul></div>'):'';
  var wins=closed.filter(function(x){return x.pnl>0;}).length, wr=closed.length?wins/closed.length*100:0, sumPnl=closed.reduce(function(s,x){return s+(x.pnl||0);},0);
  var rs=closed.map(function(x){ if(!x.st)return null; var risk=Math.abs(x.en-x.st)/x.en*100; return risk?x.pnl/risk:null; }).filter(function(v){return v!=null;});
  var sumR=rs.reduce(function(s,v){return s+v;},0);
  var sc=function(k,v,c){return '<div style="flex:1;min-width:70px;text-align:center;padding:8px 4px;background:var(--panel2);border:1px solid var(--line);border-radius:9px"><div class="muted" style="font-size:10.5px;font-weight:700">'+k+'</div><div class="'+(c||'')+'" style="font-size:15px;font-weight:800;margin-top:2px">'+v+'</div></div>';};
  var stats='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+sc('총 기록',t.length+'건')+sc('청산',closed.length+'건')+sc('승률',closed.length?wr.toFixed(0)+'%':'—',closed.length?(wr>=50?'up':'down'):'')+sc('누적 손익',(sumPnl>=0?'+':'')+sumPnl.toFixed(1)+'%',closed.length?(sumPnl>=0?'up':'down'):'')+sc('누적 R',(sumR>=0?'+':'')+sumR.toFixed(1)+'R',rs.length?(sumR>=0?'up':'down'):'')+'</div>';
  if(!t.length){ el.innerHTML=stats+'<div class="muted" style="font-size:12px;padding:4px 0">아직 기록이 없어요. 위 🧮 계산기의 <b>📓 이 설정 일지에 기록</b>을 눌러 진입 근거를 남기고, 청산 후 복기하세요.</div>'; return; }
  el.innerHTML=stats+_insHtml+t.map(function(x){ var dc=x.dir==='long'?'up':'down', dn=x.dir==='long'?'롱':'숏';
    var head='<div style="display:flex;justify-content:space-between;align-items:center;font-weight:700"><span><b class="'+dc+'">'+dn+'</b> '+esc(x.sym)+'</span>'+(x.status==='closed'?'<span class="num '+(x.pnl>=0?'up':'down')+'">'+(x.pnl>=0?'+':'')+x.pnl.toFixed(2)+'%</span>':'<span style="font-size:11px;color:var(--gold);font-weight:800">진행중</span>')+'</div>';
    var lv='진입 '+x.en+(x.st?' · 손절 '+x.st:'')+(x.tg?' · 목표 '+(+x.tg).toFixed(4):'')+(x.exitP?' · 청산 '+x.exitP:'');
    var memo=x.memo?'<div class="muted" style="font-size:11.5px;margin-top:4px">📝 '+esc(x.memo)+'</div>':'';
    var lesson=x.lesson?'<div style="font-size:11.5px;margin-top:3px;color:var(--gold)">💡 '+esc(x.lesson)+'</div>':'';
    var btns='<div style="display:flex;gap:5px;margin-top:7px">'+(x.status==='open'?'<button class="tf" style="padding:4px 9px;font-size:11px" onclick="coinCloseTrade('+x.id+')">청산 기록</button>':'')+'<button class="tf" style="padding:4px 9px;font-size:11px" onclick="coinDelTrade('+x.id+')">삭제</button></div>';
    return '<div class="lqcard" style="margin-top:8px">'+head+'<div class="muted" style="font-size:12px;margin-top:3px">'+lv+'</div>'+memo+lesson+btns+'</div>'; }).join('');
}
window.renderCoinJournal=renderCoinJournal;
/* 🔬 백테스트 — 지표 정직 검증 */
function _cjSlope(v){var n=v.length,sx=0,sy=0,sxy=0,sxx=0;for(var i=0;i<n;i++){sx+=i;sy+=v[i];sxy+=i*v[i];sxx+=i*i;}var den=n*sxx-sx*sx;return den?(n*sxy-sx*sy)/den:0;}
window.runCoinBacktest=async function(){ var bt=$('#cBtBox'); if(!bt)return; var sym=_coinCur; if(!sym)return; bt.innerHTML='<div class="muted" style="font-size:12px">과거 500봉 분석 중…</div>';
  try{ var kl=await fetch('https://fapi.binance.com/fapi/v1/klines?symbol='+sym+'USDT&interval=4h&limit=500').then(function(r){return r.json();});
    if(!Array.isArray(kl)||kl.length<80){bt.innerHTML='<div class="muted" style="font-size:12px">데이터가 부족합니다.</div>';return;}
    var cl=kl.map(function(k){return +k[4];}), fwd=6, osN=0,osUp=0,osSum=0,obN=0,obDn=0,obSum=0,upN=0,upUp=0;
    for(var i=30;i<cl.length-fwd;i++){ var rsi=_cRsi(cl.slice(0,i+1),14), ret=(cl[i+fwd]-cl[i])/cl[i]*100;
      if(rsi!=null){ if(rsi<=30){osN++; if(ret>0)osUp++; osSum+=ret;} if(rsi>=70){obN++; if(ret<0)obDn++; obSum+=ret;} }
      if(_cjSlope(cl.slice(i-30,i+1))>0){upN++; if(ret>0)upUp++;} }
    var P=function(a,b){return b?a/b*100:0;};
    var verdict=function(prob,n){ if(n<8)return '<span class="muted">표본 부족('+n+')</span>'; if(prob>=58)return '<span class="up">신뢰할만(엣지 있음)</span>'; if(prob<=42)return '<span class="down">오히려 반대로 감</span>'; return '<span class="down">엣지 약함 · 동전던지기</span>'; };
    var R=function(k,v){return '<div class="lqrow"><span class="muted" style="max-width:52%">'+k+'</span><span class="num" style="font-size:12px;text-align:right">'+v+'</span></div>';};
    bt.innerHTML='<div class="lqh">🔬 이 지표, 과거에 맞았나? <span class="muted" style="font-weight:400">('+esc(sym)+' · 4h·500봉 · 이후 24h)</span></div>'
      +R('과매도(RSI≤30) 후 반등', osN+'회 · 상승 '+P(osUp,osN).toFixed(0)+'% · 평균 '+(osN?(osSum/osN).toFixed(2):'0')+'%<br>'+verdict(P(osUp,osN),osN))
      +R('과매수(RSI≥70) 후 하락', obN+'회 · 하락 '+P(obDn,obN).toFixed(0)+'% · 평균 '+(obN?(obSum/obN).toFixed(2):'0')+'%<br>'+verdict(P(obDn,obN),obN))
      +R('상승추세 방향 지속', '다음 24h 상승 '+P(upUp,upN).toFixed(0)+'%<br>'+verdict(P(upUp,upN),upN))
      +'<div class="muted" style="font-size:11px;margin-top:7px;line-height:1.5">⚠️ 과거 통계일 뿐 미래를 보장하지 않습니다. 확률이 50% 근처거나 표본이 적으면 그 지표는 이 종목에서 <b>신뢰도가 낮다</b>는 뜻이에요. 지표 맹신 금물.</div>';
  }catch(e){bt.innerHTML='<div class="muted" style="font-size:12px">분석에 실패했어요.</div>';}
};
function setMode(m){ coinMode=(m==='coin'); if(m!=='coin')closeCoin();
  try{ var _rt=document.documentElement; // 코인 모드는 다크 터미널 느낌으로 기본 전환, 나가면 원복
    if(coinMode){ if(window._preCoinTheme===undefined)window._preCoinTheme=_rt.getAttribute('data-theme'); _rt.setAttribute('data-theme','dark'); }
    else if(window._preCoinTheme!==undefined){ if(window._preCoinTheme)_rt.setAttribute('data-theme',window._preCoinTheme); else _rt.removeAttribute('data-theme'); window._preCoinTheme=undefined; } }catch(e){}
  $$('.segmode button').forEach(function(b){b.classList.toggle('on',b.dataset.m===m);});
  var strip=$('#idxstrip'); if(strip)strip.style.display=coinMode?'none':'';
  _applyCoinMenu(coinMode); // 코인 모드 전용 상단 메뉴(홈/RADAR/섹터/뉴스/관심/기초)
  var db=$('#demoban'); if(db)db.style.display=coinMode?'none':'';
  var brf=$('#brief'); if(brf)brf.style.display=coinMode?'none':'';           // 주식 브리핑은 코인 모드에서 숨김
  var msum=$('#marketSummary'); if(msum)msum.style.display=coinMode?'none':'';  // 주식 시장요약도 숨김
  $$('.view').forEach(function(v){v.classList.remove('on');});
  if(coinMode){ $('#v-coin').classList.add('on'); openCoinTerminal(); coinNav('home'); }
  else { $('#v-home').classList.add('on'); $$('#menu a').forEach(function(a){a.classList.toggle('on',a.dataset.v==='home');}); }
  window.scrollTo({top:0,behavior:'smooth'});
  if(typeof mountHomeAsk==='function'){ try{ mountHomeAsk('#aiAsk','stock'); }catch(e){} }
}
/* 코인 모드 = VANTOR 터미널을 화면에 꽉 차게(full-bleed, 창 아닌 통째 임베드) */
/* 코인 모드 = VANTOR 네이티브 코인 대시보드(주식과 동일 디자인) */
function openCoinTerminal(){
  if(typeof loadCoins==='function')loadCoins();
  if(typeof initCards==='function')setTimeout(initCards,300); // 코인 카드에도 접기 버튼·접힘상태 적용
  if(!window._coinTimer)window._coinTimer=setInterval(function(){ if(coinMode&&typeof loadCoins==='function')loadCoins(); },60000);
}
$$('.segmode button').forEach(function(b){ b.onclick=function(){ setMode(b.dataset.m); }; });

/* ═══════════════════════════════════════════════════════════
   LEARN 탭 — 교육용 학습 콘텐츠 (캔들·패턴·지표·매매원칙·엘리엇 파동)
   ※ 전부 공개된 표준 기술적 분석 개념을 VANTOR가 독자 서술. 매매 신호 아님.
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
    +'<div class="lrow"><div class="ic">📐</div><div><p class="tt">이동평균선 (MA)</p><p class="bd">일정 기간 평균가를 이은 선. 주가가 MA <b>위=상승추세</b>, <b>아래=하락추세</b>. 5·20·60·120일을 많이 씀. VANTOR 차트엔 MA5·20·60이 겹쳐 그려집니다.</p></div></div>'
    +'<div class="lrow"><div class="ic">📊</div><div><p class="tt">거래량 (Volume)</p><p class="bd">얼마나 많은 사람이 참여했나. 가격 움직임은 <b>반드시 거래량으로 검증</b> — 돌파 + 대량거래 = 신뢰.</p></div></div></div>'
    +'<div class="lcard"><h3>🎯 confluence — 신호 겹침이 핵심</h3><p class="lead">한 지표만 믿지 마세요. <b>여러 신호가 같은 방향</b>을 가리킬 때가 진짜 자리입니다.</p>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.7">예) <b style="color:var(--ink)">지지 구간 + RSI 과매도 + 반전 캔들 + 거래량 증가</b> → 네 가지가 겹치면 신뢰도가 높아집니다. VANTOR RADAR의 100점 점수도 같은 원리 — 여러 지표를 합산해 평가합니다.</p></div>'
    +'<div class="lcard"><h3>◆ VANTOR로 바로 실습</h3><p class="lead">배운 걸 실제 시장에서 확인해보세요.</p><div class="chips" style="display:flex;flex-wrap:wrap;gap:8px">'
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
function structCloseSVG(){
  return '<svg width="100%" height="130" viewBox="0 0 260 150" preserveAspectRatio="xMidYMid meet">'
    +'<line x1="10" y1="52" x2="250" y2="52" stroke="var(--sub)" stroke-width="1.4" stroke-dasharray="5 4"/><text x="12" y="44" font-size="10" fill="var(--sub)">저항(스윙 고점)</text>'
    // 거부: 위꼬리만 넘고 종가는 아래
    +'<line x1="80" y1="30" x2="80" y2="96" stroke="var(--down)" stroke-width="3" stroke-linecap="round"/><rect x="70" y="62" width="20" height="30" rx="3" fill="var(--down)"/><text x="80" y="118" text-anchor="middle" font-size="10" fill="var(--down)">✗ 꼬리만 (거부)</text>'
    // 점령: 종가가 위로
    +'<line x1="180" y1="26" x2="180" y2="80" stroke="var(--up)" stroke-width="3" stroke-linecap="round"/><rect x="170" y="30" width="20" height="30" rx="3" fill="var(--up)"/><text x="180" y="118" text-anchor="middle" font-size="10" fill="var(--up)">✓ 종가 돌파 (점령)</text></svg>';
}
function structZoneSVG(){
  return '<svg width="100%" height="150" viewBox="0 0 260 160" preserveAspectRatio="xMidYMid meet">'
    +'<rect x="30" y="18" width="200" height="54" fill="var(--down)" opacity="0.12"/><rect x="30" y="72" width="200" height="54" fill="var(--up)" opacity="0.12"/>'
    +'<line x1="30" y1="18" x2="230" y2="18" stroke="var(--down)" stroke-width="1.4" stroke-dasharray="5 4"/><text x="34" y="14" font-size="9" fill="var(--down)">스윙 고점</text>'
    +'<line x1="30" y1="72" x2="230" y2="72" stroke="var(--gold)" stroke-width="1.6"/><text x="34" y="68" font-size="9" fill="var(--gold)">절반선(50%)</text>'
    +'<line x1="30" y1="126" x2="230" y2="126" stroke="var(--up)" stroke-width="1.4" stroke-dasharray="5 4"/><text x="34" y="138" font-size="9" fill="var(--up)">스윙 저점</text>'
    +'<text x="228" y="48" text-anchor="end" font-size="11" font-weight="800" fill="var(--down)">프리미엄 · 매도 자리</text>'
    +'<text x="228" y="104" text-anchor="end" font-size="11" font-weight="800" fill="var(--up)">디스카운트 · 매수 자리</text></svg>';
}
function structImpulseSVG(){
  return '<svg width="100%" height="140" viewBox="0 0 260 150" preserveAspectRatio="xMidYMid meet">'
    +'<line x1="60" y1="60" x2="250" y2="60" stroke="var(--sub)" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"/>'
    // 임펄스(긴 상승) + 되돌림(짧은 눌림), 얕게 유지되며 계단 상승
    +'<polyline points="14,124 60,58 92,84 140,34 168,58 214,18" fill="none" stroke="var(--up)" stroke-width="3.2" stroke-linejoin="round"/>'
    +'<text x="34" y="86" font-size="10" fill="var(--up)" font-weight="700">임펄스</text>'
    +'<text x="96" y="100" font-size="10" fill="var(--sub)">되돌림(얕음)</text>'
    +'<circle cx="92" cy="84" r="5" fill="var(--panel)" stroke="var(--up)" stroke-width="2"/><circle cx="168" cy="58" r="5" fill="var(--panel)" stroke="var(--up)" stroke-width="2"/>'
    +'<text x="248" y="14" text-anchor="end" font-size="10" fill="var(--up)" font-weight="800">건강한 상승추세</text></svg>';
}
function learnStruct(){
  return '<div class="lcard"><h3>🏗 봉우리와 골 — 모든 판단의 출발점</h3><p class="lead">차트 읽기는 두 점에서 시작합니다. <b>봉우리(스윙 고점)</b>와 <b>골(스윙 저점)</b>.</p>'
    +'<div class="wavebox">'+structSwingSVG()+'</div>'
    +'<div class="lrow"><div class="ic">🔺</div><div><p class="tt">봉우리 = 스윙 고점</p><p class="bd">그 봉의 <b>고가가 좌우 이웃 봉들의 고가보다 높은</b> 지점. 시장이 위에서 밀려 내려온 자리.</p></div></div>'
    +'<div class="lrow"><div class="ic">🔻</div><div><p class="tt">골 = 스윙 저점</p><p class="bd">그 봉의 <b>저가가 좌우보다 낮은</b> 지점. 매수세가 받쳐 되돌아온 자리.</p></div></div>'
    +'<p class="bd" style="color:var(--sub);font-size:12.5px;margin-top:6px">추세 판단·지지저항·손절 위치가 전부 이 두 점에서 출발합니다. (스윙 고점은 <b style="color:var(--ink)">오른쪽 봉이 닫혀야</b> 확정 — 확인엔 약간의 지연이 따릅니다)</p></div>'
    +'<div class="lcard"><h3>✅ \'넘었다\'의 기준 — 꼬리가 아니라 종가</h3><p class="lead">돌파를 꼬리로 판단하면 속고, 종가로 판단하면 속지 않습니다.</p>'
    +'<div class="wavebox">'+structCloseSVG()+'</div>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.8">• 위꼬리만 저항을 살짝 찌르고 <b style="color:var(--ink)">종가는 아래</b>로 마감 = <b class="down">거부(가짜 돌파)</b>. 시험만 한 것.<br>'
    +'• <b style="color:var(--ink)">종가가 저항 위</b>에서 마감 = <b class="up">점령(진짜 돌파)</b>. 자리를 차지한 것.<br>'
    +'크립토·단타일수록 꼬리 페이크가 잦아, <b style="color:var(--ink)">봉이 닫힌 종가</b>로 확인하는 습관이 손실을 크게 줄입니다.</p></div>'
    +'<div class="lcard"><h3>🎮 추세장 vs 박스장 — 먼저 "지금 어떤 게임인지" 묻기</h3><p class="lead">시장은 두 상태를 오갑니다. 상태에 맞지 않는 기법을 쓰면 양쪽에서 깎입니다.</p>'
    +'<div class="lgrid lg3">'
    +'<div class="ltile">'+structTrendSVG(true)+'<div class="nm" style="color:var(--up)">상승 추세</div><div class="ds">봉우리·골이 <b>계단식으로 높아짐</b></div></div>'
    +'<div class="ltile">'+structBoxSVG()+'<div class="nm" style="color:var(--gold)">박스(횡보)</div><div class="ds">비슷한 저항·지지 사이 <b>왕복</b></div></div>'
    +'<div class="ltile">'+structTrendSVG(false)+'<div class="nm" style="color:var(--down)">하락 추세</div><div class="ds">봉우리·골이 <b>계단식으로 낮아짐</b></div></div>'
    +'</div>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.7;margin-top:12px">시장은 생각보다 <b style="color:var(--ink)">오래 박스에 머뭅니다</b>. 추세용 기법(눌림목 매수 등)을 박스에서 휘두르면 위에서 사서 아래서 손절 — 양쪽에서 털립니다. <b style="color:var(--ink)">"추세냐 박스냐"</b>를 먼저 판단하고 기법을 골라야 합니다.</p></div>'
    +'<div class="lcard"><h3>🫁 추세의 호흡 — 임펄스와 되돌림</h3><p class="lead">추세는 <b>추세 방향으로 크게(임펄스)</b> 갔다가 <b>반대로 조금(되돌림)</b> 쉬며 나아갑니다.</p>'
    +'<div class="wavebox">'+structImpulseSVG()+'</div>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.8">되돌림의 <b style="color:var(--ink)">깊이</b>가 추세의 건강을 말해줍니다.<br>'
    +'• <b class="up">얕은 되돌림</b>(직전 고점 위에서 멈춤) = 매수세가 강함, 추세 <b>건강</b> → 눌림목 매수 유효.<br>'
    +'• <b class="down">깊은 되돌림</b>(직전 스윙 저점을 종가로 이탈) = 추세 <b>훼손</b> 신호 → 눌림 매수 근거 사라짐.<br>'
    +'즉 <b style="color:var(--ink)">"같은 버티기"라도</b> 얕게 눌리면 맞고, 깊게 무너지면 틀립니다. 되돌림 깊이가 홀딩/손절을 가릅니다.</p></div>'
    +'<div class="lcard"><h3>🔭 멀티 타임프레임 — 어느 화면이 진짜인가</h3><p class="lead">1분·5분·일봉 버튼은 캔들 하나가 담는 시간을 바꿉니다. 화면마다 그림이 달라 보여요.</p>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.8">같은 종목도 <b style="color:var(--ink)">15분봉은 상승, 5분봉은 하락</b>으로 보일 수 있습니다. 둘 다 진짜예요 — 보는 시간의 크기가 다를 뿐.<br>'
    +'• <b style="color:var(--ink)">큰 타임프레임</b>(일·주)으로 <b>방향(추세·구조)</b>을 정하고<br>'
    +'• <b style="color:var(--ink)">작은 타임프레임</b>(5·15분)으로 <b>진입 타이밍</b>을 잡습니다.<br>'
    +'큰 그림과 <b style="color:var(--ink)">반대로</b> 들어가면 손절나기 쉽습니다. "숲(큰 봉)에서 방향, 나무(작은 봉)에서 진입".</p>'
    +'<p class="bd" style="color:var(--sub);font-size:12.5px;margin-top:8px">🧩 <b style="color:var(--ink)">프랙탈</b>: 큰 봉 하나는 작은 봉 여러 개의 <b>요약</b>입니다(1시간봉 1개 = 15분봉 4개). 그래서 <b>같은 구조 문법</b>이 모든 봉에서 통합니다.</p>'
    +'<div style="margin-top:10px"><span class="rulechip" style="cursor:pointer" onclick="showView(\'stock\')">🔭 차트 봉 선택(1분·일·주)으로 큰흐름→진입 순서 보기 →</span></div></div>'
    +'<div class="lcard"><h3>💰 거래 범위 — 싼 절반에서 사고, 비싼 절반에서 판다</h3><p class="lead">스윙 고점~저점을 절반선으로 자르면, 지금 가격이 \'비싼 자리\'인지 \'싼 자리\'인지 보입니다.</p>'
    +'<div class="wavebox">'+structZoneSVG()+'</div>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.8">• 절반선 <b class="up">아래 = 디스카운트(싼 절반)</b> → 매수하기 유리한 자리<br>'
    +'• 절반선 <b class="down">위 = 프리미엄(비싼 절반)</b> → 매도(숏)하기 유리한 자리<br>'
    +'같은 목표가라도 <b style="color:var(--ink)">진입 자리에 따라 손익비가 뒤집힙니다</b>. 비싼 자리에서 매수하면 손절은 멀고 목표는 가까워요. 이건 반전 신호가 아니라 <b style="color:var(--ink)">\'자리 자격\' 필터</b>입니다.</p></div>'
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
    +'<div class="lrow"><div class="ic">〰️</div><div><p class="tt">MACD (모멘텀)</p><p class="bd">두 이평선 차이로 추세 힘·전환을 봄. 시그널선 상향 교차=상승 모멘텀.</p></div></div></div>'
    +'<div class="lcard"><h3>📦 매물대 · 거래량 프로파일</h3><p class="lead">가격축이 아니라 <b>거래량이 어느 가격대에 몰렸나</b>를 봅니다.</p>'
    +'<div class="wavebox">'+volProfileSVG()+'</div>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.8">과거 <b style="color:var(--ink)">거래량이 두껍게 쌓인 가격대 = 매물대</b>. 그 가격에 물린 사람·익절 대기자가 많아 힘이 셉니다.<br>'
    +'• 아래에서 올라와 만나면 → <b class="down">저항</b>(본전 오면 팔려는 매물)<br>'
    +'• 위에서 내려와 만나면 → <b class="up">지지</b>(싸지면 다시 사려는 대기)<br>'
    +'• <b style="color:var(--ink)">얇은 구간은 빠르게 통과</b>, 두꺼운 구간에서 싸움이 벌어집니다. 가장 두꺼운 지점을 POC(최대 거래가격)라 불러요.</p></div>';
}
/* 매물대(거래량 프로파일) 도해 — 가격대별 거래량 가로막대, 두꺼운 곳=매물대 */
function volProfileSVG(){
  var bars=[[30,18],[46,30],[62,52],[78,88],[94,72],[110,40],[126,24],[142,58],[158,34],[174,20]];
  var mx=88;
  return '<svg width="100%" height="150" viewBox="0 0 260 160" preserveAspectRatio="xMidYMid meet">'
    +bars.map(function(b){ var w=b[1]/mx*150, poc=b[1]>=mx; return '<rect x="30" y="'+b[0]+'" width="'+w+'" height="12" rx="2" fill="'+(poc?'var(--gold)':'var(--sub)')+'" opacity="'+(poc?1:0.5)+'"/>'; }).join('')
    +'<text x="188" y="98" font-size="10" font-weight="800" fill="var(--gold)">← POC (최대 매물대)</text>'
    +'<text x="30" y="12" font-size="9" fill="var(--sub)">↑ 가격 · 막대 길이 = 그 가격대 거래량</text></svg>';
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
    +['추세 방향은?','지지/저항 위치?','거래량 실렸나?','손절가 정했나?','손익비 2:1↑?','오늘 지표 발표 있나?'].map(function(c){return '<span class="rulechip" style="background:var(--panel2);color:var(--sub)">□ '+c+'</span>';}).join('')+'</div></div>'
    +'<div class="lcard"><h3>🎯 진입 — 어디서 방아쇠를 당기나</h3><p class="lead">아무 데서나 사지 않습니다. \'근거가 겹치는 자리\'에서 신호를 기다립니다.</p>'
    +'<div class="ltip"><div class="n">1</div><div><p class="h">큰 흐름과 같은 방향</p><p class="p">상위 타임프레임이 상승추세면 <b>매수만</b> 노립니다. 역방향 진입은 확률이 낮아요.</p></div></div>'
    +'<div class="ltip"><div class="n">2</div><div><p class="h">되돌림·지지 자리까지 기다림</p><p class="p">추격 대신 <b>디스카운트(싼 절반)·이평선·지지 구간</b>으로 눌릴 때. 자리가 좋아야 손절이 짧아집니다.</p></div></div>'
    +'<div class="ltip"><div class="n">3</div><div><p class="h">방아쇠는 확인 신호</p><p class="p">그 자리에서 <b>반전 캔들 + 거래량</b>, 또는 짧은 봉의 구조 전환(저점 높아짐)이 나올 때 진입. 근거 없이 미리 사지 않기.</p></div></div></div>'
    +'<div class="lcard"><h3>🛡 손절·수익 관리 — 산 다음이 진짜</h3><p class="lead">진입보다 어려운 건 그 뒤. 계획대로 지키는 게 실력입니다.</p>'
    +'<div class="ltip"><div class="n">1</div><div><p class="h">손절은 구조 아래 · 미리 걸어둠</p><p class="p">직전 스윙 저점 <b>살짝 아래</b>에 Stop-Market으로. 마음속 손절은 안 지켜집니다.</p></div></div>'
    +'<div class="ltip"><div class="n">2</div><div><p class="h">본절(브레이크이븐) 이동</p><p class="p">가격이 목표의 절반쯤 가면 손절을 <b>진입가로</b> 올려 \'잃지 않는 자리\'를 만듭니다.</p></div></div>'
    +'<div class="ltip"><div class="n">3</div><div><p class="h">추적 손절(트레일링)</p><p class="p">추세가 이어지면 손절을 <b>새로 생긴 스윙 저점 아래로</b> 따라 올려 수익을 지키며 끌고 갑니다.</p></div></div>'
    +'<div class="ltip"><div class="n">4</div><div><p class="h">분할 익절</p><p class="p">일부는 1차 목표에서 실현, 나머지는 추세에 태워 손익비를 극대화. 전부 한 곳에서 팔지 않기.</p></div></div></div>';
}
function learnMind(){
  var emo=[
    ['😱','FOMO · 추격매수','급등을 보고 "지금 안 사면 늦는다"며 꼭대기에 진입. 남이 사는 게 아니라 <b>내 근거</b>로 산다.'],
    ['🔥','뇌동 · 복수매매','잃고 흥분해 계획 없이 더 크게 베팅. <b>한 번의 감정 매매</b>가 수십 번의 수익을 지운다.'],
    ['💧','물타기','지는 포지션에 계속 추가 — 손절 근거를 무시하는 것. 평단만 낮아지고 손실은 커진다.'],
    ['🔁','오버트레이딩','안 해도 될 매매를 반복. 수수료·세금·펀딩이 계좌를 갉아먹는다.'],
    ['🪞','확증편향','내 포지션에 유리한 뉴스·차트만 본다. <b>반대 근거를 일부러</b> 찾아봐야 한다.']
  ];
  var mdd=[['−10%','+11%'],['−25%','+33%'],['−50%','+100%'],['−80%','+400%']];
  return '<div class="lcard"><h3>🧠 왜 \'아는데\' 못 지키나 — 손실회피</h3><p class="lead">매매의 승패는 대부분 분석이 아니라 <b>심리</b>에서 갈립니다. 트레이더의 74~89%가 잃고, 원인은 대체로 행동이에요.</p>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.8">사람은 <b style="color:var(--ink)">손실의 고통을 이익의 약 2배</b>로 느낍니다(손실회피). 그래서 무의식적으로:<br>'
    +'• <b class="down">지는 포지션은 오래</b> 붙든다 — "곧 오르겠지" 하며 더 떨어지길 기다림<br>'
    +'• <b class="up">이기는 포지션은 빨리</b> 던진다 — 작은 수익에 안도하며 도망<br>'
    +'이게 바로 <b style="color:var(--ink)">손익비를 거꾸로</b> 만드는 범인입니다(손실 크게·수익 작게). 규칙을 세우는 이유가 이 본능을 이기기 위해서예요.</p></div>'
    +'<div class="lcard"><h3>💥 계좌를 녹이는 감정 매매 5</h3><p class="lead">아래 5개만 피해도 생존율이 크게 오릅니다.</p>'
    +emo.map(function(x){return '<div class="lrow"><div class="ic">'+x[0]+'</div><div><p class="tt">'+x[1]+'</p><p class="bd">'+x[2]+'</p></div></div>';}).join('')+'</div>'
    +'<div class="lcard"><h3>💰 자금관리 — 실력보다 생존이 먼저</h3><p class="lead">고수와 하수를 가르는 건 기법이 아니라 <b>한 번에 얼마를 거느냐</b>입니다.</p>'
    +'<div class="ltip"><div class="n">1</div><div><p class="h">1~2% 룰</p><p class="p">한 매매의 <b>손실</b>이 계좌의 1~2%를 넘지 않게. <b>수량 = 허용손실 ÷ (진입가−손절가)</b>. 이러면 10연패해도 계좌 대부분이 남아요.</p></div></div>'
    +'<div class="ltip"><div class="n">2</div><div><p class="h">최대낙폭(MDD)의 함정</p><p class="p">크게 잃으면 복구가 기하급수로 어려워집니다:</p>'
    +'<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">'+mdd.map(function(m){return '<span class="rulechip" style="background:var(--panel2);color:var(--sub)"><b class="down">'+m[0]+'</b> → <b class="up">'+m[1]+'</b> 필요</span>';}).join('')+'</div>'
    +'<p class="p" style="margin-top:6px">−50% 나면 <b>+100%</b>를 벌어야 본전. 그래서 <b style="color:var(--ink)">크게 잃지 않는 것</b>이 복리의 핵심입니다.</p></div></div>'
    +'<div class="ltip"><div class="n">3</div><div><p class="h">분할 · 작게 시작</p><p class="p">한 번에 몰빵 대신 나눠 진입·청산. 배우는 단계엔 <b>아플 만큼 크지 않게</b> 베팅해 판단력을 지킵니다.</p></div></div></div>'
    +'<div class="lcard"><h3>🏆 꾸준히 버는 1~3%의 공통점</h3>'
    +'<p class="bd" style="color:var(--sub);font-size:13px;line-height:1.8">화려한 기법이 아니라 <b style="color:var(--ink)">지루한 습관</b>입니다 — 작게 시작 · <b>매매일지</b>로 복기 · 규칙 준수 · 손실 관리. 기법은 20%, 심리·자금관리가 80%예요.</p>'
    +'<div style="margin-top:8px"><span class="rulechip" style="cursor:pointer;background:var(--gold);color:#3a2c07" onclick="setMode&&setMode(\'coin\')">📓 VANTOR 매매일지로 복기 시작하기 →</span></div></div>';
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
    +'<div style="margin-top:12px"><a class="rulechip" style="cursor:pointer" onclick="showView(\'news\')">📰 VANTOR 뉴스 탭에서 실시간 헤드라인 보기 →</a></div></div>';
}
function renderLearn(){
  var el=$('#learnBody'); if(!el) return;
  var fn={basic:learnBasic,candle:learnCandle,pattern:learnPattern,struct:learnStruct,ind:learnInd,tips:learnTips,mind:learnMind,wave:learnWave,econ:learnEcon}[_learnTab]||learnBasic;
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
      btn.onclick=function(ev){ ev.stopPropagation(); var c=!card.classList.contains('collapsed'); applyCollapse(card,c); CARDPREF.collapsed[id]=c; if(!c)delete CARDPREF.collapsed[id]; saveCardPref(); applyCollapseCss(); };
    }
    applyCollapse(card,CARDPREF.collapsed[id]);
  });
  applyCollapseCss();
}
/* id별 CSS로 접힘 강제 — 재렌더 순간에도 즉시 접힌 채(깜빡임 없이) 유지 */
function applyCollapseCss(){
  var ids=Object.keys((CARDPREF&&CARDPREF.collapsed)||{});
  var css=ids.map(function(id){ var sel='.card[data-card="'+id+'"]'; return sel+'>*:not(.ch){display:none!important}'+sel+' .cardtog{transform:rotate(-90deg)}'; }).join('');
  var st=document.getElementById('collapseStyle'); if(!st){ st=document.createElement('style'); st.id='collapseStyle'; document.head.appendChild(st); }
  st.textContent=css;
}
/* 새로 렌더되는 카드에도 접힘 상태 자동 재적용(모든 탭·비동기 렌더 포함) */
(function(){ if(window._cardObs||!window.MutationObserver)return; var t=null;
  var obs=new MutationObserver(function(muts){ var need=false;
    for(var i=0;i<muts.length&&!need;i++){ var an=muts[i].addedNodes;
      for(var j=0;j<an.length;j++){ var nd=an[j]; if(nd.nodeType!==1)continue;
        if((nd.classList&&nd.classList.contains('card'))||(nd.querySelector&&nd.querySelector('.card'))){ need=true; break; } } }
    if(need){ clearTimeout(t); t=setTimeout(function(){ if(typeof initCards==='function')initCards(); },60); } });
  try{ obs.observe(document.body,{childList:true,subtree:true}); window._cardObs=obs; }catch(e){}
})();
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
/* 앱을 별도 팝업 창으로 — 모니터링용. 현재 보는 화면(뷰)을 그대로 열어줌 */
function openPopup(){
  var v=(document.querySelector('.view.on')||{}).id||''; v=v.replace('v-','');
  var url=location.href.split('#')[0]+(v?('#'+v):'');
  var w=Math.min((screen.availWidth||1400)-40,1180), h=Math.min((screen.availHeight||900)-40,860);
  var win=window.open(url,'bamtol_popup','width='+w+',height='+h+',menubar=no,toolbar=no,location=no,resizable=yes');
  if(!win){ if(typeof toast==='function')toast('팝업이 차단됐어요 — 브라우저 팝업 허용을 켜주세요'); }
  else { try{win.focus();}catch(e){} }
}
window.openPopup=openPopup;
/* 팝업(또는 링크)로 열릴 때 #뷰 해시가 있으면 그 화면으로 */
(function(){ var h=(location.hash||'').replace('#','');
  if(h && $('#v-'+h)) setTimeout(function(){ try{showView(h);}catch(e){} },300); })();

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
/* ═══════════ 오늘의 브리핑 (토글: 밤사이·장전 / 장마감) ═══════════ */
var briefMode='pre', BRIEF_US=null, BRIEF_BTC=null, BRIEF_ETH=null;
var TECHNM={NVDA:'엔비디아',TSLA:'테슬라',AAPL:'애플',MSFT:'MS',AMZN:'아마존',META:'메타',GOOGL:'구글',AMD:'AMD',AVGO:'브로드컴',NFLX:'넷플릭스'};
function setBriefMode(m){ briefMode=m; renderBriefing(); }
window.setBriefMode=setBriefMode;
async function loadBriefData(){
  var A='SPY,QQQ,DIA,SMH,IWM,VIXY,XLK,XLE,XLF,XLV,LIT,UUP,TLT,USO,GLD,SLV';
  var B='NVDA,TSLA,AAPL,MSFT,AMZN,META,GOOGL,AMD,AVGO,NFLX';
  try{ var res=await Promise.all([
      fetch(PROXY+'/quotes?mkt=US&codes='+A).then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(PROXY+'/quotes?mkt=US&codes='+B).then(function(r){return r.json();}).catch(function(){return null;})]);
    var m={}; res.forEach(function(q){ if(q&&q.quotes)q.quotes.forEach(function(x){ if(x&&x.c!=null)m[x.code]=x; }); });
    if(Object.keys(m).length)BRIEF_US=m; }catch(e){}
  try{ var bt=await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbols=%5B%22BTCUSDT%22,%22ETHUSDT%22%5D').then(function(r){return r.json();});
    if(Array.isArray(bt))bt.forEach(function(t){ if(t.symbol==='BTCUSDT')BRIEF_BTC={px:+t.lastPrice,c:+t.priceChangePercent}; if(t.symbol==='ETHUSDT')BRIEF_ETH={px:+t.lastPrice,c:+t.priceChangePercent}; }); }catch(e){}
  renderBriefing();
}
function _bp(label,val){ return '<div class="bpill"><span class="bl">'+label+'</span>'+val+'</div>'; }
function _pc(c){ c=+c||0; return '<span class="'+cls(c)+'">'+arw(c)+' '+pctTxt(c)+'</span>'; }
function _dec(s){ try{ var d=document.createElement('textarea'); d.innerHTML=s; s=d.value; d.innerHTML=s; return d.value; }catch(e){ return s; } }
function _bnews(k){ return (_lastNews||[]).slice(0,k).map(function(n){return '<a class="bnews" href="'+n.link+'" target="_blank" rel="noopener"><span class="tm">'+relTime(n.t)+'</span>'+esc(_dec(n.title))+'</a>';}).join(''); }
function _row(cap,inner){ return inner?('<div class="brow"><span class="bcap">'+cap+'</span>'+inner+'</div>'):''; }
var briefCollapsed={os:true,kr:true}; // 기본 접힘 — 헤더 한 줄 요약만 보이게(한눈에 깔끔)
try{ var _bc=JSON.parse(localStorage.getItem('aurBrief')||'null'); if(_bc)briefCollapsed=_bc; }catch(e){}
function toggleBriefSec(k){ briefCollapsed[k]=!briefCollapsed[k]; try{localStorage.setItem('aurBrief',JSON.stringify(briefCollapsed));}catch(e){} renderBriefing(); }
window.toggleBriefSec=toggleBriefSec;
function _sec(key,title,summary,inner){ var col=briefCollapsed[key]?' collapsed':'';
  return '<div class="bsec'+col+'"><div class="bsec-h" onclick="toggleBriefSec(\''+key+'\')"><span class="tw">▾</span> <b>'+title+'</b>'+(summary?'<span class="bsum">'+summary+'</span>':'')+'</div><div class="bsec-b">'+(inner||'')+'</div></div>'; }
function _preComment(U){
  var q=U['QQQ'], spy=U['SPY'], dia=U['DIA'], smh=U['SMH'], tlt=U['TLT'], uso=U['USO'], gld=U['GLD'];
  if(!q||q.c==null)return '미국 지수 데이터를 불러오는 중…';
  var mood=q.c>=0.3?'강세':(q.c<=-0.3?'약세':'혼조');
  var s='📌 밤사이 미국 증시는 <b>'+mood+'</b> 마감했습니다(S&P '+pctTxt(spy?spy.c:0)+', 나스닥 '+pctTxt(q.c)+', 다우 '+pctTxt(dia?dia.c:0)+').';
  var techs=Object.keys(TECHNM).map(function(k){return U[k]?{k:k,c:U[k].c}:null;}).filter(Boolean).sort(function(a,b){return b.c-a.c;});
  if(techs.length){ var tp=techs[0], bt=techs[techs.length-1];
    s+=' 특징주는 <b>'+TECHNM[tp.k]+'</b> '+pctTxt(tp.c)+(bt.c<-0.1?', '+TECHNM[bt.k]+' '+pctTxt(bt.c):'')+'.'; }
  var mb=[]; if(uso&&uso.c!=null)mb.push('유가 '+pctTxt(uso.c)); if(gld&&gld.c!=null)mb.push('금 '+pctTxt(gld.c)); if(tlt&&tlt.c!=null)mb.push('미국채 '+pctTxt(tlt.c));
  if(mb.length)s+=' '+mb.join(', ')+'.';
  var imp;
  if(smh&&smh.c>=1)imp='반도체 강세로 <b>삼성전자·SK하이닉스 등 반도체주</b>에 우호적. 외국인 수급 주목.';
  else if(q.c>=0.5)imp='기술·성장주 우호적 흐름, 코스닥 개별 모멘텀주 관심.';
  else if(q.c<=-0.5)imp='위험자산 약세, 방어주·현금 비중 확대 유효.';
  else imp='방향성 제한적, 개별 실적·수급 이슈 종목 중심 대응.';
  return s+'<br><b>→ 오늘 한국 증시:</b> '+imp;
}
function renderBriefing(){
  var el=$('#brief'); if(!el)return;
  if(typeof TECHNM==='undefined'||typeof briefCollapsed==='undefined')return; // 초기화 전 조기 호출 방지
  if(CARDPREF&&CARDPREF.hidden&&CARDPREF.hidden['브리핑']){ el.innerHTML=''; return; }
  var U=BRIEF_US||{}, osBody, krBody;
  { // ── 🌏 해외(밤사이) ──
    // 미국 지수
    var us=''; [['S&P500','SPY'],['나스닥','QQQ'],['다우','DIA'],['반도체','SMH'],['러셀2000','IWM']].forEach(function(p){ var q=U[p[1]]; if(q&&q.c!=null)us+=_bp(p[0],_pc(q.c)); });
    var vix=U['VIXY']; if(vix&&vix.c!=null)us+=_bp('VIX',(vix.c>=0?'<span class="down">▲불안</span>':'<span class="up">▼안정</span>'));
    // 특징주(등락순)
    var tech='', tl=Object.keys(TECHNM).map(function(k){return U[k]?{k:k,c:U[k].c}:null;}).filter(Boolean).sort(function(a,b){return b.c-a.c;});
    tl.forEach(function(x){ tech+=_bp(TECHNM[x.k],_pc(x.c)); });
    // 섹터
    var sec=''; [['반도체','SMH'],['기술','XLK'],['에너지','XLE'],['금융','XLF'],['헬스케어','XLV'],['2차전지','LIT']].forEach(function(p){ var q=U[p[1]]; if(q&&q.c!=null)sec+=_bp(p[0],_pc(q.c)); });
    // 금리·달러·원자재
    var mac=''; [['달러','UUP'],['미국채','TLT'],['WTI유가','USO'],['금','GLD'],['은','SLV']].forEach(function(p){ var q=U[p[1]]; if(q&&q.c!=null)mac+=_bp(p[0],_pc(q.c)); });
    var usd=(IDX||[]).find(function(x){return /USD/.test(x.nm);}); if(usd&&usd.c!=null)mac=_bp('환율','<b>'+(usd.v?(+usd.v).toLocaleString():'')+'</b> '+_pc(usd.c))+mac;
    // 코인
    var coin=''; if(BRIEF_BTC)coin+=_bp('비트코인','<b>$'+Math.round(BRIEF_BTC.px).toLocaleString()+'</b> '+_pc(BRIEF_BTC.c)); if(BRIEF_ETH)coin+=_bp('이더리움','<b>$'+Math.round(BRIEF_ETH.px).toLocaleString()+'</b> '+_pc(BRIEF_ETH.c));
    osBody=_row('📈 미국 지수',us||'<span style="color:var(--faint);font-size:12px">불러오는 중…</span>')
      +_row('💻 특징주',tech)
      +_row('🏭 섹터',sec)
      +_row('💵 금리·달러·원자재',mac)
      +_row('₿ 코인',coin)
      +'<div class="bcomment">'+_preComment(U)+'</div>'
      +(_bnews(6)?_row('📰 밤사이 뉴스','')+_bnews(6):'');
  }
  { // ── 🇰🇷 국내(마감) ──
    var ks=(IDX||[]).find(function(x){return x.nm==='KOSPI';})||{}, kq=(IDX||[]).find(function(x){return x.nm==='KOSDAQ';})||{};
    var b=FLOW.breadth||{};
    var idxrow=_bp('코스피','<b>'+(ks.v?(+ks.v).toLocaleString():'')+'</b> '+_pc(ks.c||0))+_bp('코스닥','<b>'+(kq.v?(+kq.v).toLocaleString():'')+'</b> '+_pc(kq.c||0))
      +_bp('등락','<span class="up">▲'+(b.up||0)+'</span>/<span class="down">▼'+(b.down||0)+'</span>')
      +(b.upH!=null?_bp('상한/하한','<span class="up">'+(b.upH||0)+'</span>/<span class="down">'+(b.downH||0)+'</span>'):'')
      +(b.h52u!=null?_bp('52주 신고/신저','<span class="up">'+(b.h52u||0)+'</span>/<span class="down">'+(b.h52d||0)+'</span>'):'');
    // 수급 (KOSPI·KOSDAQ 외국인·기관)
    function invPill(mkt){ var r=(FLOW.inv||[]).find(function(x){return x[0]===mkt;}); if(!r)return '';
      return _bp(mkt+' 외인','<b class="'+cls(r[2])+'">'+(r[2]>=0?'+':'')+(+r[2]).toLocaleString()+'억</b>')+_bp(mkt+' 기관','<b class="'+cls(r[3])+'">'+(r[3]>=0?'+':'')+(+r[3]).toLocaleString()+'억</b>'); }
    var supply=invPill('KOSPI')+invPill('KOSDAQ');
    // 업종 강/약
    var cats=(getCats()||[]).slice().sort(function(a,b){return b.sc-a.sc;});
    var strongSec='',weakSec=''; cats.slice(0,3).forEach(function(c){strongSec+=_bp(c.ic||'🔥',' '+c.nm+' '+_pc(c.chg));}); cats.slice(-2).forEach(function(c){weakSec+=_bp(c.ic||'💧',' '+c.nm+' '+_pc(c.chg));});
    // 급등락
    var up='',dn=''; if(KBOARD&&KBOARD.length){ var g=KBOARD.filter(function(x){return hasNum(x.ch);}).sort(function(a,b){return b.ch-a.ch;});
      g.slice(0,5).forEach(function(x){ if(x.ch>0)up+=_bp('▲',' <b>'+x.n+'</b> '+_pc(x.ch)); });
      g.slice(-3).reverse().forEach(function(x){ if(x.ch<0)dn+=_bp('▼',' <b>'+x.n+'</b> '+_pc(x.ch)); }); }
    // 외국인·기관 순매수 TOP
    var frBuy=(SMART&&SMART.foreign||[]).slice(0,3).map(function(a){return _bp('외인',' <b>'+a[0]+'</b> +'+a[1].toLocaleString()+'억');}).join('');
    var inBuy=(SMART&&SMART.inst||[]).slice(0,3).map(function(a){return _bp('기관',' <b>'+a[0]+'</b> +'+a[1].toLocaleString()+'억');}).join('');
    // 코멘트
    var kc=ks.c||0, kInv=(FLOW.inv||[]).find(function(x){return x[0]==='KOSPI';}), frg=kInv?kInv[2]:null, strong=cats[0];
    var cmt2='📌 코스피 <b>'+pctTxt(kc)+'</b> '+(kc>=0.3?'상승':(kc<=-0.3?'하락':'보합'))+' 마감';
    if(frg!=null)cmt2+=', 외국인 '+(frg>=0?'순매수':'순매도')+'('+(frg>=0?'+':'')+(+frg).toLocaleString()+'억)'+(frg>=0?' 주도':'');
    cmt2+='. 상승 '+(b.up||0)+'·하락 '+(b.down||0)+'.';
    if(strong)cmt2+=' <b>'+strong.nm+'</b> 업종이 '+pctTxt(strong.chg)+'로 강세.';
    krBody=_row('📊 지수',idxrow)
      +_row('🏦 수급',supply||'<span style="color:var(--faint);font-size:12px">집계 중</span>')
      +_row('🔥 강세 업종',strongSec)
      +_row('💧 약세 업종',weakSec)
      +_row('⚡ 급등',up||'<span style="color:var(--faint);font-size:12px">—</span>')
      +_row('⚡ 급락',dn||'<span style="color:var(--faint);font-size:12px">—</span>')
      +_row('💰 외인 순매수',frBuy)
      +_row('💰 기관 순매수',inBuy)
      +'<div class="bcomment">'+cmt2+'</div>'
      +(_bnews(6)?_row('📰 오늘 뉴스','')+_bnews(6):'');
  }
  // 헤더 한 줄 요약(접혀 있어도 핵심은 한눈에)
  function sm(c){ c=+c||0; return '<span class="'+cls(c)+'">'+(c>=0?'+':'')+c.toFixed(2)+'%</span>'; }
  var _U=BRIEF_US||{}, osSum=[];
  if(_U.QQQ&&_U.QQQ.c!=null)osSum.push('나스닥 '+sm(_U.QQQ.c));
  if(_U.SPY&&_U.SPY.c!=null)osSum.push('S&P '+sm(_U.SPY.c));
  if(typeof BRIEF_BTC!=='undefined'&&BRIEF_BTC)osSum.push('BTC '+sm(BRIEF_BTC.c));
  var _ks=(IDX||[]).find(function(x){return x.nm==='KOSPI';})||{}, _kq=(IDX||[]).find(function(x){return x.nm==='KOSDAQ';})||{};
  var krSum=['코스피 '+sm(_ks.c),'코스닥 '+sm(_kq.c)];
  el.innerHTML='<div class="card" data-card="브리핑" style="margin-bottom:14px"><div class="ch"><h2>📋 오늘의 브리핑</h2><div class="r"><span style="color:var(--faint);font-size:11px">▾ 눌러 상세</span></div></div><div class="pad" style="padding-top:2px">'
    +_sec('os','🌏 해외·밤사이',osSum.join(' · '),osBody)+_sec('kr','🇰🇷 국내·마감',krSum.join(' · '),krBody)+'</div></div>';
}

initCards(); renderSummary(); renderBriefing();
if(PROXY){ loadKisRadar(); loadKisMarket(); loadBriefData(); loadUsIdx(); setInterval(loadKisRadar,60000); setInterval(loadKisMarket,60000); setInterval(loadBriefData,90000); setInterval(loadUsIdx,60000); } // 실데이터: RADAR·MARKET 1분, 브리핑 US 90초, 나스닥·S&P 1분
setInterval(fetchNews,300000);
/* ===== 첫 진입 스플래시 — 풀블리드 좌우 분할 + 캔들 배경 ===== */
var _spRAF=null, _spRun=false;
function _spCanvasStart(){ var cv=document.getElementById('spCanvas'); if(!cv)return; if(_spRun)return; var ctx=cv.getContext('2d'), DPR=Math.min(2,window.devicePixelRatio||1), W=0,H=0;
  function size(){ W=cv.clientWidth; H=cv.clientHeight; cv.width=Math.max(1,W*DPR); cv.height=Math.max(1,H*DPR); ctx.setTransform(DPR,0,0,DPR,0,0); }
  size(); if(!cv._spResize){ cv._spResize=1; window.addEventListener('resize',function(){ if(_spRun)size(); }); }
  var reduce=false; try{reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
  var mk=function(){ var x=Math.random()*W; return {x:x,y:Math.random()*H,w:3+Math.random()*3.5,bh:10+Math.random()*40,wick:18+Math.random()*46,sp:0.12+Math.random()*0.45,up:Math.random()>0.5,left:x<W/2}; };
  var N=Math.max(24,Math.floor((W||900)/44)), C=[]; for(var i=0;i<N;i++)C.push(mk());
  function frame(){ if(!_spRun)return; ctx.clearRect(0,0,W,H);
    for(var i=0;i<C.length;i++){ var c=C[i]; c.y-=c.sp; if(c.y<-c.wick){ C[i]=mk(); C[i].y=H+30; c=C[i]; }
      var base=c.left?(c.up?'229,56,77':'150,40,58'):(c.up?'46,189,133':'224,181,82');
      ctx.strokeStyle='rgba('+base+',0.11)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(c.x,c.y-c.wick/2); ctx.lineTo(c.x,c.y+c.wick/2); ctx.stroke();
      ctx.fillStyle='rgba('+base+',0.15)'; ctx.fillRect(c.x-c.w/2,c.y-c.bh/2,c.w,c.bh); }
    if(!reduce)_spRAF=requestAnimationFrame(frame); else _spRun=false; }
  _spRun=true; frame(); }
function _spCanvasStop(){ _spRun=false; if(_spRAF)cancelAnimationFrame(_spRAF); _spRAF=null; }
window.enterMode=function(m){ try{ var r=document.getElementById('spRemember'); if(r&&r.checked)localStorage.setItem('aurEntry',m); else localStorage.removeItem('aurEntry'); }catch(e){}
  var card=document.querySelector('#splash .sp-'+m); if(card)card.classList.add('sp-picked'); // 선택 반쪽 팝
  if(typeof setMode==='function')setMode(m);
  var sp=document.getElementById('splash'); if(sp){ setTimeout(function(){ sp.classList.add('hide'); },220); setTimeout(function(){ sp.style.display='none'; if(card)card.classList.remove('sp-picked'); _spCanvasStop(); },800); } };
window.showSplash=function(){ var sp=document.getElementById('splash'); if(sp){ sp.style.display=''; void sp.offsetWidth; sp.classList.remove('hide'); _spCanvasStart(); } };
(function(){ var sp=document.getElementById('splash'); if(!sp)return; var pre=null; try{pre=localStorage.getItem('aurEntry');}catch(e){}
  if(pre==='stock'||pre==='coin'){ if(typeof setMode==='function')setMode(pre); sp.classList.add('hide'); sp.style.display='none'; }
  else { _spCanvasStart(); }
  var lg=document.querySelector('.nav .logo'); if(lg){ lg.style.cursor='pointer'; lg.title='시작 화면 다시 열기 (주식/코인 선택)'; lg.addEventListener('click',function(){ window.showSplash(); }); }
})();
/* ===== 글자 크기 설정 (소·중·대 = S/M/L · body zoom) ===== */
window.setFont=function(f){ var z={s:0.9,m:1,l:1.12}[f]; if(z==null){f='m';z=1;} try{document.body.style.zoom=z;}catch(e){} try{localStorage.setItem('aurFont',f);}catch(e){}
  document.querySelectorAll('.fontseg button').forEach(function(b){ b.classList.toggle('on',b.dataset.f===f); }); };
(function(){ var f='m'; try{f=localStorage.getItem('aurFont')||'m';}catch(e){} if(['s','m','l'].indexOf(f)<0)f='m'; if(typeof window.setFont==='function')window.setFont(f); })();
/* ===== 차트 확대(전체화면) — 주식·코인 공용 ===== */
window.openChartFs=function(){ if(typeof CHART==='undefined'||!CHART||!CHART.r)return; var r=CHART.r, src=CHART.cv;
  var fs=document.getElementById('chartFs');
  if(!fs){ fs=document.createElement('div'); fs.id='chartFs';
    fs.innerHTML='<div class="cfs-bar"><span class="cfs-title" id="cfsTitle"></span><button class="cfs-x" onclick="closeChartFs()">✕ 닫기</button></div>'
      +'<div class="cfs-body"><canvas id="cfsCanvas" class="schart chartbig"></canvas></div>'
      +'<div class="cfs-hint">휠 확대·축소 · 드래그 좌우 이동 · 오른쪽 가격축 세로·아래 시간축 가로 드래그 · 더블클릭 리셋</div>';
    document.body.appendChild(fs);
    fs.addEventListener('click',function(e){ if(e.target===fs)closeChartFs(); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ var f=document.getElementById('chartFs'); if(f&&f.style.display==='flex')closeChartFs(); } });
  }
  fs._srcCv=src; fs.style.display='flex';
  var tt=document.getElementById('cfsTitle'); if(tt)tt.textContent=(r.n||r.c||'차트')+(r.mk==='COIN'?' · Binance '+((window._coinTF||'1h')):'');
  var cv=document.getElementById('cfsCanvas');
  void fs.offsetHeight; // 레이아웃 강제 계산
  var _drawFs=function(){ if(fs.style.display!=='flex')return; if(typeof drawStockChart==='function')drawStockChart(cv,r); };
  _drawFs(); if(typeof _attachChartZoom==='function')_attachChartZoom(cv); if(typeof attachChartCrosshair==='function')attachChartCrosshair(cv);
  setTimeout(_drawFs,70); setTimeout(_drawFs,250); }; // 레이아웃 안정 후 재그림
window.closeChartFs=function(){ var fs=document.getElementById('chartFs'); if(!fs)return; fs.style.display='none';
  var src=fs._srcCv; if(src&&typeof drawStockChart==='function'&&typeof CHART!=='undefined'&&CHART&&CHART.r){ drawStockChart(src,CHART.r); } };
/* 부팅: 첫 방문 가이드(1회) + #selftest 자가진단 */
(function(){ try{
  if(location.hash==='#selftest'&&typeof _selftest==='function'){ setTimeout(function(){ var r=_selftest(); var b=document.createElement('div'); b.style.cssText='position:fixed;left:10px;bottom:10px;z-index:3000;background:'+(r.fail?'#3a1720':'#12261b')+';border:1px solid '+(r.fail?'#f6465d':'#2ebd85')+';color:#e8ecf3;font:12px/1.5 monospace;padding:10px 12px;border-radius:8px;max-width:280px;white-space:pre-wrap'; b.textContent='🧪 자가진단 '+r.ok+' 통과 · '+r.fail+' 실패\n'+r.details.join('\n'); b.onclick=function(){b.remove();}; document.body.appendChild(b); },1500); }
  var seen=false; try{seen=localStorage.getItem('aurSeenHelp')==='1';}catch(e){}
  if(!seen&&typeof openHelp==='function'){ setTimeout(function(){ if(document.querySelector('#splash')&&getComputedStyle(document.querySelector('#splash')).display!=='none')return; openHelp(); },900); }
}catch(e){} })();
