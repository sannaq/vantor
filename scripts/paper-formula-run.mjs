import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {candles} from './paper-data.mjs';
import {runFormulaExperiment} from './paper-formulas.mjs';
const dest=fileURLToPath(new URL('../feeds/formula-paper-us.json',import.meta.url));
let original=null;
try{original=JSON.parse(fs.readFileSync(dest,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const cache=new Map();
const load=(m,c)=>{if(!cache.has(c))cache.set(c,candles(m,c));return cache.get(c);};
try{
  const scores=JSON.parse(fs.readFileSync(new URL('../feeds/stock-scores-us.json',import.meta.url),'utf8'));
  const next=await runFormulaExperiment(original,scores,load);
  fs.writeFileSync(dest+'.tmp',JSON.stringify(next));fs.renameSync(dest+'.tmp',dest);
  console.log('미장 공식 비교:',next.status,next.valuationDate,next.accounts.map(r=>r.name+' 보유 '+r.account.positions.length+' / 대기 '+r.account.pending.length).join(', '));
  if(next.status!=='ready')process.exitCode=1;
}catch(e){
  // Preserve all account data on error; expose failure separately from last success.
  if(original){original.status='update_failed';original.lastErrorAt=new Date().toISOString();original.error=String(e.message).slice(0,120);fs.writeFileSync(dest+'.tmp',JSON.stringify(original));fs.renameSync(dest+'.tmp',dest);}
  console.error('공식 비교 갱신 실패:',e.message);process.exitCode=1;
}
