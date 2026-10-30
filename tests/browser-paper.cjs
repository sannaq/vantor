const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      if (!process.env.VANTOR_LIVE) for (const file of ['index.html','app.js','sync-core.js']) {
        await context.route(file === 'index.html' ? 'https://sannaq.github.io/vantor/' :
          new RegExp('/vantor/' + file.replace('.', '\\.') + '(?:\\?|$)'), r => r.fulfill({
          contentType: file.endsWith('.html') ? 'text/html' : 'application/javascript',
          body: fs.readFileSync(path.join(root,file),'utf8') }));
      }
      if (!process.env.VANTOR_LIVE) await context.route(/\/feeds\/paper-(kr|us)\.json/, r => {
        const filename = new URL(r.request().url()).pathname.split('/').pop();
        return r.fulfill({ contentType: 'application/json', body: fs.readFileSync(path.join(root,'feeds',filename),'utf8') });
      });
      await context.route(/discord(?:app)?\.com\/api\/webhooks/,r => r.fulfill({status:204,body:''}));
      await context.addInitScript(() => {
        localStorage.setItem('vtGate','9e56862530fc1c1a6411582d0040cee789b230505f6a8bb78b2fe7b7338f8c04');
        localStorage.setItem('aurTourDone','1');
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('https://sannaq.github.io/vantor/', { waitUntil:'domcontentloaded' });
      await page.getByRole('button',{name:'주식으로 들어가기',exact:true}).click();
      await page.locator('#splash').waitFor({state:'hidden'});
      await page.evaluate(() => showView('reco'));
      await page.getByText('Gemini 무료 API 키 등록 대기', {exact:true}).waitFor({timeout:30000});
      assert((await page.locator('#recoBoard').innerText()).includes('AI·퀀트 모의계좌 · 국내'));
      await page.evaluate(() => _recoSet('m','US'));
      await page.getByText('Gemini 무료 API 키 등록 대기', {exact:true}).waitFor({timeout:30000});
      assert((await page.locator('#recoBoard').innerText()).includes('AI·퀀트 모의계좌 · 미국'));
      assert.deepEqual(errors, []);
      await page.screenshot({path:'/tmp/vantor-paper-'+width+'.png'});
      console.log('PASS: KR/US paper status at width '+width);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
