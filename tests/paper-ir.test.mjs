import test from 'node:test';
import assert from 'node:assert/strict';
import { createIrClient, createFilingCollector, filingText } from '../scripts/paper-ir.mjs';
const now = () => Date.parse('2026-10-31T01:00:00Z');
const accession = '0001628280-26-068601';
const origin = 'https://investor.sandisk.com';
const link = origin + '/sec-filings/sec-filing/10-q/' + accession;
const rss = (overrides = {}) => {
  const { channel = 'Sandisk Corporation SEC Filings', date = 'Fri, 30 Oct 2026 16:45:03 -0400', url = link } = overrides;
  return `<rss><channel><title>${channel}</title><item><title><![CDATA[10-Q: Quarterly report]]></title><link>${url}</link><pubDate>${date}</pubDate><guid isPermaLink="false">8486</guid></item></channel></rss>`;
};
const detail = (a = accession, href = '/static-files/abc') => `<p>Sandisk Corporation</p><a href="${href}" type="application/pdf" title="${a}.pdf">Download PDF</a>`;
const body = (symbol = 'SNDK', issuer = 'SANDISK CORPORATION') => `UNITED STATES SECURITIES AND EXCHANGE COMMISSION FORM 10-Q ${issuer} Trading symbol ${symbol} PART I Item 1. ` + 'Public financial information. '.repeat(100);
function client(values, text = body()) {
  const calls = [];
  return { calls, collect: createIrClient({ now, pdfText: async () => text, fetcher: async (url, options) => {
    calls.push({url, options});
    const value = values.shift();
    if (value instanceof Response) return value;
    if (value === undefined) throw Error('unexpected_request');
    return new Response(value);
  } }) };
}
test('official RSS → accession-specific PDF produces verified evidence and caches within run', async () => {
  const {collect, calls} = client([rss(), detail(), '%PDF-1.7 fixture']);
  const result = await collect({c:'SNDK'});
  assert.equal(result.reason, 'ok');
  assert.equal(result.documents[0].provider, 'official_ir');
  assert.equal(result.documents[0].accession, accession);
  assert.equal(result.documents[0].url, origin + '/static-files/abc');
  assert.equal(result.documents[0].verified, true);
  assert.equal((await collect({c:'SNDK'})).reason, 'ok');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.options.redirect === 'error'));
});
test('unsupported ticker makes no IR requests', async () => {
  const {collect,calls} = client([]);
  assert.equal((await collect({c:'UNKNOWN'})).reason, 'ir_unsupported');
  assert.equal(calls.length, 0);
});
test('wrong company, stale/future date, and external RSS link cannot produce evidence', async () => {
  for (const input of [rss({channel:'Unrelated Company'}), rss({date:'2027-01-01T00:00:00Z'}),
      rss({date:'2025-01-01T00:00:00Z'}), rss({url:'https://attacker.example/' + accession})]) {
    const {collect,calls} = client([input]);
    assert.equal((await collect({c:'SNDK'})).documents.length, 0);
    assert.equal(calls.length, 1);
  }
});
test('new accession cannot silently reuse a previous report or external PDF', async () => {
  for (const page of [detail('0001628280-26-000001'), detail(accession, 'https://attacker.example/filing.pdf')]) {
    const {collect,calls} = client([rss(), page]);
    assert.equal((await collect({c:'SNDK'})).documents.length, 0);
    assert.equal(calls.length, 2);
  }
});
test('PDF must contain the issuer, trading symbol, SEC form and substantive body', async () => {
  for (const text of [body('WRONG'), body('SNDK','OTHER COMPANY'), body().replace('FORM 10-Q','FORM 8-K'), 'Access denied']) {
    const {collect} = client([rss(),detail(),'%PDF-fixture'],text);
    assert.equal((await collect({c:'SNDK'})).documents.length, 0);
  }
});
test('HTML error page served as PDF, DTD and oversized responses are held', async () => {
  for (const values of [[rss(),detail(),'<html>Unavailable</html>'], ['<!DOCTYPE x><rss/>'],
      [new Response('x',{headers:{'content-length': String(13*1024*1024)}})]]) {
    const {collect} = client(values);
    assert.equal((await collect({c:'SNDK'})).documents.length, 0);
  }
});
test('RSS ordering cannot make an older report supersede the newest one', async () => {
  const old = rss({date:'2026-10-01T00:00:00Z'}).match(/<item>[\s\S]*?<\/item>/)[0];
  const input = rss({date:'2027-01-01T00:00:00Z'}).replace('<item>',old+'<item>');
  const {collect,calls} = client([input]);
  assert.equal((await collect({c:'SNDK'})).reason,'ir_filing_stale');
  assert.equal(calls.length,1);
});
test('Equisolve resolves PDF dynamically without a stored accession', async () => {
  const pdf = 'https://investor.marvell.com/sec-filings/all-sec-filings/content/' + accession + '/' + accession + '.pdf';
  const input = rss({channel:'Marvell Technology, Inc. SEC Filings', url:pdf});
  const {collect} = client([input,'%PDF-fixture'], body('MRVL','MARVELL TECHNOLOGY, INC.'));
  assert.equal((await collect({c:'MRVL'})).reason, 'ok');
});
test('SEC denial or unsupported IR issuer does not block the next supported issuer', async () => {
  const irCalls=[];
  const collect=createFilingCollector(async()=>({documents:[],reason:'sec_access_denied'}),async candidate=>{
    irCalls.push(candidate.c);
    return candidate.c === 'MRVL' ? {documents:[{verified:true}],reason:'ok'} : {documents:[],reason:'ir_unsupported'};
  });
  assert.equal((await collect({c:'AXTI'})).reason,'ir_unsupported');
  assert.equal((await collect({c:'MRVL'})).reason,'ok');
  assert.deepEqual(irCalls,['AXTI','MRVL']);
});
test('successful SEC evidence avoids unnecessary IR requests', async () => {
  const collect=createFilingCollector(async()=>({documents:[{verified:true}],reason:'ok'}),async()=>{throw Error('must not request');});
  assert.equal((await collect({c:'MRVL'})).reason,'ok');
});
test('large filings disclose excerpts; HTML hidden XBRL metadata is removed', async () => {
  const {collect} = client([rss(),detail(),'%PDF-fixture'],body()+' More disclosure. '.repeat(2000));
  const doc=(await collect({c:'SNDK'})).documents[0];
  assert.equal(doc.excerpted,true); assert.match(doc.text,/EXCERPTS ONLY/); assert.ok(doc.text.length < 18000);
  assert.equal(filingText('<head>junk</head><ix:header>hidden</ix:header><p>Company &#160; facts</p>'),'Company facts');
});
