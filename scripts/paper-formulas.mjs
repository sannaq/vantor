// Isolated, forward-only US formula experiment. Never bypasses the AI account's gate.
import {createHash} from 'node:crypto';
import {newAccount, mark, validBar} from './paper-engine.mjs';
import {advancePortfolio, completedBars} from './paper-runtime.mjs';
import {PAPER_POLICY} from './paper-policy.mjs';
import V from '../score-core.js';

export const FORMULAS = Object.freeze([
  {id:'current',name:'현행 공식',rule:'모멘텀 67 · 흑자 33',w:[67,33,0,0]},
  {id:'balanced',name:'균형 공식',rule:'모멘텀·흑자·안정성·고점 근접 각 25',w:[25,25,25,25]},
  {id:'middle',name:'중간 공식',rule:'모멘텀 50 · 흑자 25 · 안정성 25',w:[50,25,25,0]},
]);
const ID='us-formulas-v1';
const dayOK=d=>/^\d{8}$/.test(d);
const num=n=>typeof n==='number'&&Number.isFinite(n);
export function rankFormulas(scores){
  if(scores?.v!==2||scores.market!=='US'||!dayOK(scores.date)||!scores.items)throw Error('formula_feed_invalid');
  const pool=Object.entries(scores.items).filter(([,s])=>Array.isArray(s)&&num(s[6])&&s[6]>=.1&&num(s[9])&&s[9]>=0&&num(s[10])&&num(s[17])&&s[17]>0&&typeof s[14]==='string'&&s[14]&&(s[15]===null||num(s[15])))
    .map(([c,s])=>({c,n:s[12]||c,rc:s[14],currentScore:s[0],mom:s[15],prof:num(s[11])&&s[11]>0?1:0,stab:-s[9],high:s[10],px:s[17]}));
  if(pool.length<10)throw Error('formula_universe_small');
  // Midrank ties; missing momentum is neutral, as in the current score engine.
  const ranks=key=>{
    const sorted=pool.filter(x=>num(x[key])).sort((a,b)=>a[key]-b[key]||a.c.localeCompare(b.c));
    const out=new Map();
    for(let i=0;i<sorted.length;){let j=i+1;while(j<sorted.length&&sorted[j][key]===sorted[i][key])j++;
      const r=sorted.length>1?(i+j-1)/2/(sorted.length-1):.5;
      for(let k=i;k<j;k++)out.set(sorted[k].c,r);i=j;}
    return out;
  };
  const mom=ranks('mom'),stab=ranks('stab'),high=ranks('high');
  return {size:pool.length,lists:Object.fromEntries(FORMULAS.map(f=>[f.id,pool.map(x=>{
    const parts=[mom.get(x.c)??.5,x.prof,stab.get(x.c),high.get(x.c)].map((v,i)=>v*f.w[i]);
    // Control uses the actual published current-formula score, including its rounding.
    const score=f.id==='current'?x.currentScore:parts.reduce((a,b)=>a+b,0);
    if(!num(score))throw Error('formula_feed_invalid');
    return {...x,score,parts};
  }).sort((a,b)=>b.score-a.score||a.c.localeCompare(b.c)).slice(0,10).map((x,i)=>({...x,rank:i+1}))]))};
}
export function newFormulaExperiment(date,now=Date.now()){
  if(!dayOK(date))throw Error('formula_feed_invalid');
  const at=new Date(now).toISOString();
  return {version:1,id:ID,mode:'formula-paper',market:'US',selection:'manual',aiReviewRequired:false,
    startedAt:at,startedDate:date,updatedAt:at,valuationDate:date,status:'ready',lastSignalDate:null,
    policy:{initialCapital:100000,costRate:.0015,maxPositionFraction:.15,maxPlannedLossFraction:.01,pauseDrawdownFraction:.15,maxHoldingTradingDays:60,minAverageDailyTurnoverUSD:10000000,topN:10,entry:'ma60',stop:'below_second_entry_2atr',signalValidityDays:7},
    accounts:FORMULAS.map(f=>{const a=newAccount('US');a.experiment=ID;a.lastDate=date;a.history=[{date,equity:a.equity,cash:a.cash,drawdown:0}];return {...f,account:a,reviews:[]};})};
}
export function validateFormulaExperiment(t){
  if(t?.version!==1||t.id!==ID||t.mode!=='formula-paper'||t.market!=='US'||t.aiReviewRequired!==false||t.selection!=='manual'||!dayOK(t.startedDate)||!num(Date.parse(t.startedAt))||t.accounts?.length!==3)throw Error('formula_state_invalid');
  const ids=new Set();
  for(const f of FORMULAS){const r=t.accounts.find(x=>x.id===f.id),a=r?.account;
    if(!a||ids.has(r.id)||a.experiment!==ID||a.mode!=='paper'||a.market!=='US'||a.currency!=='USD'||a.initialCapital!==100000||a.costRate!==.0015||!dayOK(a.lastDate)||!num(a.cash)||a.cash<0||!num(a.equity)||a.equity<=0||!num(a.peakEquity)||a.peakEquity<a.equity||!['positions','pending','trades','history'].every(k=>Array.isArray(a[k]))||!Array.isArray(r.reviews))throw Error('formula_state_invalid');ids.add(r.id);}
}
export function queueFormula(a,c,lv,date,now,snapshotId){
  if(a.experiment!==ID)throw Error('formula_account_required');
  if(a.paused)return {status:'wait',reason:'drawdown_pause'};
  if(a.positions.some(p=>p.symbol===c.c))return {status:'wait',reason:'position_already_allocated'};
  if(a.pending.some(p=>p.symbol===c.c))return {status:'wait',reason:'already_pending'};
  if(!lv||!num(lv.b1)||!num(lv.st)||lv.st<=0||lv.b1<=lv.st)return {status:'wait',reason:'quote_or_costs_invalid'};
  const fee=a.costRate,available=Math.max(0,a.cash-a.pending.reduce((s,p)=>s+p.reserved,0));
  const quantity=Math.floor(Math.min(available/(lv.b1*(1+fee)),a.equity*.15/(lv.b1*(1+fee)),a.equity*.01/(lv.b1-lv.st+(lv.b1+lv.st)*fee)));
  if(!Number.isSafeInteger(quantity)||quantity<1)return {status:'wait',reason:'budget_below_one_share'};
  const p={symbol:c.c,name:c.n,rc:c.rc,quantity,entry:lv.b1,stop:lv.st,target:null,target1:null,
    reserved:quantity*lv.b1*(1+fee),signalDate:date,signalKind:'formula',snapshotId,
    reviewCreatedAt:new Date(now).toISOString(),reviewExpiresAt:new Date(now+7*864e5).toISOString()};
  a.pending.push(p);return {status:'ready',quantity,entry:lv.b1,stop:lv.st};
}
export async function runFormulaExperiment(original,scores,load,now=Date.now()){
  // Shared engine limits are pinned for this experiment. Refuse silent rule changes.
  if(PAPER_POLICY.pauseDrawdownFraction!==.15||PAPER_POLICY.maxHoldingTradingDays!==60||PAPER_POLICY.maxPositionFraction!==.15||PAPER_POLICY.maxPlannedLossFraction!==.01)throw Error('formula_policy_changed');
  const reference=completedBars(await load('US','AAPL.O'),'US',now),date=reference.at(-1)?.[0];
  if(!dayOK(date)||!validBar(reference.at(-1)))throw Error('price_data_missing');
  if(now-Date.parse(date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8)+'T00:00:00Z')>7*864e5)throw Error('formula_prices_stale');
  if(!original&&scores?.date!==date)throw Error('formula_feed_stale');
  const t=original?structuredClone(original):newFormulaExperiment(date,now);
  validateFormulaExperiment(t);
  for(const row of t.accounts){const r=await advancePortfolio(row.account,'US',load,now,{recordEmpty:true});row.account=r.account;}
  if(t.accounts.some(r=>r.account.lastDate!==date))throw Error('price_data_missing');
  t.updatedAt=new Date(now).toISOString();t.valuationDate=date;
  if(scores?.date!==date){t.status='formula_feed_stale';return t;}
  if(t.lastSignalDate&&date<=t.lastSignalDate){t.status='ready';return t;}
  const ranked=rankFormulas(scores),hash=createHash('sha256').update(JSON.stringify(scores)).digest('hex');
  const levels=new Map();
  for(const c of new Map(Object.values(ranked.lists).flat().map(c=>[c.c,c])).values()){
    try{const bars=completedBars(await load('US',c.rc),'US',now).filter(b=>b[0]<=date);
      levels.set(c.c,bars.length>=60&&bars.every(validBar)&&bars.at(-1)?.[0]===date?V.levels(bars,{usd:true,b1:'ma60',stopAtr:2}):null);
    }catch{levels.set(c.c,null);}
  }
  for(const row of t.accounts){
    mark(row.account);
    for(const c of ranked.lists[row.id]){const plan=queueFormula(row.account,c,levels.get(c.c),date,now,hash);
      row.reviews.push({date,symbol:c.c,name:c.n,rank:c.rank,score:+c.score.toFixed(2),parts:c.parts.map(x=>+x.toFixed(2)),status:plan.status,reason:plan.reason||'formula_top10',quantity:plan.quantity||0,entry:plan.entry||null,stop:plan.stop||null,snapshotId:hash,observedAt:t.updatedAt});}
  }
  t.lastSignalDate=date;t.universeSize=ranked.size;t.lastSnapshotId=hash;t.status='ready';
  validateFormulaExperiment(t);return t;
}
