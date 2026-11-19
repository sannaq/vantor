const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='https://sannaq.github.io/vantor/';
(async()=>{const browser=await chromium.launch();try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000}});
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='https://sannaq.github.io')return r.abort();const rel=decodeURIComponent(u.pathname.slice('/vantor/'.length))||'index.html',f=path.resolve(root,rel);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return r.fulfill({status:404,body:''});return r.fulfill({body:fs.readFileSync(f),contentType:rel.endsWith('.html')?'text/html':rel.endsWith('.js')?'application/javascript':rel.endsWith('.css')?'text/css':rel.endsWith('.json')?'application/json':'application/octet-stream'});});
 await context.addInitScript(()=>{localStorage.setItem('vtGate','9e56862530fc1c1a6411582d0040cee789b230505f6a8bb78b2fe7b7338f8c04');localStorage.setItem('aurTourDone','1');localStorage.setItem('aurSeenHelp','1');});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('button',{name:'주식으로 들어가기',exact:true}).click();await page.locator('#splash').waitFor({state:'hidden'});
 await page.locator('.ui-home-accounts').waitFor();await page.evaluate(()=>mfApply());
 assert(await page.locator('.ui-market-summary').isVisible());if(width>700)assert(await page.locator('#glance .ga-grid').isHidden());assert.equal(await page.locator('#glance .ga-reco .ga-r:visible').count(),6);
 const positions=await page.evaluate(()=>['.ga-sum','.ga-reco','.ui-home-accounts'].map(s=>document.querySelector('#glance '+s).getBoundingClientRect().top));assert(positions[0]<positions[1]&&positions[1]<positions[2]);
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:'/tmp/vantor-ui-home-'+width+'-'+theme+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.locator('#glance .ga-h[data-gus]').click();await page.waitForFunction(()=>_PK.US&&document.querySelector('.ld-item'));await page.evaluate(()=>mfApply());
 assert.equal(await page.evaluate(()=>_recoF.m),'US');assert((await page.locator('#recoBoard .card').first().innerText()).includes('종목 추천'));assert(await page.locator('.ld-tv').first().isVisible());assert(!(await page.locator('.ld-tv').first().innerText()).includes('자료 없음'));
 if(width<700){assert.equal(await page.locator('.ld-item:visible').count(),3);await page.locator('.ui-more-reco').click();assert(await page.locator('.ld-item:visible').count()>3);await page.locator('.ui-more-reco').click();assert.equal(await page.locator('.ld-item:visible').count(),3);}
 await page.screenshot({path:'/tmp/vantor-ui-reco-'+width+'.png',fullPage:true});
 await page.evaluate(()=>showView('events'));await page.locator('.ui-today').waitFor();await page.evaluate(()=>mfApply());assert(await page.locator('.ui-today .pad').isVisible());
 // Deterministic today summary: missing date differs from an empty but covered date.
 const cases=await page.evaluate(()=>[uiTodayEvents({weeks:[]},'2026-11-19'),uiTodayEvents({weeks:[{from:'2026-11-16',to:'2026-11-22',days:{}}]},'2026-11-19')]);assert(cases[0].includes('자료가 아직 없어요'));assert(cases[1].includes('등록된 오늘 일정이 없어요'));
 await page.evaluate(()=>showView('brief'));await page.waitForFunction(()=>document.querySelector('#briefPanel .card'));await page.evaluate(()=>mfApply());
 if(width<700){await page.locator('.ui-brief-preview').first().waitFor();assert(await page.locator('.ui-brief-preview').first().isVisible());const style=await page.locator('.ui-brief-preview').first().evaluate(e=>({whiteSpace:getComputedStyle(e).whiteSpace,height:e.getBoundingClientRect().height}));assert.equal(style.whiteSpace,'pre-line');assert(style.height>30);}
 assert.deepEqual(await page.evaluate(()=>['-2.5%','−1.2%','5,000 (+2.1%)','123'].map(uiSign)),['down','down','up','flat']);
 const tile=await page.evaluate(()=>_briefHTML({us:{tiles:[{t:'하락 검사',v:'-2.5%'}]}}));assert(tile.includes('class="v down"'));
 await page.evaluate(()=>{document.querySelector('#briefPanel .pad').insertAdjacentHTML('beforeend',_briefHTML({lead:'색상 확인',us:{tiles:[{t:'하락 검사',v:'-2.5%'}]}}));});
 assert(await page.locator('#briefPanel .tile .v.down').last().evaluate(e=>getComputedStyle(e).color===getComputedStyle(document.querySelector('.down')).color));
 await page.evaluate(()=>uiNotice('<img src=x onerror=alert(1)> 알림 검사','TEST'));await page.locator('#uiNoticeButton').click();assert(await page.locator('#uiNoticePanel').isVisible());assert.equal(await page.locator('#uiNoticeList img').count(),0);assert((await page.locator('#uiNoticeList').innerText()).includes('알림 검사'));await page.keyboard.press('Escape');assert(await page.locator('#uiNoticePanel').isHidden());
 await page.locator('#uiNoticeButton').click();await page.locator('#briefPanel h2').first().click();assert(await page.locator('#uiNoticePanel').isHidden());
 assert.deepEqual(errors,[]);console.log('PASS: hierarchy, mobile picks, turnover, events, briefing, colors and inbox at '+width);await context.close();
 }}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
