import { advanceDay, validBar } from './paper-engine.mjs';

// Conservative end-of-day buffer, including shortened sessions. Only observed
// exchange bars are used, so holidays are not manufactured as trading days.
export function completedBars(rows, market, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: market === 'KR' ? 'Asia/Seoul' : 'America/New_York',
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }).formatToParts(now).map(x => [x.type,x.value]));
  const today = parts.year + parts.month + parts.day;
  const settled = +parts.hour >= (market === 'KR' ? 17 : 18);
  return rows.filter(b => b[0] < today || (b[0] === today && settled)).sort((a,b)=>a[0].localeCompare(b[0]));
}
export async function advancePortfolio(account, market, load, now = Date.now()) {
  const reference = completedBars(await load(market, market === 'KR' ? '005930' : 'AAPL.O'), market, now);
  if (!reference.length || !validBar(reference.at(-1))) throw Error('price_data_missing');
  const latestDate = reference.at(-1)[0];
  if (!account.positions.length && !account.pending.length) return { account, latestDate };
  const needed = [...new Map([...account.positions,...account.pending].map(p=>[p.symbol,p])).values()];
  const histories = new Map();
  for (const p of needed) histories.set(p.symbol, await load(market, market === 'US' ? p.rc : p.symbol));
  let next = account;
  for (const b of reference.filter(b=>b[0] > (account.lastDate || latestDate))) {
    const bars = Object.fromEntries([...histories].map(([symbol,rows])=>[symbol,rows.find(r=>r[0]===b[0])]));
    next = advanceDay(next,b[0],bars);
  }
  return { account: next, latestDate }; // atomic catch-up: no partial assignment on failure
}
export function evidenceCoverage(reviews, sourceDate) {
  const latest = new Map();
  for(const r of reviews) if(r.sourceDate === sourceDate) latest.set(r.symbol,r);
  const rows=[...latest.values()];
  return { checked: rows.length,
    verified: rows.filter(r=>r.sources?.some(s=>s.type==='filing')).length,
    officialIr: rows.filter(r=>r.sources?.some(s=>s.provider==='official_ir')).length,
    held: rows.filter(r=>r.status==='waiting_evidence').length };
}
