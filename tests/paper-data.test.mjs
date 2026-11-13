import test from 'node:test';
import assert from 'node:assert/strict';
import { collectNewsResult, collectEvidence } from '../scripts/paper-data.mjs';
const now=Date.parse('2026-11-13T02:00:00Z');
const row=(dt='20261112090000')=>({tit:'기사',dt,oid:'fnGuide',aid:'1'});
const body={result:{article:{content:'<p>'+('확인된 기사 내용 '.repeat(30))+'</p>'}}};
const loadFor=rows=>async url=>url.includes('/end?')?body:rows;
test('US stale news is distinguished from inaccessible bodies without fetching expired pages',async()=>{
 let requests=0;
 const r=await collectNewsResult('US',{rc:'TEST.O'},[],{now,load:async()=>{requests++;return [row('20261029090000')];}});
 assert.equal(requests,1);assert.equal(r.reason,'news_stale');assert.equal(r.documents.length,0);
 assert.equal(r.diagnostics.stale,1);assert.equal(r.diagnostics.latestPublishedAt,'2026-10-29T00:00:00.000Z');
});
test('news fetch/format/empty/body failures stay distinct and never produce evidence',async()=>{
 for(const [load,reason] of [
  [async()=>{throw Error('network');},'news_list_unavailable'],[async()=>({error:true}),'news_list_invalid'],
  [async()=>[],'news_empty'],[async u=>u.includes('/end?')?{}:[row()],'news_body_unavailable'],
  [async u=>u.includes('/end?')?{result:{article:{content:'짧음'}}}:[row()],'news_body_short']]){
  const r=await collectNewsResult('US',{rc:'TEST.O'},[],{now,load});assert.equal(r.reason,reason);assert.deepEqual(r.documents,[]);
 }
});
test('future or invalid dates cannot become verified news',async()=>{
 for(const dt of ['20261114090000','bad','20261312090000']){
 const r=await collectNewsResult('US',{rc:'TEST.O'},[],{now,load:loadFor([row(dt)])});
 assert.equal(r.reason,'news_date_invalid');assert.equal(r.documents.length,0);
 }
});
test('one usable article survives another article failure and compatibility wrapper returns documents',async()=>{
 const load=async u=>u.includes('/end?')?(u.includes('articleId=bad')?{}:body):[{...row(),aid:'bad'},row()];
 const r=await collectNewsResult('US',{rc:'TEST.O'},[],{now,load});assert.equal(r.reason,'ok');
 assert.equal(r.documents.length,1);assert.equal(r.diagnostics.unavailable,1);assert.equal(r.documents[0].verified,true);
 assert.equal(r.documents[0].fetchedAt,new Date(now).toISOString());
 assert.deepEqual(await collectEvidence('US',{rc:'TEST.O'},[],{now,load}),r.documents);
});
test('US 14 day and KR 7 day windows are retained; unsupported KR URLs never fetched',async()=>{
 const dt='20261103090000';
 assert.equal((await collectNewsResult('US',{rc:'TEST.O'},[],{now,load:loadFor([row(dt)])})).reason,'ok');
 const r=await collectNewsResult('KR',{c:'005930'},[['기사','',dt,'https://n.news.naver.com/mnews/article/001/123']],{now,load:async()=>{throw Error('must not fetch');}});
 assert.equal(r.reason,'news_stale');
 assert.equal((await collectNewsResult('KR',{c:'005930'},[['기사','','20261112090000','https://example.com']],{now,load:async()=>{throw Error('must not fetch');}})).reason,'news_url_invalid');
});
