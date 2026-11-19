import test from 'node:test';
import assert from 'node:assert/strict';
import {newAccount,queueCandidate} from '../scripts/paper-engine.mjs';
import {rankFormulas,newFormulaExperiment,runFormulaExperiment,queueFormula,validateFormulaExperiment} from '../scripts/paper-formulas.mjs';
const now=Date.parse('2026-11-19T08:00:00Z');
const scores=()=>({v:2,market:'US',date:'20261118',items:Object.fromEntries(Array.from({length:12},(_,i)=>['X'+String(i).padStart(2,'0'),[90,'추천',i,[],[],[],1,0,[],2,-3,20,'테스트 '+i,'NASDAQ','X'+i+'.O',100,'업종',100]]))});
function bars(end='20261118'){
 const out=[];for(let n=330;n>=0;n--){const d=new Date(Date.parse('2026-11-18T00:00:00Z')-n*864e5);if([0,6].includes(d.getUTCDay()))continue;out.push([d.toISOString().slice(0,10).replaceAll('-',''),100,102,98,100,1000000]);}
 if(end==='20261119')out.push([end,100,102,98,101,1000000]);return out;
}
test('liquidity first, ties deterministic, missing momentum neutral',()=>{
 const s=scores();s.items.X00[6]=.01;s.items.X01[15]=null;
 const r=rankFormulas(s);assert.equal(r.size,11);
 for(const list of Object.values(r.lists)){assert.equal(list.length,10);assert(!list.some(x=>x.c==='X00'));assert.equal(new Set(list.map(x=>x.c)).size,10);}
 assert.equal(r.lists.middle.find(x=>x.c==='X01').parts[0],25);
});
test('new control and candidates start equally; established account cannot use formula queue',()=>{
 const t=newFormulaExperiment('20261118',now);validateFormulaExperiment(t);
 assert.equal(new Set(t.accounts.map(x=>JSON.stringify(x.account))).size,1);
 assert.throws(()=>queueFormula(newAccount('US'),{c:'X'},null,'20261118',now,'x'),/formula_account_required/);
 const a=newAccount('US');const p=queueCandidate(a,{c:'X',rc:'X',qualified:true,lv:{b1:100,st:90}},null,[],'x',now);assert.equal(p.status,'wait');assert.equal(a.pending.length,0);
});
test('new run queues only, same-date retry is idempotent, all candidates use equal execution',async()=>{
 const t=await runFormulaExperiment(null,scores(),async()=>bars(),now);
 assert(t.accounts.every(x=>x.account.trades.length===0&&x.account.pending.length>0));
 assert.deepEqual(t.accounts[0].account.pending,t.accounts[1].account.pending);
 assert.deepEqual(t.accounts[1].account.pending,t.accounts[2].account.pending);
 for(const r of t.accounts){assert(r.account.pending.reduce((s,p)=>s+p.reserved,0)<=100000);for(const p of r.account.pending){assert(p.reserved<=15000);assert(p.quantity*(p.entry-p.stop+(p.entry+p.stop)*.0015)<=1000);}}
 const retry=await runFormulaExperiment(t,scores(),async()=>bars(),now+1000);assert.deepEqual(retry.accounts,t.accounts);
 const s=scores();s.date='20261119';
 const next=await runFormulaExperiment(t,s,async()=>bars('20261119'),Date.parse('2026-11-20T08:00:00Z'));
 assert(next.accounts.every(x=>x.account.trades.some(t=>t.side==='buy'&&t.date==='20261119'&&t.reason==='formula_limit_entry')));
 assert.equal(new Set(next.accounts.map(x=>JSON.stringify(x.account))).size,1);
});
test('missing valuation bars abort atomically and do not reset history',async()=>{
 const t=await runFormulaExperiment(null,scores(),async()=>bars(),now),before=JSON.stringify(t);
 await assert.rejects(runFormulaExperiment(t,scores(),async(m,c)=>c==='AAPL.O'?bars('20261119'):[],Date.parse('2026-11-20T08:00:00Z')),/price_data_missing/);
 assert.equal(JSON.stringify(t),before);
 const damaged=structuredClone(t);damaged.accounts[1].account.initialCapital=1;
 assert.throws(()=>validateFormulaExperiment(damaged),/formula_state_invalid/);
});
test('stale feed prevents initial account creation; corrupt later feed cannot issue orders',async()=>{
 const s=scores();s.date='20261117';await assert.rejects(runFormulaExperiment(null,s,async()=>bars(),now),/formula_feed_stale/);
 const t=newFormulaExperiment('20261118',now);s.date='20261118';s.items={};
 await assert.rejects(runFormulaExperiment(t,s,async()=>bars(),now),/formula_universe_small/);
 assert.equal(t.accounts[0].account.pending.length,0);
});
test('missing individual prices are explicitly held in every account',async()=>{
 const t=await runFormulaExperiment(null,scores(),async(m,c)=>c==='AAPL.O'?bars():[],now);
 assert(t.accounts.every(r=>r.account.pending.length===0&&r.reviews.every(x=>x.reason==='quote_or_costs_invalid')));
});

test('frozen old quotes cannot create fresh orders',async()=>{
 await assert.rejects(runFormulaExperiment(null,scores(),async()=>bars(),now+8*864e5),/formula_prices_stale/);
});
