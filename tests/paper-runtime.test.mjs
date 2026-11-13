import test from 'node:test';
import assert from 'node:assert/strict';
import { completedBars, advancePortfolio, evidenceCoverage } from '../scripts/paper-runtime.mjs';
import { newAccount, advanceDay, validBar } from '../scripts/paper-engine.mjs';
const bar = (date,close=100) => [date,100,105,95,close,1000];
const held = () => ({symbol:'TEST',rc:'TEST.O',quantity:10,entry:100,costBasis:100,lastPrice:100,stop:90,heldDays:1,entryDate:'20261030'});
test('incomplete daily bars are excluded before settlement; NY DST uses local time',()=>{
  const rows=[bar('20261030'),bar('20261102')];
  assert.equal(completedBars(rows,'KR',Date.parse('2026-11-02T06:00:00Z')).length,1);
  assert.equal(completedBars(rows,'KR',Date.parse('2026-11-02T08:00:00Z')).length,2);
  assert.equal(completedBars(rows,'US',Date.parse('2026-11-02T22:59:00Z')).length,1);
  assert.equal(completedBars(rows,'US',Date.parse('2026-11-02T23:00:00Z')).length,2);
  assert.equal(completedBars([bar('20261030')],'US',Date.parse('2026-10-30T22:00:00Z')).length,1);
});
test('holdings advance with completed candles without any recommendation feed',async()=>{
  const a=newAccount('KR'); a.positions=[held()];a.cash-=1000;a.lastDate='20261030';
  const result=await advancePortfolio(a,'KR',async()=>[bar('20261030'),bar('20261102',101)],Date.parse('2026-11-02T10:00:00Z'));
  assert.equal(result.account.lastDate,'20261102');assert.equal(result.account.positions[0].lastPrice,101);
  assert.equal(a.lastDate,'20261030');
});
test('multi-day catch-up preserves original account when a later day is missing',async()=>{
  const a=newAccount('KR');a.positions=[held()];a.cash-=1000;a.lastDate='20261030';
  const before=structuredClone(a);
  await assert.rejects(advancePortfolio(a,'KR',async(_m,c)=>c==='005930' ? [bar('20261102'),bar('20261103')] : [bar('20261102')],Date.parse('2026-11-03T10:00:00Z')),/price_data_missing/);
  assert.deepEqual(a,before);
});
test('coverage survives no-op reruns and excludes superseded or previous-date reports',()=>{
  const reviews=[{symbol:'A',sourceDate:'1',status:'waiting_evidence'},
    {symbol:'A',sourceDate:'1',status:'review_pass',sources:[{type:'filing',provider:'official_ir'}]},
    {symbol:'B',sourceDate:'1',status:'waiting_evidence'}, {symbol:'C',sourceDate:'0',status:'waiting_evidence'}];
  assert.deepEqual(evidenceCoverage(reviews,'1'),{checked:2,verified:1,officialIr:1,held:1});
});
const pending = () => ({...held(),signalDate:'20261030',reviewCreatedAt:'2026-11-01T00:00:00Z',reviewExpiresAt:'2026-11-05T00:00:00Z'});
test('malformed bars and review timestamps cannot create trades',()=>{
  assert.equal(validBar(['20261102',100,105,95,100]),false);
  const a=newAccount('US');a.lastDate='20261030';a.pending=[{...pending(),reviewCreatedAt:'invalid'}];
  assert.equal(advanceDay(a,'20261102',{TEST:bar('20261102')}).trades.length,0);
});
test('a review after that session opened waits for the following session',()=>{
  const a=newAccount('US');a.lastDate='20261030';a.pending=[{...pending(),reviewCreatedAt:'2026-11-02T15:00:00Z'}];
  const b=advanceDay(a,'20261102',{TEST:bar('20261102')});
  assert.equal(b.trades.length,0);assert.equal(b.pending.length,1);
  assert.equal(advanceDay(b,'20261103',{TEST:bar('20261103')}).trades[0].side,'buy');
});
test('opening drawdown blocks pending entries but continues protective selling',()=>{
  const a=newAccount('US');a.cash=80000;a.positions=[{...held(),symbol:'OLD',quantity:200}];a.pending=[pending()];a.lastDate='20261030';
  const b=advanceDay(a,'20261102',{OLD:['20261102',20,25,15,22,1000],TEST:bar('20261102')});
  assert.equal(b.paused,true);assert.equal(b.trades.filter(t=>t.side==='buy').length,0);assert.equal(b.trades[0].reason,'stop');
});
test('fill quantity rechecks the accepted one percent risk budget',()=>{
  const a=newAccount('US');a.cash=10000;a.equity=10000;a.peakEquity=10000;a.pending=[{...pending(),quantity:100}];a.lastDate='20261030';
  const b=advanceDay(a,'20261102',{TEST:bar('20261102')});
  assert.ok(b.trades[0].quantity * (10 + 190*a.costRate) <= 100);
});
test('filing coverage includes verified filings when news or AI fails, including legacy news_missing',()=>{
 const reviews=[{symbol:'A',sourceDate:'1',status:'waiting_evidence',evidenceReason:'news_missing'},
 {symbol:'B',sourceDate:'1',status:'waiting_evidence',evidenceReason:'news_stale',sources:[{type:'filing',provider:'official_ir'}]},
 {symbol:'C',sourceDate:'1',status:'quota_wait',sources:[{type:'filing'}]},
 {symbol:'D',sourceDate:'1',status:'waiting_evidence',evidenceReason:'sec_access_denied'}];
 assert.deepEqual(evidenceCoverage(reviews,'1'),{checked:4,verified:3,officialIr:1,held:3});
});
