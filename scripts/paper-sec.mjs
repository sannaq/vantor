import { createHash } from 'node:crypto';

// SEC asks automated clients to identify their application and contact address.
// The contact stays in GitHub Secrets and request headers, never published feeds.
export function createSecClient({ email = process.env.SEC_CONTACT_EMAIL || '', fetcher = fetch,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  const contact = email.trim();
  const validContact = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(contact);
  let tickers, blocked = null;
  async function get(url, json = true) {
    if (blocked) throw blocked;
    await wait(300); // sequential client: comfortably below SEC's 10 requests/sec
    const response = await fetcher(url, { headers: {
      'User-Agent': `VantorPaperResearch/1.0 ${contact}`,
      Accept: json ? 'application/json' : 'text/html',
    }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!response.ok) {
      const error = { reason: response.status === 403 ? 'sec_access_denied' :
        response.status === 429 ? 'sec_rate_limited' : 'sec_unavailable', httpStatus: response.status };
      if ([403,429].includes(response.status)) blocked = error; // no retry storm for other candidates
      throw error;
    }
    return json ? response.json() : response.text();
  }
  return async function collect(candidate, plainText) {
    if (!validContact) return { documents: [], reason: 'waiting_sec_contact' };
    try {
      tickers ||= await get('https://www.sec.gov/files/company_tickers.json');
      const issuer = Object.values(tickers).find(s => s.ticker === candidate.c);
      if (!issuer) return { documents: [], reason: 'sec_issuer_missing' };
      const cik = String(issuer.cik_str);
      if (!/^\d{1,10}$/.test(cik)) throw { reason: 'sec_issuer_mismatch' };
      const data = await get(`https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`);
      if (Number(data.cik) !== Number(cik) || !data.tickers?.includes(candidate.c)) {
        throw { reason: 'sec_issuer_mismatch' };
      }
      const r = data.filings?.recent, i = r?.form?.findIndex(f => ['10-K','10-Q','8-K','20-F','6-K'].includes(f));
      if (i == null || i < 0) return { documents: [], reason: 'sec_filing_missing' };
      const accession = r.accessionNumber[i], primary = r.primaryDocument[i];
      if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || !/^[A-Za-z0-9_.-]+\.html?$/.test(primary)) {
        throw { reason: 'sec_document_invalid' };
      }
      const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replaceAll('-','')}/${primary}`;
      const text = plainText(await get(url, false)), publishedAt = new Date(r.acceptanceDateTime[i]).toISOString();
      if (text.length < 160 || Date.parse(publishedAt) > now()) return { documents: [], reason: 'sec_document_invalid' };
      return { reason: 'ok', documents: [{ id: createHash('sha256').update(JSON.stringify({ url, text })).digest('hex'),
        type: 'filing', title: `${issuer.title} ${r.form[i]}`, text: text.slice(0,10000), url, publishedAt,
        fetchedAt: new Date(now()).toISOString(), verified: true }] };
    } catch (e) { return { documents: [], reason: e?.reason || 'sec_unavailable',
      ...(Number.isInteger(e?.httpStatus) ? { httpStatus: e.httpStatus } : {}) }; }
  };
}
