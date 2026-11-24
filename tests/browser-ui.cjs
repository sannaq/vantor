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

 // Patrol regressions: source dates, missing integrations, mobile duplication and coin mode.
 const dated=await page.evaluate(()=>{
   var cal={weeks:[{from:'2026-11-23',to:'2026-11-29',days:{'2026-11-23':[{t:'새벽 발언',sub:'한국시간 11/24 06:00'}],'2026-11-24':[{t:'내일 발표',sub:'한국시간 11/25 00:00'},{t:'국내 실적 테스트'},{t:'미국 실적 미정'}]}}]};
   return {html:uiTodayEvents(cal,'2026-11-24'),year:uiEventDay({sub:'한국시간 1/1 02:00'},'2026-12-31'),flow:flowTabReal({foreign:1,inst:2,investDate:'20261123'}),unknown:uiFlowDate({}),stale:uiAccountHealth({valuationDate:'20261120',sourceDate:'20261123'},{date:'20261123'}),current:uiAccountHealth({valuationDate:'20261120',sourceDate:'20261120'},{date:'20261120'})};
 });
 assert(dated.html.includes('새벽 발언'));assert(!dated.html.includes('내일 발표'));assert(dated.html.includes('한국시간 미확인'));assert.equal(dated.year.date,'2027-01-01');assert(dated.flow.includes('2026-11-23 기준'));assert(!dated.flow.includes('당일 누적'));assert.equal(dated.unknown,'기준일 미확인');assert.equal(dated.stale.label,'갱신 지연');assert.equal(dated.current.label,'정상');
 await context.route('**/feeds/automation-health.json',r=>r.fulfill({json:{checkedAt:new Date().toISOString(),failureAlertConfigured:false}}));
 await page.evaluate(()=>uiRefreshHealth());assert((await page.locator('#uiHealth summary').innerText()).includes('실패 알림 미연결'));
 await page.evaluate(()=>showView('home'));await page.locator('.ui-home-accounts').waitFor();
 if(width<700){assert(await page.locator('#glance .ga-grid').isHidden());await page.locator('.ui-shortcuts summary').click();assert(await page.locator('#glance .ga-grid').isVisible());await page.locator('.ui-shortcuts [data-gv="events"]').click();assert(await page.locator('#v-events').isVisible());}
 await page.evaluate(()=>{setMode('coin');window._uiCoinRows=[{s:'BTC',px:90000,ch:1.25},{s:'ETH',px:3000,ch:-2},{s:'SOL',px:150,ch:0}];window._uiCoinAt=Date.now();uiCoinBar();});
 assert((await page.locator('#idxbar').innerText()).includes('BTC'));assert(!(await page.locator('#idxbar').innerText()).includes('KOSPI'));assert(await page.locator('#uiHealth').isHidden());
 await page.locator('#idxbar').click();assert(await page.locator('#v-coin').isVisible());
 await page.evaluate(()=>{window._uiCoinAt=Date.now()-180000;uiCoinBar();});assert((await page.locator('#idxbar').innerText()).includes('시세 연결 확인 중'));
 await page.evaluate(()=>setMode('stock'));assert((await page.locator('#idxbar').innerText()).includes('KOSPI'));assert(await page.locator('#uiHealth').isVisible());

 await page.evaluate(()=>openStock('005930'));await page.waitForFunction(()=>document.querySelector('#vscore')?.textContent.includes('네이버 증권'));
 assert(!(await page.locator('#stab-flow').innerText()).includes('억원·데모'));assert.equal((await page.locator('#m-mcap .v').innerText()).trim(),'—');for(const id of ['m-str','m-bid','m-prog','m-inv'])assert.equal((await page.locator('#'+id+' .v').innerText()).trim(),'—');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'/tmp/vantor-fix-stock-'+width+'.png',fullPage:true});
 await context.route('**/flow?mkt=KR&code=005930',r=>r.fulfill({json:{investDate:'20261123',foreign:100,inst:50,retail:-150,progNet:0,progDate:'20261123'}}));
 await page.evaluate(()=>liveRefresh(SEL));await page.waitForFunction(()=>document.querySelector('#stab-flow tbody tr'));
 assert((await page.locator('#stab-flow').innerText()).includes('2026-11-23 기준'));assert.equal((await page.locator('#m-prog .v').innerText()).trim(),'+0');
 await page.evaluate(()=>applyStockFlow(SEL,{}));assert.equal((await page.locator('#m-prog .v').innerText()).trim(),'—');assert((await page.locator('#stab-flow').innerText()).includes('자료 미제공'));

 assert.deepEqual(errors,[]);console.log('PASS: hierarchy, mobile picks, turnover, events, briefing, colors and inbox at '+width);await context.close();
 }}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
