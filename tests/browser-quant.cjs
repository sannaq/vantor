const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='https://sannaq.github.io/vantor/';
const fixture=m=>({updatedAt:'2026-11-03T09:39:00Z',sourceDate:'20261103',valuationDate:'20261103',status:'waiting_evidence',message:'검토 중 · 자료 부족 종목 보류',filingCoverage:{checked:3,verified:2,officialIr:1,held:1},account:{market:m,mode:'paper',initialCapital:1000,cash:750,equity:1050,peakEquity:1100,costRate:.0015,paused:false,lastDate:'20261103',positions:[{symbol:'TEST',name:'검증 종목',quantity:3,costBasis:90,lastPrice:100,stop:80,target1:110,target:130,heldDays:2,entryDate:'20261102',reviewId:'test-review'}],pending:[{symbol:'NEXT',name:'대기 종목',quantity:1,entry:50,stop:45,reserved:50.075,signalDate:'20261103',reviewExpiresAt:'2026-11-07T02:00:00Z'}],trades:[{symbol:'TEST',name:'검증 종목',date:'20261102',side:'buy',quantity:5,price:89,cost:5,reason:'reviewed_limit_entry'},{symbol:'SOLD',name:'매도 종목',date:'20261103',side:'sell',quantity:2,price:100,cost:.3,pnl:20,reason:'first_target'}],history:[{date:'20261102',equity:1000,cash:800},{date:'20261103',equity:1050,cash:750}]},reviews:[{symbol:'TEST',name:'검증 종목',sourceDate:'20261103',status:'review_pass',entryStatus:'ready',review:{id:'test-review',reason:'<img src=x onerror="window.qtInjected=1"> 원문 그대로',createdAt:'2026-11-03T09:00:00Z'},sources:[{url:'https://example.com/filing',title:'공식 공시',type:'filing',provider:'official_ir'},{url:'javascript:alert(1)',title:'잘못된 주소'}]},{symbol:'RISK',name:'위험 종목',sourceDate:'20261103',status:'risk_hold',review:{reason:'위험 확인'}},{symbol:'NONE',name:'자료 없는 종목',sourceDate:'20261103',status:'waiting_evidence',evidenceReason:'ir_unsupported'}]});
(async()=>{
 const browser=await chromium.launch();
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}});let fail=false,empty=false;
  await context.route('https://sannaq.github.io/vantor/**',async r=>{
   const u=new URL(r.request().url()),rel=decodeURIComponent(u.pathname.slice('/vantor/'.length))||'index.html';
   if(/^feeds\/paper-(kr|us)\.json$/.test(rel)){
    if(fail)return r.fulfill({status:503,body:'unavailable'});
    const j=fixture(rel.includes('-us')?'US':'KR');
    if(empty){for(const k of ['positions','pending','trades','history'])j.account[k]=[];j.reviews=[];j.account.equity=1000;j.account.cash=1000;}
    return r.fulfill({json:j});
   }
   const f=path.resolve(root,rel);if(!f.startsWith(root+path.sep))return r.abort();
   if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({body:fs.readFileSync(f),contentType:rel.endsWith('.html')?'text/html':rel.endsWith('.js')?'application/javascript':rel.endsWith('.css')?'text/css':rel.endsWith('.json')?'application/json':'application/octet-stream'});
   return r.fulfill({status:404,body:''});
  });
  await context.route(/discord(?:app)?\.com\/api\/webhooks/,r=>r.fulfill({status:204,body:''}));
  await context.addInitScript(()=>{localStorage.setItem('vtGate','9e56862530fc1c1a6411582d0040cee789b230505f6a8bb78b2fe7b7338f8c04');localStorage.setItem('aurTourDone','1');localStorage.setItem('aurSeenHelp','1');});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'주식으로 들어가기',exact:true}).click();await page.locator('#splash').waitFor({state:'hidden'});
  if(width>700)await page.locator('#menu a[data-v="quant"]').click();
  else{await page.locator('#tabbar').getByText('더보기',{exact:true}).click();await page.locator('#moreSheet').getByText('퀀트 트레이딩',{exact:true}).click();}
  const board=page.locator('#quantBoard');await board.getByText('총 평가액',{exact:true}).waitFor();
  assert.equal(await page.locator('#menu a[data-v="watch"] + a').getAttribute('data-v'),'quant');
  assert((await board.innerText()).includes('₩1,050'));assert((await board.innerText()).includes('₩50 / 5.00%'));
  const metrics=board.locator('.qt-grid');assert((await metrics.innerText()).includes('₩30'));assert((await metrics.innerText()).includes('₩20'));
  assert((await board.innerText()).includes('18:39:00'));assert.equal(await board.locator('svg circle').count(),2);
  await board.locator('[data-qt-tab="positions"]').click();assert((await board.innerText()).includes('28.57%'));assert((await board.innerText()).includes('₩90'));
  var row=board.locator('tbody tr').first();
  assert((await row.innerText()).includes('매수가 ₩89 × 5주'));assert((await row.innerText()).includes('매수 금액 ₩445'));assert((await row.innerText()).includes('총 차감 ₩450'));assert.equal(await row.locator('td').nth(1).innerText(),'3주');
  assert.equal(await page.evaluate(()=>quantPurchase({trades:[{side:'buy',symbol:'X',date:'20260101',quantity:5,price:80,cost:1}]},{symbol:'X',entryDate:'20261102'})),null,'previous holding cycle must not supply purchase price');
  assert((await row.innerText()).includes('수익'));assert((await row.innerText()).includes('+₩30'));assert((await row.innerText()).includes('+11.11%'));assert((await row.innerText()).includes('+₩10'));
  await page.evaluate(()=>{_quantData.KR.account.positions[0].lastPrice=80;renderQuant();});
  assert((await row.innerText()).includes('손실'));assert((await row.innerText()).includes('−₩30'));assert((await row.innerText()).includes('−11.11%'));assert((await row.innerText()).includes('−₩10'));assert.equal(await row.locator('.qt-loss').count(),4);
  await page.screenshot({path:'/tmp/vantor-quant-pnl-'+width+'.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(()=>{_quantData.KR.account.positions[0].lastPrice=90;renderQuant();});assert((await row.innerText()).includes('보합'));assert((await row.innerText()).includes('0.00%'));
  await page.evaluate(()=>{_quantData.KR.account.positions[0].lastPrice=100;renderQuant();});
  await board.locator('[data-qt-tab="orders"]').click();assert((await board.innerText()).includes('대기 종목'));assert((await board.innerText()).includes('11:00:00'));
  await board.locator('[data-qt-tab="trades"]').click();assert((await board.innerText()).includes('1차 목표가 분할 매도'));
  await board.locator('[data-qt-tab="reviews"]').click();assert((await board.locator('.qt-review-summary').innerText()).includes('모의매수 1건 · 주문 대기 0건 · 미매수 2건'));assert(await board.locator('.qt-review-excerpt').first().isVisible());await board.locator('[data-qt-filter="pass"]').click();assert.equal(await board.locator('details').count(),1);await board.locator('summary').click();
  assert((await board.innerText()).includes('₩89 × 5주'));assert((await board.innerText()).includes('현재 3주 보유'));assert((await board.innerText()).includes('<img src=x'));assert.equal(await board.locator('img').count(),0);assert.equal(await board.locator('a').count(),1);assert.equal(await page.evaluate(()=>window.qtInjected),undefined);
  await page.screenshot({path:'/tmp/vantor-quant-review-'+width+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await board.locator('[data-qt-filter="evidence"]').click();assert((await board.innerText()).includes('자료 없는 종목'));assert.equal(await board.locator('details').count(),1);
  await board.locator('[data-qt-market="US"]').click();await board.locator('[data-qt-tab="overview"]').waitFor();await board.locator('[data-qt-tab="overview"]').click();assert((await board.innerText()).includes('$1,050'));
  await board.locator('[data-qt-tab="positions"]').click();assert((await board.locator('tbody').innerText()).includes('+$10'));assert((await board.locator('tbody').innerText()).includes('+11.11%'));await board.locator('[data-qt-tab="overview"]').click();
  await page.screenshot({path:'/tmp/vantor-quant-'+width+'.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'page must not overflow horizontally');
  fail=true;await board.locator('[data-qt-refresh]').click();await board.getByRole('alert').waitFor();assert((await board.innerText()).includes('$1,050'),'failed refresh keeps last good snapshot');
  fail=false;empty=true;await board.locator('[data-qt-refresh]').click();await board.getByText('평가 기록이 쌓이면 수익 추이가 표시돼요.',{exact:true}).waitFor();
  for(const [tab,msg] of [['positions','현재 보유 종목이 없어요.'],['orders','대기 중인 모의주문이 없어요.'],['trades','아직 모의 체결 기록이 없어요.'],['reviews','해당 검토 이력이 없어요.']]){await board.locator('[data-qt-tab="'+tab+'"]').click();assert((await board.innerText()).includes(msg));}
  fail=true;await page.evaluate(()=>{_quantData={};_quantError={};renderQuant();});await board.getByRole('alert').waitFor();assert.equal(await board.locator('.qt-grid').count(),0);
  fail=false;empty=false;await board.locator('[data-qt-refresh]').click();await board.locator('[data-qt-tab="overview"]').waitFor();
  await page.goto(base+'#quant',{waitUntil:'domcontentloaded'});await page.reload({waitUntil:'domcontentloaded'});await page.locator('#v-quant.on .qt-grid').waitFor();assert.equal(await page.locator('#splash').isVisible(),false,'direct link opens stock quant screen');
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await page.screenshot({path:'/tmp/vantor-quant-dark-'+width+'.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: navigation, account arithmetic, KST, all tabs, safe sources, refresh recovery and empty states at '+width);await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
