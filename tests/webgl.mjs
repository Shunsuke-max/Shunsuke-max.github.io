import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
await mkdir('artifacts/screenshots',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Real, pinned library builds served locally for reproducible testing.
  await page.route('https://cdn.jsdelivr.net/npm/3dmol@2.5.5/**',async route=>{
    await route.fulfill({path:resolve('node_modules/3dmol/build/3Dmol-min.js'),contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/build/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop();
    assert.match(name,/^three[.\w-]+\.js$/);
    await route.fulfill({path:resolve('node_modules/three/build',name),contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}});
  });
  await page.route('https://files.rcsb.org/download/*.pdb',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop();
    assert.match(name,/^[A-Z0-9]{4}\.pdb$/);
    const text=await readFile(resolve('/tmp/curiosity-pdb',name),'utf8');
    assert.match(text,/^ATOM  /m);
    await route.fulfill({body:text,contentType:'text/plain',headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#design').dataset.designSource==='1CRN'&&document.querySelector('#design').classList.contains('design-gl'),{},{timeout:30000});
  for(let n=0;n<5;n++){
    if(n)await page.locator('[data-design-jump="'+n+'"]').click();
    await page.waitForFunction(n=>document.querySelector('#design').dataset.designStep===String(n),n);
    await page.waitForTimeout(200);
    if(n===3)assert.equal(await page.locator('#designSequence .on').count(),46);
    await page.locator('#design').screenshot({path:'artifacts/screenshots/design-0'+(n+1)+'.png'});
  }
  await page.locator('#scaleJourney').evaluate(el=>el.scrollIntoView({behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelector('#protein').classList.contains('depth-ready'),{},{timeout:30000});
  const stage=page.locator('#protein');
  await stage.screenshot({path:'artifacts/screenshots/01-blood.png'});
  await page.locator('#scaleNext').click();
  await page.waitForFunction(()=>document.querySelector('#protein').dataset.scene==='1');
  await page.waitForTimeout(350);
  await stage.screenshot({path:'artifacts/screenshots/02-cell.png'});
  await page.locator('#scaleNext').click();
  await page.waitForFunction(()=>document.querySelector('#protein').dataset.scene==='2'&&document.querySelector('#molStatus').hidden&&document.querySelector('#molHost canvas')?.width>0,{},{timeout:30000});
  await stage.screenshot({path:'artifacts/screenshots/03-protein.png'});
  await page.locator('#scaleNext').click();
  await page.waitForFunction(()=>document.querySelector('#protein').dataset.scene==='3'&&document.querySelector('#protein').dataset.hemeFocus==='true');
  await page.waitForTimeout(350);
  await stage.screenshot({path:'artifacts/screenshots/04-heme.png'});
  assert.equal(await page.locator('#protein').getAttribute('data-heme-focus'),'true');
  await page.locator('#scaleNext').click();
  await page.waitForFunction(()=>document.querySelector('#protein').dataset.scene==='4');
  await page.locator('[data-style="stick"]').click();
  assert.equal(await page.locator('[data-style="stick"]').getAttribute('aria-pressed'),'true');
  await page.locator('#molSelect').selectOption('1UBQ');
  await page.waitForFunction(()=>document.querySelector('#molStatus').hidden&&document.querySelector('#molMeta').textContent.includes('1UBQ'));
  await page.locator('[data-style="cartoon"]').click();
  await page.locator('#molReset').click();
  await stage.screenshot({path:'artifacts/screenshots/05-explore.png'});
  assert.deepEqual(errors,[]);
  console.log('Real libraries + RCSB PDB data: WebGL scene navigation and molecular controls passed');
} finally {await browser.close();}
