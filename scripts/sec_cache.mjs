// 회사 맥 전용: 미장 추천 후보의 SEC 공시를 받아 feeds/sec-cache-us.json 에 저장한다.
// 이유: GitHub Actions 서버 IP 는 SEC 가 403 으로 막아(2026-11-02~04, 92건 전부) 미장 AI 검토가 멈췄다.
// paper-run 은 이 파일을 먼저 읽고, 없을 때만 SEC 에 직접 접속한다. (2026-11-04 사용자 결정 '가')
// 사용법: SEC_CONTACT_EMAIL=<연락처> node scripts/sec_cache.mjs
import fs from 'node:fs';
import { createSecClient } from './paper-sec.mjs';
import { plainText } from './paper-data.mjs';

const root = new URL('..', import.meta.url);
const picks = JSON.parse(fs.readFileSync(new URL('feeds/stock-picks-us.json', root), 'utf8'));
const out = { date: picks.date, fetchedAt: new Date().toISOString(), note: '회사 맥이 받은 SEC 공시 (공개 자료)', items: {} };
const sec = createSecClient();
let ok = 0, fail = 0;
for (const row of picks.top || []) {
  const r = await sec({ c: row.c }, plainText);
  if (r.documents.length) { out.items[row.c] = { documents: r.documents }; ok++; }
  else { out.items[row.c] = { documents: [], reason: r.reason }; fail++; }
  if (['sec_access_denied', 'sec_rate_limited', 'waiting_sec_contact'].includes(r.reason)) {
    console.error('SEC 중단: ' + r.reason); process.exit(2);
  }
}
const dest = new URL('feeds/sec-cache-us.json', root);
fs.writeFileSync(new URL('feeds/sec-cache-us.json.tmp', root), JSON.stringify(out));
fs.renameSync(new URL('feeds/sec-cache-us.json.tmp', root), dest);
console.log(`sec-cache ${picks.date}: 공시 확보 ${ok} · 없음 ${fail}`);
