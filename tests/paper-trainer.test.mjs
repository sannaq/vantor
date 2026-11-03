import test from 'node:test';
import assert from 'node:assert/strict';
import {newTrainer,advanceTrainer,recordTrainerReview,trainerUniverse,candidateFor,validateTrainer} from '../scripts/paper-trainer.mjs';
const now=Date.parse('2026-10-30T23:00:00Z'),start=now-3600000;
const candidate=(c,ret20,vol)=>({c,n:c,date:'20261030',qualified:true,rc:c,ret20,vol,lv:{b1:100,st:90,tg:120,tg1:110}});
const cs=[candidate('A',10,.01),candidate('B',-5,.02),candidate('C',2,.03),candidate('D',0,.04)];
function result(c,decision='pass'){
 const review={id:c.c,market:'KR',symbol:c.c,snapshotId:c.c,decision,reason:'시험 자료 검토',sourceIds:['s'],createdAt:new Date(now).toISOString(),expiresAt:'2026-11-04T23:00:00Z'};
 const evidence=[{id:'s',market:'KR',symbol:c.c,snapshotId:c.c,verified:true,type:'filing',text:'본문',url:'https://example.com/filing',publishedAt:'2026-10-30T19:00:00Z',fetchedAt:'2026-10-30T21:00:00Z'}];
 return {review,evidence,snapshotId:c.c};
}
function record(t,c,rs=result(c)){
 const report={symbol:c.c,name:c.n,sourceDate:c.date,checkedDate:'2026-10-30',status:rs.review.decision==='hold'?'risk_hold':'review_pass',review:rs.review,sources:rs.evidence.map(({text,...m})=>m),entryStatus:'wait',entryReason:'already_pending'};
 recordTrainerReview(t,c,trainerUniverse(cs),report,rs,now);
}
const bar=d=>[d,100,105,95,103,1000];
test('three isolated strategies use same capital and gates, permitting multiple daily orders',()=>{
 const t=newTrainer('KR','20261030',start);cs.forEach(c=>record(t,c));
 assert.deepEqual(t.accounts.map(s=>s.account.pending.map(p=>p.symbol)),[['A','B','C','D'],['A','C'],['A','B']]);
 for(const s of t.accounts){assert.equal(s.account.cash,100000000);for(const p of s.account.pending){assert(p.reserved<=15000000);assert(p.quantity*(10+190*.0025)<=1000000);}}
 assert.equal(t.accounts[1].reviews[1].entryReason,'trend_not_positive');assert.equal(t.accounts[2].reviews[2].entryReason,'outside_low_vol_half');
 assert.equal(t.accounts[0].reviews[0].entryStatus,'ready','real account duplicate must not block isolated account');
 record(t,cs[0]);assert.equal(t.accounts[0].reviews.length,4);assert.equal(t.accounts[0].account.pending.length,4);
 t.accounts[0].account.cash=1;assert.equal(t.accounts[1].account.cash,100000000);
 assert(!JSON.stringify(t).includes('"text":"본문"'),'article bodies are not published');
});
test('filters handle missing, zero, tied values with deterministic low-vol membership',()=>{
 const rows=[candidate('C',0,.01),candidate('B',-1,.01),candidate('A',1,.01),candidate('D',null,null)];
 assert.deepEqual(trainerUniverse(rows),{size:3,lowVolSymbols:['A','B']});
 const t=newTrainer('KR','20261030',start);record(t,rows[3]);
 assert.equal(t.accounts[1].reviews[0].entryReason,'trend_data_missing');assert.equal(t.accounts[2].reviews[0].entryReason,'vol_data_missing');
});
test('AI holds, invalid evidence and old review dates never create trial orders',()=>{
 const t=newTrainer('KR','20261030',start);record(t,cs[0],result(cs[0],'hold'));
 assert(t.accounts.every(s=>s.account.pending.length===0));
 const bad=result(cs[1]);bad.evidence[0].verified=false;record(t,cs[1],bad);assert(t.accounts.every(s=>s.account.pending.length===0));
 const old=result(cs[2]);old.review.createdAt=new Date(start-1).toISOString();record(t,cs[2],old);assert(t.accounts.every(s=>s.reviews.length===2));
});
test('forward valuation includes idle days, does not backfill, and is idempotent',async()=>{
 const t=newTrainer('KR','20261030',start);record(t,cs[0]);
 const load=async()=>[bar('20261029'),bar('20261030'),bar('20261102'),bar('20261103')];
 const next=await advanceTrainer(t,'KR',load,Date.parse('2026-11-03T10:00:00Z'));
 assert(next.accounts.every(s=>s.account.trades.length===1));assert(next.accounts.every(s=>s.account.history.length===3));
 assert.equal(t.accounts[0].account.trades.length,0);assert.equal(next.accounts[0].account.trades[0].date,'20261102');
 assert.deepEqual(await advanceTrainer(next,'KR',load,Date.parse('2026-11-03T10:00:00Z')),next);
 const idle=await advanceTrainer(newTrainer('KR','20261030',start),'KR',load,Date.parse('2026-11-03T10:00:00Z'));
 assert(idle.accounts.every(s=>s.account.history.length===3&&s.account.equity===100000000));
});
test('missing bar or corrupt account never partially advances or resets experiments',async()=>{
 const t=newTrainer('KR','20261030',start);record(t,cs[0]);const before=structuredClone(t);
 await assert.rejects(advanceTrainer(t,'KR',async(_m,c)=>c==='005930'?[bar('20261102'),bar('20261103')]:[bar('20261102')],Date.parse('2026-11-03T10:00:00Z')),/price_data_missing/);
 assert.deepEqual(t,before);t.accounts[1].account.cash=NaN;assert.throws(()=>validateTrainer(t,'KR'),/trainer_invalid/);
});
test('common candidate eligibility preserves existing liquidity and trend rules',()=>{
 const r={c:'A',view:'추천',per:10,tv20:49,ref:[]};assert.equal(candidateFor(r,'KR',{},'20261030').qualified,false);
 assert.equal(candidateFor({...r,tv20:50},'KR',{},'20261030').qualified,true);
 assert.equal(candidateFor({...r,tv20:50,ref:['하락 추세']},'KR',{},'20261030').qualified,false);
 assert.equal(candidateFor({...r,tv20:.1},'US',{items:{A:Array(15).fill('A.O')}},'20261030').rc,'A.O');
});
