// Forward-only shadow portfolios. No broker, AI requests or production strategy selection.
import {newAccount, queueCandidate} from './paper-engine.mjs';
import {advancePortfolio} from './paper-runtime.mjs';
export const STRATEGIES = Object.freeze([
  {id:'baseline',name:'기존 전략',rule:'공통 조건을 통과한 후보를 기존 순서로 검토'},
  {id:'trend',name:'상승추세',rule:'공통 후보 중 최근 20거래일 수익률이 0% 초과'},
  {id:'lowvol',name:'저변동',rule:'공통 후보 중 변동성이 낮은 절반 (홀수는 올림, 동률은 종목코드 순)'},
]);
export function candidateFor(row,market,scores,date){
  return {...row,date,rc:market==='US'?scores.items?.[row.c]?.[14]:row.c,
    qualified:row.view==='추천'&&Number.isFinite(row.per)&&row.per>0&&
      row.tv20>=(market==='US'?.1:50)&&(market==='US'||!(row.ref||[]).includes('하락 추세'))};
}
export function trainerUniverse(candidates){
  const valid=candidates.filter(c=>c.qualified&&c.rc&&Number.isFinite(c.vol)&&c.vol>=0)
    .sort((a,b)=>a.vol-b.vol||a.c.localeCompare(b.c));
  return {size:valid.length,lowVolSymbols:valid.slice(0,Math.ceil(valid.length/2)).map(c=>c.c)};
}
export function newTrainer(market,date,now=Date.now()){
  if(!/^\d{8}$/.test(date))throw Error('trainer_invalid');
  return {version:1,mode:'forward-paper',selection:'manual',market,startedAt:new Date(now).toISOString(),
    startedDate:date,updatedAt:new Date(now).toISOString(),valuationDate:date,status:'collecting',
    accounts:STRATEGIES.map(s=>{
      const account=newAccount(market);account.lastDate=date;
      account.history=[{date,equity:account.equity,cash:account.cash,drawdown:0}];
      return {...s,account,reviews:[]};
    })};
}
export function validateTrainer(t,market){
  if(t?.version!==1||t.mode!=='forward-paper'||t.selection!=='manual'||t.market!==market||
    !/^\d{8}$/.test(t.startedDate)||!Number.isFinite(Date.parse(t.startedAt))||
    !Array.isArray(t.accounts)||t.accounts.length!==STRATEGIES.length)throw Error('trainer_invalid');
  for(const s of STRATEGIES){
    const row=t.accounts.find(x=>x.id===s.id),a=row?.account,base=newAccount(market);
    if(!a||a.mode!=='paper'||a.market!==market||a.currency!==base.currency||a.initialCapital!==base.initialCapital||
      a.costRate!==base.costRate||!Number.isFinite(a.cash)||a.cash<0||!Number.isFinite(a.equity)||a.equity<=0||
      !Number.isFinite(a.peakEquity)||a.peakEquity<a.equity||!/^\d{8}$/.test(a.lastDate)||
      !['positions','pending','trades','history'].every(k=>Array.isArray(a[k]))||!Array.isArray(row.reviews))throw Error('trainer_invalid');
  }
}
export async function advanceTrainer(original,market,load,now=Date.now()){
  validateTrainer(original,market);
  const next=structuredClone(original);
  for(const row of next.accounts){
    const result=await advancePortfolio(row.account,market,load,now,{recordEmpty:true});
    row.account=result.account;next.valuationDate=result.latestDate;
  }
  if(next.accounts.some(x=>x.account.lastDate!==next.valuationDate))throw Error('price_data_missing');
  next.updatedAt=new Date(now).toISOString();next.status='ready';
  return next;
}
export function recordTrainerReview(t,candidate,universe,report,result,now=Date.now()){
  validateTrainer(t,t.market);
  // Only new observations gathered after experiment start; never reconstruct old AI evidence.
  if(candidate.date<t.startedDate||report.sourceDate!==candidate.date||report.symbol!==candidate.c||
    (result?.review&&Date.parse(result.review.createdAt)<Date.parse(t.startedAt)))return;
  const key=JSON.stringify([report.sourceDate,report.symbol,report.checkedDate,report.status,result?.review?.id||null]);
  const next=structuredClone(t);
  for(const row of next.accounts){
    if(row.reviews.some(r=>r.trainerKey===key))continue;
    const r=structuredClone(report);delete r.entryStatus;delete r.entryReason;delete r.sizeReason;delete r.earnDate;
    r.trainerKey=key;r.signal={ret20:Number.isFinite(candidate.ret20)?candidate.ret20:null,
      vol:Number.isFinite(candidate.vol)?candidate.vol:null,lowVolEligible:universe.lowVolSymbols.includes(candidate.c),
      universeSize:universe.size,lowVolCount:universe.lowVolSymbols.length};
    if(!candidate.qualified||!candidate.rc){r.entryStatus='wait';r.entryReason='quant_conditions_not_met';}
    else if(row.id==='trend'&&!(Number.isFinite(candidate.ret20)&&candidate.ret20>0)){
      r.entryStatus='wait';r.entryReason=Number.isFinite(candidate.ret20)?'trend_not_positive':'trend_data_missing';
    }else if(row.id==='lowvol'&&!r.signal.lowVolEligible){r.entryStatus='wait';r.entryReason=Number.isFinite(candidate.vol)?'outside_low_vol_half':'vol_data_missing';}
    else if(result?.review){
      const plan=queueCandidate(row.account,candidate,result.review,result.evidence,result.snapshotId,now);
      r.entryStatus=plan.status;r.entryReason=plan.reason||null;
      if(plan.sizeReason){r.sizeReason=plan.sizeReason;r.earnDate=plan.earnDate;}
    }
    row.reviews.push(r);
  }
  t.accounts=next.accounts;t.updatedAt=new Date(now).toISOString();
}
