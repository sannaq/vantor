#!/usr/bin/env node
/* 증시 브리핑 빌더 — briefs/today.json 을 읽어 briefs/<date>.html(단독 카드) 생성 + index.json 갱신.
   레이아웃/스타일은 고정. 매일 데이터(오늘의 사실·이벤트)만 today.json 으로 채운다.
   사용: node briefs/build.mjs            (기본 입력 briefs/today.json)
        node briefs/build.mjs path.json  (입력 경로 지정)
   교육용 참고 · 투자 판단은 스스로. 출처: 경제길잡이(moneygil) 재구성 + 이벤트·맥락 추가. */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const inPath = process.argv[2] || path.join(DIR, 'today.json');
const d = JSON.parse(fs.readFileSync(inPath, 'utf8'));

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 굵게: **텍스트** → <b>, 업/다운: {up:...}/{dn:...} 는 안 씀. 간단 마크업만.
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

const tiles = (arr = []) => arr.map(t =>
  `<div class="tile g"><div class="t">${esc(t.t)}</div><div class="v up">${esc(t.v)}</div><div class="s">${esc(t.s || '')}</div></div>`).join('');
const lines = (arr = []) => (arr || []).map(md).join('<br>');
const evrows = (arr = []) => arr.map(e =>
  `<div class="evrow"><div class="evk">${esc(e.k)}</div><div class="evb">${md(e.b)}</div></div>`).join('');
const checks = (arr = []) => arr.map((c, i) =>
  `<div class="crow"><div class="cn">${i + 1}</div><div class="cb">${md(c)}</div></div>`).join('');
const pills = (arr = []) => arr.map(p =>
  `<div class="pill ${esc(p.cl || 'n')}">${esc(p.t)}</div>`).join('');

const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.title || '증시 브리핑')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif}
body{max-width:1000px;margin:0 auto;background:#fff;color:#1b2028;padding:22px 18px}
.head{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #eceef1;padding-bottom:14px;gap:10px;flex-wrap:wrap}
h1{font-size:26px;font-weight:800;letter-spacing:-.5px}
.src{color:#98a1ad;font-size:12.5px;font-weight:600}
.lead{font-size:15px;line-height:1.6;color:#39414d;margin:16px 0 4px}
.lead b{color:#111}
.box{border:1px solid #e7eaee;border-radius:14px;padding:16px 18px;margin-top:14px}
.box h2{font-size:17px;font-weight:800;margin-bottom:12px}
.tag{font-size:11px;font-weight:800;color:#5b6470;background:#eef1f4;border-radius:6px;padding:2px 7px}
.tag.us{color:#1d4ed8;background:#e7eefe}.tag.kr{color:#b4531a;background:#fdeede}
.tiles{display:flex;gap:10px;flex-wrap:wrap}
.tile{flex:1;min-width:150px;border-radius:11px;padding:12px 14px;background:#eaf7ef}
.tile .t{font-size:12.5px;color:#5b6470;font-weight:600}
.tile .v{font-size:20px;font-weight:800;margin:2px 0}
.tile .s{font-size:11.5px;color:#8a929d}
.up{color:#12a150}.dn{color:#e5484d}
.sub2{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.sbox{flex:1;min-width:150px;border-radius:11px;padding:12px 14px}
.sbox.g{background:#eaf7ef}.sbox.n{background:#f4f5f7}
.sbox .h{font-weight:800;font-size:13.5px;margin-bottom:6px}
.sbox .l{font-size:13px;line-height:1.65;color:#3a424e}
.note{font-size:12.5px;color:#6b7480;line-height:1.55;margin-top:12px;padding-top:10px;border-top:1px dashed #e2e5ea}
.warn{border:1px solid #f0d38a;background:#fef8e7;border-radius:14px;padding:16px 18px;margin-top:14px}
.warn h2{font-size:16px;font-weight:800;margin-bottom:8px}
.warn .l{font-size:13.5px;line-height:1.7;color:#4a4331}
.pills{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:10px}
.pill{border-radius:9px;padding:7px 12px;font-size:13px;font-weight:700}
.pill.g{background:#eaf7ef;color:#12784a}.pill.r{background:#fdeaeb;color:#c23}.pill.n{background:#f1f3f6;color:#3a424e}
.ktext{font-size:13.5px;line-height:1.7;color:#3a424e}
.two{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}
.two .box{flex:1;min-width:240px;margin-top:0}
.two h2{font-size:15px}.two .l{font-size:13px;line-height:1.65;color:#3a424e}
.ev{margin-top:14px;border:1px solid #e7eaee;border-radius:14px;padding:16px 18px}
.ev h2{font-size:16px;font-weight:800;margin-bottom:10px}
.evrow{display:flex;gap:12px;padding:8px 0;border-top:1px solid #eef1f4}
.evrow:first-of-type{border-top:none}
.evk{flex:none;width:104px;font-weight:800;font-size:12.5px;color:#1d4ed8}
.evb{font-size:12.5px;line-height:1.55;color:#3a424e}
.chk{margin-top:14px;background:#eef4ff;border:1px solid #d3e1ff;border-radius:14px;padding:16px 18px}
.chk h2{font-size:16px;font-weight:800;margin-bottom:10px}
.crow{display:flex;gap:10px;align-items:flex-start;padding:6px 0}
.cn{flex:none;width:22px;height:22px;border-radius:50%;background:#2563eb;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center}
.cb{font-size:13px;line-height:1.5;color:#26303f}.cb b{color:#0f1830}
.foot{margin-top:18px;text-align:center;color:#a4acb6;font-size:11.5px}
b{color:#111}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}b{color:#fff}.box,.ev{border-color:#232b36}.tile,.sbox.g{background:#122a1e}.sbox.n{background:#1a222d}.sbox .l,.ktext,.two .l,.evb,.note{color:#c4ccd6}.tile .t{color:#9aa4b0}.warn{background:#2a2413;border-color:#5c4d1e}.warn .l{color:#e8dcae}.warn .l b{color:#fff}.chk{background:#122036;border-color:#243a5c}.cb{color:#d3ddea}.cb b{color:#fff}.lead{color:#c4ccd6}.lead b{color:#fff}.pill.n{background:#1a222d;color:#c4ccd6}.note{border-color:#232b36}}
</style></head>
<body>
<div class="head"><h1>${esc(d.title || '증시 브리핑')}</h1><div class="src">${esc(d.src || 'VANTOR')} · ${esc(d.date)}</div></div>
${d.lead ? `<div class="lead">${md(d.lead)}</div>` : ''}
${d.us ? `<div class="box"><h2><span class="tag us">US</span> ${esc(d.us.title || '미국장')}</h2>
  <div class="tiles">${tiles(d.us.tiles)}</div>
  ${(d.us.cpu || d.us.quiet) ? `<div class="sub2">
    ${d.us.cpu ? `<div class="sbox g"><div class="h">${esc(d.us.cpuTitle || '🔥 주도')}</div><div class="l">${lines(d.us.cpu)}</div></div>` : ''}
    ${d.us.quiet ? `<div class="sbox n"><div class="h">${esc(d.us.quietTitle || '😐 상대적 약세')}</div><div class="l">${lines(d.us.quiet)}</div></div>` : ''}
  </div>` : ''}
  ${d.us.note ? `<div class="note">${md(d.us.note)}</div>` : ''}</div>` : ''}
${d.core ? `<div class="warn"><h2>⚠️ ${esc(d.core.title || '핵심')}</h2><div class="l">${md(d.core.body)}</div></div>` : ''}
${d.kr ? `<div class="box"><h2><span class="tag kr">KR</span> ${esc(d.kr.title || '국내장')}</h2>
  ${d.kr.pills ? `<div class="pills">${pills(d.kr.pills)}</div>` : ''}
  <div class="ktext">${md(d.kr.text || '')}</div></div>` : ''}
${(d.supply || d.gap) ? `<div class="two">
  ${d.supply ? `<div class="box"><h2>${esc(d.supply.title || '🧱 수급')}</h2><div class="l">${md(d.supply.body)}</div></div>` : ''}
  ${d.gap ? `<div class="box"><h2>${esc(d.gap.title || '🌙 이벤트 갭')} <span class="tag">추가</span></h2><div class="l">${md(d.gap.body)}</div></div>` : ''}
</div>` : ''}
${(d.events && d.events.length) ? `<div class="ev"><h2>📅 오늘 진행되는 이벤트</h2>${evrows(d.events)}</div>` : ''}
${(d.checks && d.checks.length) ? `<div class="chk"><h2>📌 개장 후 확인할 ${d.checks.length}가지</h2>${checks(d.checks)}</div>` : ''}
<div class="foot">${esc(d.foot || 'VANTOR 아침 브리핑 · 교육용 참고 · 투자 판단은 스스로')}</div>
</body></html>`;

const outName = `${d.date}.html`;
fs.writeFileSync(path.join(DIR, outName), html, 'utf8');

// index.json 갱신 (같은 날짜는 교체, 최신순, 최근 30개 유지)
const idxPath = path.join(DIR, 'index.json');
let idx = [];
try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); if (!Array.isArray(idx)) idx = []; } catch (e) {}
idx = idx.filter(x => x.date !== d.date);
idx.unshift({ date: d.date, title: d.title || '증시 브리핑', summary: d.lead || '', html: `briefs/${outName}` });
idx.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
idx = idx.slice(0, 30);
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n', 'utf8');

console.log('built', outName, '· index entries:', idx.length);
