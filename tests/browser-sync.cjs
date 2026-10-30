/* Uses isolated browser storage and an in-memory sync worker; never sends Discord messages. */
const {chromium,devices}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch();let store={},failParts=false,delayParts=0,posts=[];const pages=[];
try{
for(let i=0;i<2;i++){
 const ctx=await browser.newContext(i?devices['iPhone 13']:{viewport:{width:1440,height:1000}});
 if(!process.env.VANTOR_LIVE)for(const file of ['index.html','app.js','sync-core.js'])await ctx.route(file==='index.html'?'https://sannaq.github.io/vantor/':new RegExp('/vantor/'+file.replace('.','\\.')+'(?:\\?|$)'),r=>r.fulfill({contentType:file.endsWith('.html')?'text/html':'application/javascript',body:fs.readFileSync(path.join(root,file),'utf8')}));
 await ctx.route(/discord(?:app)?\.com\/api\/webhooks/,r=>r.fulfill({status:204,body:''}));
 await ctx.route('**/sync?*',async r=>{const key=new URL(r.request().url()).searchParams.get('key');if(r.request().method()==='POST'){
  const body=r.request().postDataJSON();posts.push({key,body});if(body.parts){if(delayParts)await new Promise(resolve=>setTimeout(resolve,delayParts));if(failParts)return r.fulfill({status:503,json:{ok:false,error:'test chunk failure'}});}
  assert(Buffer.byteLength(JSON.stringify(body))<=300000);store[key]=body;return r.fulfill({json:{ok:true,ts:Date.now()}});
 }return r.fulfill({json:store[key]?{ok:true,found:true,data:store[key]}:{ok:true,found:false}});});
 const p=await ctx.newPage();await p.addInitScript(()=>localStorage.setItem('vtGate','9e56862530fc1c1a6411582d0040cee789b230505f6a8bb78b2fe7b7338f8c04'));await p.goto('https://sannaq.github.io/vantor/',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>typeof VantorSync==='object');pages.push(p);
}
const [pc,phone]=pages,code='VANTOR-TEST-TEST-TEST';
const init=async p=>p.evaluate(code=>{_SYNC_KEYS.forEach(k=>localStorage.removeItem(k));localStorage.setItem('aurSyncCode',code);_syncRemember(code,{});},code);
await init(pc);await init(phone);
const put=async(p,id)=>p.evaluate(id=>{var l=_huntLogs();l.push({s:id,at:Date.now(),p0:100,tp:200,sl:50,side:'long'});_huntLogSave(l);},id);
const sync=p=>p.evaluate(()=>syncPush());
await put(phone,'PHONE1');assert((await sync(phone)).ok);assert((await sync(pc)).ok);
await put(phone,'PHONE2');assert((await sync(phone)).ok);await put(pc,'PC1');const before=posts.length;
await pc.evaluate(()=>window.dispatchEvent(new Event('beforeunload')));await pc.waitForTimeout(100);
assert.equal(posts.length,before,'closing must never overwrite the server');assert(JSON.parse(store[code].data.huntLog).some(x=>x.s==='PHONE2'));
assert((await sync(pc)).ok);assert.equal(JSON.parse(store[code].data.huntLog).length,3,'durable pending edit must merge on resume');console.log('PASS: two-device merge and closing/resuming preserve all records');
const value=JSON.stringify(Array.from({length:55000},()=>({x:1,text:'한글😀'})));
await pc.evaluate(v=>localStorage.setItem('aurDraw',v),value);delayParts=80;posts=[];assert((await sync(pc)).ok);assert(posts.at(-1).key===code,'manifest must be the final write');
const pulled=await phone.evaluate(code=>syncPullAll(code),code);assert(pulled.ok);assert.equal(pulled.data.data.aurDraw,value);console.log('PASS: escaped Unicode settings round-trip, callback waits for all chunks');
assert((await sync(phone)).ok);assert.equal(await phone.evaluate(()=>localStorage.getItem('aurDraw')),value,'stale device must receive remote large settings');console.log('PASS: stale device preserves remote settings');
delayParts=0;const previous=JSON.stringify(store[code]);failParts=true;await pc.evaluate(()=>localStorage.setItem('aurDraw','changed'+localStorage.getItem('aurDraw')));assert.equal((await sync(pc)).ok,false);assert.equal(JSON.stringify(store[code]),previous,'failed upload must preserve old manifest');failParts=false;console.log('PASS: failed chunk upload leaves previous cloud data intact');
assert((await sync(pc)).ok);let ref=store[code].data._chunks[0];let saved=store[ref.key];delete store[ref.key];const bad=await phone.evaluate(code=>syncPullAll(code),code);assert.equal(bad.ok,false);assert(!bad.data,'partial settings cannot be applied');store[ref.key]=saved;console.log('PASS: incomplete download fails instead of claiming success');
const oldHash=store[code].data._chunks[0].hash;await pc.evaluate(()=>{const s=localStorage.getItem('aurDraw');localStorage.setItem('aurDraw','X'+s.slice(1));});assert((await sync(pc)).ok);assert.notEqual(store[code].data._chunks[0].hash,oldHash);console.log('PASS: one-character edit changes chunk identity');
for(const p of pages)await p.evaluate(()=>localStorage.removeItem('aurSyncCode'));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
