import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecClient } from '../scripts/paper-sec.mjs';
const now = () => Date.parse('2026-10-31T00:00:00Z');
const plainText = s => s.replace(/<[^>]*>/g,' ');
const tickers = { 0: { ticker: 'AAPL', cik_str: 320193, title: 'Apple' } };
const submission = { cik: '320193', tickers: ['AAPL'], filings: { recent: {
  form: ['10-Q'], accessionNumber: ['0000320193-26-000001'], primaryDocument: ['aapl.htm'],
  acceptanceDateTime: ['2026-10-30T12:00:00Z'],
} } };
function client(responses) {
  const calls = [];
  const collect = createSecClient({ email:'owner@example.com', now, wait:async()=>{},
    fetcher:async (url, options) => {
      calls.push({url,options}); const value = responses.shift();
      if (typeof value === 'number') return { ok:false, status:value };
      return {ok:true,json:async()=>value,text:async()=>value};
    } });
  return { collect, calls };
}
test('SEC contact missing or header injection means no request',async()=>{
  for (const email of ['', 'invalid', 'name@example.com\r\nX-Test: injected']) {
    const collect = createSecClient({email,fetcher:()=>{throw Error('must not call');}});
    assert.deepEqual(await collect({c:'AAPL'},plainText), {documents:[],reason:'waiting_sec_contact'});
  }
});
test('SEC access denial and throttling stop further requests in this run',async()=>{
  for (const [status,reason] of [[403,'sec_access_denied'],[429,'sec_rate_limited']]) {
    const {collect,calls}=client([status]);
    assert.equal((await collect({c:'AAPL'},plainText)).reason,reason);
    assert.equal((await collect({c:'MSFT'},plainText)).reason,reason);
    assert.equal(calls.length,1);
  }
});
test('issuer mismatch cannot become verified filing evidence',async()=>{
  const {collect,calls}=client([tickers,{...submission,cik:'1'}]);
  assert.equal((await collect({c:'AAPL'},plainText)).reason,'sec_issuer_mismatch');
  assert.equal(calls.length,2);
});
test('valid filing has evidence metadata without exposing contact',async()=>{
  const {collect,calls}=client([tickers,submission,'<p>'+('Public issuer facts. '.repeat(20))+'</p>']);
  const result = await collect({c:'AAPL'},plainText);
  assert.equal(result.reason,'ok'); assert.equal(result.documents.length,1);
  assert.equal(result.documents[0].verified,true);
  assert.equal(calls[0].options.headers['User-Agent'],'VantorPaperResearch/1.0 owner@example.com');
  assert.equal(JSON.stringify(result).includes('owner@example.com'),false);
});
test('future filing cannot become current evidence',async()=>{
  const future=structuredClone(submission);
  future.filings.recent.acceptanceDateTime=['2027-01-01T00:00:00Z'];
  const {collect}=client([tickers,future,'Public issuer facts. '.repeat(20)]);
  assert.equal((await collect({c:'AAPL'},plainText)).reason,'sec_document_invalid');
});
