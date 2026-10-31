import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

// Reviewed company-owned sources, not arbitrary URLs supplied by model output.
// Each run resolves the newest filing from RSS; no pinned report or paid provider.
export const IR_SOURCES = Object.freeze({
  MRVL: { origin: 'https://investor.marvell.com', rss: '/sec-filings/all-sec-filings/rss',
    issuer: /MARVELL TECHNOLOGY,? (?:INC\.?)/i, kind: 'equisolve' },
  SNDK: { origin: 'https://investor.sandisk.com', rss: '/rss/sec-filings.xml',
    issuer: /SANDISK CORP(?:ORATION)?/i, kind: 'drupal' },
  WDC: { origin: 'https://investor.wdc.com', rss: '/rss/sec-filings.xml',
    issuer: /WESTERN DIGITAL CORP(?:ORATION)?/i, kind: 'drupal' },
});
const MAX_BYTES = 12 * 1024 * 1024;
const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (s, name) => decode(s.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i'))?.[1] || '').trim();
export function filingText(html) {
  return decode(html.replace(/<(head|script|style|ix:header|ix:hidden)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')).replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, h, d) => {
      const n = h ? parseInt(h, 16) : Number(d);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    }).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
export function extractPdf(buffer) {
  return new Promise((resolve, reject) => {
    const child = spawn('pdftotext', ['-layout', '-', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0, failed = false;
    const fail = () => { if (!failed) { failed = true; child.kill(); reject(Error('ir_pdf_unreadable')); } };
    const timer = setTimeout(fail, 15000);
    child.on('error', fail); child.stdin.on('error', fail); child.stderr.resume();
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > MAX_BYTES) fail(); else chunks.push(chunk); });
    child.on('close', code => { clearTimeout(timer); if (code !== 0) fail(); else if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
    child.stdin.end(buffer);
  });
}
function safeUrl(value, source) {
  const url = new URL(value, source.origin);
  if (url.origin !== source.origin || url.username || url.password || url.hash) throw Error('ir_source_mismatch');
  return url.href;
}
function excerpts(text) {
  if (text.length <= 18000) return text;
  const chunks = [text.slice(0, 6500)];
  // Prefer substantive risk sections; skip early table-of-contents matches.
  for (const pattern of [/item\s*1a[. :–-]*risk factors/gi, /item\s*2[. :–-]*management['’]s discussion/gi]) {
    const match = [...text.matchAll(pattern)].find(m => m.index > 6500);
    if (match) chunks.push(text.slice(match.index, match.index + 4500));
  }
  chunks.push(text.slice(-2000));
  return '[EXCERPTS ONLY: full filing was fetched; omitted sections have NOT been reviewed by AI.] ' + chunks.join(' [OMITTED TEXT] ');
}
export function createIrClient({ fetcher = fetch, pdfText = extractPdf, now = Date.now } = {}) {
  const cache = new Map();
  async function get(url, source) {
    const target = safeUrl(url, source);
    const response = await fetcher(target, { redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'VantorPaperResearch/1.0', Accept: 'application/rss+xml, application/pdf, text/html' } });
    if (!response.ok) throw Error('ir_unavailable');
    if (response.url && safeUrl(response.url, source) !== target) throw Error('ir_source_mismatch');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw Error('ir_document_too_large');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length; if (size > MAX_BYTES) throw Error('ir_document_too_large'); chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function collect(candidate) {
    const source = IR_SOURCES[candidate.c];
    if (!source) return { documents: [], reason: 'ir_unsupported' };
    try {
      const xml = (await get(source.origin + source.rss, source)).toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !source.issuer.test(tag(xml, 'title'))) throw Error('ir_issuer_mismatch');
      const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => {
        const title = tag(m[1], 'title'), form = title.match(/^(10-K|10-Q|8-K|20-F|6-K)(?=[:\s-])/i)?.[1].toUpperCase();
        return { form, link: tag(m[1], 'link'), date: Date.parse(tag(m[1], 'pubDate')), guid: tag(m[1], 'guid') };
      }).filter(x => x.form && Number.isFinite(x.date)).sort((a,b) => b.date - a.date);
      const item = items[0];
      if (!item || item.date > now() || now() - item.date > 120 * 864e5) throw Error('ir_filing_stale');
      const listingUrl = safeUrl(item.link, source);
      const accession = new URL(listingUrl).pathname.match(/(?:^|\/)(\d{10}-\d{2}-\d{6})(?:\/|$)/)?.[1];
      if (!accession) throw Error('ir_document_invalid');
      let url, text;
      if (source.kind === 'equisolve') {
        if (!listingUrl.endsWith('/' + accession + '.pdf')) throw Error('ir_document_invalid');
        url = listingUrl;
        const bytes = await get(url, source);
        if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw Error('ir_document_invalid');
        text = await pdfText(bytes);
      } else {
        if (!/^\d+$/.test(item.guid) || !listingUrl.includes('/sec-filing/' + item.form.toLowerCase() + '/')) throw Error('ir_document_invalid');
        const page = (await get(listingUrl, source)).toString('utf8');
        if (!source.issuer.test(filingText(page))) throw Error('ir_issuer_mismatch');
        // Match the full accession in the PDF link title, not an unrelated exhibit.
        const anchor = [...page.matchAll(/<a\b[^>]*>/gi)].map(m => m[0]).find(a =>
          /type=["']application\/pdf["']/i.test(a) &&
          a.match(/title=["']([^"']+)["']/i)?.[1] === accession + '.pdf');
        const href = anchor?.match(/href=["']([^"']+)["']/i)?.[1];
        if (!href) throw Error('ir_document_unavailable');
        url = safeUrl(decode(href), source);
        if (!new URL(url).pathname.startsWith('/static-files/')) throw Error('ir_document_invalid');
        const bytes = await get(url, source);
        if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw Error('ir_document_invalid');
        text = await pdfText(bytes);
      }
      text = text.replace(/\s+/g, ' ').trim();
      if (!validBody(text, source, candidate.c, item.form)) throw Error('ir_issuer_mismatch');
      return { reason: 'ok', provider: 'official_ir', documents: [{
        id: createHash('sha256').update(JSON.stringify({ url, text })).digest('hex'), type: 'filing',
        title: candidate.c + ' ' + item.form + ' · 기업 공식 IR', text: excerpts(text), url,
        listingUrl, accession, provider: 'official_ir', fullTextChars: text.length,
        excerpted: text.length > 18000, publishedAt: new Date(item.date).toISOString(),
        fetchedAt: new Date(now()).toISOString(), verified: true,
      }] };
    } catch (e) { return { documents: [], reason: /^ir_/.test(e.message) ? e.message : 'ir_unavailable' }; }
  }
  return candidate => {
    if (!cache.has(candidate.c)) cache.set(candidate.c, collect(candidate));
    return cache.get(candidate.c);
  };
}
function validBody(text, source, symbol, form) {
  const cover = text.slice(0, 14000).replace(/\s+/g, ' ');
  return text.length >= 1000 && /SECURITIES AND EXCHANGE COMMISSION/i.test(cover) &&
    source.issuer.test(cover) && new RegExp('\\b' + symbol + '\\b').test(cover) &&
    new RegExp('FORM\\s+' + form + '\\b', 'i').test(cover) && /(?:Item\s+\d|PART\s+I)/i.test(text);
}

// SEC remains first choice. A global SEC block must not suppress later IR issuers.
export function createFilingCollector(sec, ir) {
  return async (candidate, plainText) => {
    const result = await sec(candidate, plainText);
    if (result.documents.length) return result;
    const fallback = await ir(candidate);
    return { ...fallback, secReason: result.reason };
  };
}
