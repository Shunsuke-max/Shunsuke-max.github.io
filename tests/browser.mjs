import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const page=await browser.newPage({viewport,reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    // Simulate the CDN being unavailable: offline fallback and project UI must still work.
    await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
    await page.route('https://files.rcsb.org/**',route=>route.abort());
    await page.route('https://raw.githubusercontent.com/**',route=>route.fulfill({status:404,body:''}));
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#design').dataset.designSource==='schematic');
    await page.locator('[data-design-jump="2"]').click();
    await page.waitForFunction(()=>document.querySelector('#design').dataset.designStep==='2');
    assert.equal(await page.locator('#design').getAttribute('data-graph-source'),'unavailable');
    assert.equal(await page.locator('#design').getAttribute('data-graph-neighbor-count'),'0');
    assert.equal(await page.locator('#designGraphMetrics').isVisible(),false);
    await page.locator('[data-design-jump="3"]').click();
    await page.waitForFunction(()=>document.querySelector('#design').dataset.designStep==='3');
    assert.match(await page.locator('#designSequenceLabel').innerText(),/取得できませんでした/);
    await page.locator('[data-aa-choice="V"]').click();
    assert.equal(await page.locator('#design').getAttribute('data-aa-choice'),'V');
    assert.match(await page.locator('#designChoiceNote').innerText(),/バリン/);
    await page.locator('#designNext').click();
    await page.waitForFunction(()=>document.querySelector('#design').dataset.designStep==='4');
    await page.locator('[data-compare="different"]').click();
    assert.equal(await page.locator('#design').getAttribute('data-compare'),'different');
    await page.locator('#scaleJourney').evaluate(el=>el.scrollIntoView({behavior:'instant'}));
    await page.waitForFunction(()=>document.querySelector('#protein').dataset.scene==='0');
    await page.locator('#scaleNext').click();
    await page.waitForFunction(()=>document.querySelector('#protein').dataset.scene==='1');
    await page.locator('#scaleSkip').click();
    await page.waitForFunction(()=>document.querySelector('#protein').dataset.scene==='4');
    await page.locator('#molRetry').waitFor({state:'visible'});
    await page.locator('#molStatus').waitFor({state:'visible'});
    await page.locator('#work-foldlens').scrollIntoViewIfNeeded();
    await page.locator('[data-gallery="fold"][data-index="2"]').click();
    assert.match(await page.locator('#foldCaption').innerText(),/3鎖/);
    await page.locator('[data-frame="5"]').click();
    assert.equal(await page.locator('#ensembleContacts').innerText(),'110 ペア');
    await page.locator('[data-gallery="part"][data-index="3"]').click();
    assert.equal(await page.locator('#partTitle').innerText(),'解いて終わらない');
    await page.locator('[data-phase-button="3"]').click();
    assert.match(await page.locator('#phaseText').innerText(),/AlphaFold 3/);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
    assert.equal(overflow,false,'horizontal overflow at '+viewport.width);
    assert.deepEqual(errors,[]);
    await page.close();
    console.log('Browser fallback and interaction tests passed:',viewport);
  }
}finally{await browser.close();}
