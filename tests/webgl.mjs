import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {verifyReferenceGeometry} from './geometry-reference.mjs';
await verifyReferenceGeometry();
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
    if(n===1){await page.waitForFunction(()=>document.querySelector('#design').dataset.ribbonVisible==='true');assert.ok(Number(await page.locator('#design').getAttribute('data-secondary-count'))>0);const stage=page.locator('#design');const all=Number(await stage.getAttribute('data-atomic-count')),local=Number(await stage.getAttribute('data-atomic-visible-count'));assert.ok(all>250&&local>15&&local<all);assert.match(await page.locator('#designAtomicFocus').innerText(),/S–S/);await page.locator('[data-atomic-mode="all"]').click();assert.equal(await stage.getAttribute('data-atomic-visible-count'),String(all));await page.waitForTimeout(150);await stage.screenshot({path:'artifacts/screenshots/design-02-all-atoms.png'});await page.locator('[data-atomic-mode="local"]').click();assert.equal(await stage.getAttribute('data-atomic-visible-count'),String(local));}
    if(n===2){const stage=page.locator('#design');await page.waitForFunction(()=>document.querySelector('#design').dataset.graphSource==='1CRN');assert.equal(await stage.getAttribute('data-graph-neighbor-count'),'6');assert.equal(await stage.getAttribute('data-graph-focus'),'4');assert.equal(await stage.getAttribute('data-graph-pair'),'32');assert.equal(await page.locator('#designGraphDistance').innerText(),'4.09 Å');assert.equal(await page.locator('#designGraphSeparation').innerText(),'28');assert.equal(await page.locator('#designGraphNeighbors').innerText(),'P5 · C3 · C32 · N46 · Y44 · R10');await page.locator('#designGraphLabels').waitFor({state:'visible'});const boxes=await Promise.all(['#designGraphFocusLabel','#designGraphPairLabel'].map(id=>page.locator(id).boundingBox()));assert.ok(boxes.every(b=>b&&b.x>=0&&b.y>=0&&b.x+b.width<=1440&&b.y+b.height<=900));assert.ok(boxes[0].x+boxes[0].width<=boxes[1].x||boxes[1].x+boxes[1].width<=boxes[0].x||boxes[0].y+boxes[0].height<=boxes[1].y||boxes[1].y+boxes[1].height<=boxes[0].y,'graph labels must not overlap');}
    if(n===2){
      const stage=page.locator('#design');
      const copy=await page.locator('.design-copy').boundingBox(),panel=await page.locator('#designGraphPanel').boundingBox();assert.ok(copy.y+copy.height<=panel.y+1,'graph copy and controls must not overlap');
      await stage.screenshot({path:'artifacts/screenshots/graph-initial.png'});
      const sb=await stage.boundingBox(),pairScreen=JSON.parse(await stage.getAttribute('data-graph-pair-screen'));await page.mouse.click(sb.x+pairScreen[0],sb.y+pairScreen[1]);assert.equal(await stage.getAttribute('data-graph-focus'),'32');
      await page.locator('#designGraphSequence button[data-residue="3"]').click();assert.equal(await stage.getAttribute('data-graph-focus'),'4');await page.locator('#designGraphReset').click();
      await page.locator('#designGraphK').fill('2');assert.equal(await stage.getAttribute('data-graph-neighbor-count'),'2');assert.equal(await stage.getAttribute('data-graph-pair-neighbor'),'false');assert.equal(await page.locator('#designGraphDistance').innerText(),'4.09 Å');
      await page.locator('[data-matrix-mode="dist"]').click();assert.equal(await page.locator('#designMatrixCanvas').getAttribute('data-mode'),'dist');
      await page.locator('#designGraphFocusSelect').selectOption('8');assert.equal(await stage.getAttribute('data-graph-focus'),'9');
      await page.locator('#designMatrixCanvas').focus();await page.keyboard.press('ArrowDown');assert.equal(await stage.getAttribute('data-graph-focus'),'10');
      const matrix=page.locator('#designMatrixCanvas'),mb=await matrix.boundingBox();await matrix.click({position:{x:(30+11.5*6)/320*mb.width,y:(30+7.5*6)/320*mb.height}});assert.equal(await stage.getAttribute('data-graph-focus'),'8');assert.equal(await stage.getAttribute('data-graph-pair'),'12');
      await page.locator('#designGraphPairSelect').selectOption('7');assert.equal(await stage.getAttribute('data-graph-pair'),'8');assert.equal(await stage.getAttribute('data-graph-pair-neighbor'),'false');assert.equal(await page.locator('#designGraphDistance').innerText(),'0.00 Å');await page.locator('#designGraphPairSelect').selectOption('11');
      const hit=page.locator('#designGraphHit'),hb=await hit.boundingBox();const yaw=await stage.getAttribute('data-graph-yaw');await page.mouse.move(hb.x+hb.width*.5,hb.y+hb.height*.45);await page.mouse.down();await page.mouse.move(hb.x+hb.width*.5+36,hb.y+hb.height*.45+8,{steps:5});await page.mouse.up();await page.waitForFunction(y=>document.querySelector('#design').dataset.graphYaw!==y,yaw);assert.equal(await stage.getAttribute('data-graph-focus'),'8');
      await page.locator('#designGraphDetailOpen').click();await page.locator('#designGraphDetail').waitFor({state:'visible'});assert.equal(await page.locator('#designGraphAtomTable td button').count(),25);assert.equal(await page.locator('#designGraphRbf span').count(),16);await page.screenshot({path:'artifacts/screenshots/graph-edge-features.png'});await page.locator('#designGraphDetailClose').click();
      await page.locator('#designGraphMessage').click();assert.equal(await page.locator('#designGraphMessage').getAttribute('aria-pressed'),'true');await page.waitForTimeout(100);await stage.screenshot({path:'artifacts/screenshots/graph-message.png'});
      await page.locator('#designGraphReset').click();assert.equal(await stage.getAttribute('data-graph-focus'),'4');assert.equal(await stage.getAttribute('data-graph-neighbor-count'),'6');
      await page.locator('#designGraphFocusSelect').selectOption('8');
    }
    if(n===3){assert.equal(await page.locator('#design').getAttribute('data-sequence-focus'),'9');assert.equal(await page.locator('#designSequence .on').count(),46);await page.locator('[data-aa-choice="S"]').click();assert.match(await page.locator('#designChoiceNote').innerText(),/セリン/);}
    if(n===3){await page.locator('[data-design-jump="2"]').click();await page.waitForFunction(()=>document.querySelector('#design').dataset.designStep==='2');await page.locator('#designGraphReset').click();await page.locator('[data-design-jump="3"]').click();await page.waitForFunction(()=>document.querySelector('#design').dataset.designStep==='3');}
    if(n===4){await page.waitForFunction(()=>document.querySelector('#design').dataset.ribbonVisible==='true');await page.locator('[data-compare="different"]').click();assert.equal(await page.locator('#design').getAttribute('data-compare'),'different');await page.waitForTimeout(150);await page.locator('#design').screenshot({path:'artifacts/screenshots/design-05-different.png'});await page.locator('[data-compare="close"]').click();}
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
  // Capture the actual scroll transition with motion enabled, then mobile composition.
  await page.emulateMedia({reducedMotion:'no-preference'});
  async function goDesign(p){
    await page.evaluate(p=>{const story=document.getElementById('designJourney'),stage=document.getElementById('design');const top=scrollY+story.getBoundingClientRect().top;scrollTo({top:top+(story.offsetHeight-stage.offsetHeight)*p,behavior:'instant'});},p);
    await page.waitForFunction(n=>Number(document.querySelector('#design').dataset.designStep)===n,Math.min(4,Math.floor(p*5)));
    await page.waitForTimeout(250);
    assert.ok(await page.locator('#design').evaluate(e=>e.classList.contains('design-gl')));
  }
  for(const [name,p] of [['noise',.02],['diffusion-mid',.11],['ribbon-transition',.27],['ribbon-final',.36],['graph',.50]]){
    await goDesign(p);await page.locator('#design').screenshot({path:'artifacts/screenshots/motion-'+name+'.png'});
  }
  await page.setViewportSize({width:390,height:844});
  for(const [name,p] of [['intro',.02],['ribbon',.36],['graph',.50],['sequence',.76],['compare',.92]]){
    await goDesign(p);await page.locator('#design').screenshot({path:'artifacts/screenshots/mobile-'+name+'.png'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
    if(name==='graph'){await page.locator('#designGraphMatrixOpen').click();await page.locator('#designGraphMatrix').waitFor({state:'visible'});const ms=await page.locator('#designGraphMatrix').evaluate(el=>{const s=getComputedStyle(el);return {opacity:s.opacity,background:s.backgroundColor,animation:s.animationName}});assert.equal(ms.opacity,'1');assert.equal(ms.background,'rgb(13, 29, 38)');assert.equal(ms.animation,'none');await page.locator('#design').screenshot({path:'artifacts/screenshots/mobile-graph-matrix.png'});await page.locator('#designGraphMatrixClose').click();await page.locator('#designGraphMatrix').waitFor({state:'hidden'});}
    if(name==='graph'||name==='ribbon'||name==='sequence'||name==='compare'){const panel=page.locator(name==='graph'?'#designGraphPanel':name==='ribbon'?'#designAtomicPanel':name==='sequence'?'#designSequencePanel':'#designEvaluate');const a=await panel.boundingBox(),b=await page.locator('.design-bottom').boundingBox();assert.ok(a.y+a.height<=b.y-4,'mobile panel must not overlap navigation: '+name);}
  }
  assert.deepEqual(errors,[]);
  console.log('Real libraries + RCSB PDB data: WebGL scene navigation and molecular controls passed');
} finally {await browser.close();}
