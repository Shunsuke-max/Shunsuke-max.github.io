import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyReferenceGeometry } from './geometry-reference.mjs';
await verifyReferenceGeometry();
await mkdir('artifacts/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Real, pinned library builds served locally for reproducible testing.
  await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/build/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    assert.match(name, /^three[.\w-]+\.js$/);
    await route.fulfill({ path: resolve('node_modules/three/build', name), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#design').dataset.designSource === '8ZNL' && document.querySelector('#design').classList.contains('design-gl'), {}, { timeout: 30000 });
  assert.equal(await page.locator('#designFormula').isVisible(),false);
  await page.locator('.design-sources summary').click();
  assert.equal(await page.locator('#designFormula').isVisible(),true);
  await page.locator('.design-sources summary').click();
  const intro = page.locator('#design');
  assert.equal(await intro.getAttribute('data-target-contact-residues'),'53,55,57,64,67,69,70,77,114,116,118,121,122,123,124,125,126');
  assert.ok(Number(await intro.getAttribute('data-target-surface-atoms')) > 800);
  await page.waitForFunction(()=>document.querySelector('#design').dataset.targetSurfaceVisible==='true');
  assert.match(await page.locator('#designLegend').innerText(),/結合面（接触残基）/);
  // Inspect is an explicit, persistent state rather than a race against an animation.
  await page.locator('#designSiteInspect').click();
  await page.waitForFunction(()=>document.querySelector('#design').dataset.siteOnly==='true');
  assert.equal(await page.locator('#designSiteInspect').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#designTimeStep').isVisible(),false);
  assert.doesNotMatch(await page.locator('#designLegend').innerText(),/バインダー/);
  await intro.screenshot({path:'artifacts/screenshots/design-01-binding-site.png'});
  assert.equal(await intro.getAttribute('data-site-only'),'true');
  await page.locator('#designSiteInspect').click();
  await page.waitForFunction(()=>document.querySelector('#design').dataset.siteOnly==='false');
  await page.locator('#designFit').click();
  await page.waitForFunction(()=>document.querySelector('#design').dataset.fitVisible==='true');
  assert.equal(await page.locator('#designTimeStep').isVisible(),false);
  assert.match(await page.locator('#designLegend').innerText(),/実験構造/);
  await intro.screenshot({path:'artifacts/screenshots/design-01-fit.png'});
  await page.locator('#designFit').click();
  await page.waitForFunction(()=>document.querySelector('#design').dataset.fitVisible==='false');
  for (let n = 0; n < 5; n++) {
    if (n) await page.locator('[data-design-jump="' + n + '"]').click();
    await page.waitForFunction(n => document.querySelector('#design').dataset.designStep === String(n), n);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.design-formula-row').isVisible(),n===0);
    if(n===4)assert.equal(await page.locator('#designLegend').isVisible(),false);
    if (n === 1) {
      await page.waitForFunction(() => document.querySelector('#design').dataset.ribbonVisible === 'true');
      assert.ok(Number(await page.locator('#design').getAttribute('data-secondary-count')) > 0);
      const stage = page.locator('#design');
      const all = Number(await stage.getAttribute('data-atomic-count')), local = Number(await stage.getAttribute('data-atomic-visible-count'));
      assert.equal(all, 491);
      assert.ok(local > 40 && local < all);
      assert.ok(Number(await stage.getAttribute('data-interface-contacts')) >= 5);
      assert.match(await page.locator('#designAtomicFocus').innerText(), /PD-L1/);
      await page.locator('#designAtomicZoom').click();
      await page.waitForFunction(()=>document.querySelector('#design').dataset.atomicZoom==='true');
      await page.locator('#design').screenshot({path:'artifacts/screenshots/design-02-interface-zoom.png'});
      await page.locator('#designAtomicZoom').click();
      const atomicCopy = await page.locator('.design-copy').boundingBox(), atomicPanel = await page.locator('#designAtomicPanel').boundingBox();
      assert.ok(atomicCopy.y + atomicCopy.height <= atomicPanel.y + 1, 'atomic copy and controls must not overlap');
      await page.locator('[data-atomic-mode="all"]').click();
      assert.equal(await stage.getAttribute('data-atomic-visible-count'), String(all));
      await page.waitForTimeout(150);
      await stage.screenshot({ path: 'artifacts/screenshots/design-02-all-atoms.png' });
      await page.locator('[data-atomic-mode="local"]').click();
      assert.equal(await stage.getAttribute('data-atomic-visible-count'), String(local));
    }
    if (n === 2) {
      const stage = page.locator('#design');
      await page.waitForFunction(() => document.querySelector('#design').dataset.graphSource === '8ZNL');
      assert.equal(await stage.getAttribute('data-graph-neighbor-count'), '8');
      assert.equal(await stage.getAttribute('data-graph-focus'), '8');
      assert.equal(await stage.getAttribute('data-graph-pair'), '46');
      assert.equal(await page.locator('#designGraphDistance').innerText(), '5.66 Å');
      assert.equal(await page.locator('#designGraphSeparation').innerText(), '38');
      assert.equal(await page.locator('#designGraphNeighbors').innerText(), 'A7 · E9 · A11 · E5 · R6 · L10 · V46 · R4');
      await page.locator('#designGraphLabels').waitFor({ state: 'visible' });
      const boxes = await Promise.all(['#designGraphFocusLabel', '#designGraphPairLabel'].map(id => page.locator(id).boundingBox()));
      assert.ok(boxes.every(b => b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 1440 && b.y + b.height <= 900));
      assert.ok(boxes[0].x + boxes[0].width <= boxes[1].x || boxes[1].x + boxes[1].width <= boxes[0].x || boxes[0].y + boxes[0].height <= boxes[1].y || boxes[1].y + boxes[1].height <= boxes[0].y, 'graph labels must not overlap');
      const copy = await page.locator('.design-copy').boundingBox(), panel = await page.locator('#designGraphPanel').boundingBox();
      assert.ok(copy.y + copy.height <= panel.y + 1, 'graph copy and controls must not overlap');
      const matrixBox = await page.locator('#designGraphMatrix').boundingBox(), bottomBox = await page.locator('.design-bottom').boundingBox();
      assert.ok(matrixBox.y + matrixBox.height <= bottomBox.y - 2, 'graph matrix and bottom nav must not overlap');
      await stage.screenshot({ path: 'artifacts/screenshots/graph-initial.png' });
      const sb = await stage.boundingBox(), pairScreen = JSON.parse(await stage.getAttribute('data-graph-pair-screen'));
      await page.mouse.click(sb.x + pairScreen[0], sb.y + pairScreen[1]);
      assert.equal(await stage.getAttribute('data-graph-focus'), '46');
      await page.locator('#designGraphSequence button[data-residue="7"]').click();
      assert.equal(await stage.getAttribute('data-graph-focus'), '8');
      await page.locator('#designGraphReset').click();
      await page.locator('#designGraphK').fill('6');
      assert.equal(await stage.getAttribute('data-graph-neighbor-count'), '6');
      assert.equal(await stage.getAttribute('data-graph-pair-neighbor'), 'false');
      assert.equal(await page.locator('#designGraphDistance').innerText(), '5.66 Å');
      await page.locator('[data-matrix-mode="dist"]').click();
      assert.equal(await page.locator('#designMatrixCanvas').getAttribute('data-mode'), 'dist');
      await page.locator('#designGraphFocusSelect').selectOption('8');
      assert.equal(await stage.getAttribute('data-graph-focus'), '9');
      await page.locator('#designMatrixCanvas').focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await stage.getAttribute('data-graph-focus'), '10');
      const matrix = page.locator('#designMatrixCanvas'), mb = await matrix.boundingBox();
      await matrix.click({ position: { x: (30 + 11.5 * (276 / 58)) / 320 * mb.width, y: (30 + 7.5 * (276 / 58)) / 320 * mb.height } });
      assert.equal(await stage.getAttribute('data-graph-focus'), '8');
      assert.equal(await stage.getAttribute('data-graph-pair'), '12');
      await page.locator('#designGraphPairSelect').selectOption('7');
      assert.equal(await stage.getAttribute('data-graph-pair'), '8');
      assert.equal(await stage.getAttribute('data-graph-pair-neighbor'), 'false');
      assert.equal(await page.locator('#designGraphDistance').innerText(), '0.00 Å');
      await page.locator('#designGraphPairSelect').selectOption('11');
      const hit = page.locator('#designGraphHit'), hb = await hit.boundingBox();
      const yaw = await stage.getAttribute('data-graph-yaw');
      await page.mouse.move(hb.x + hb.width * .5, hb.y + hb.height * .45);
      await page.mouse.down();
      await page.mouse.move(hb.x + hb.width * .5 + 36, hb.y + hb.height * .45 + 8, { steps: 5 });
      await page.mouse.up();
      await page.waitForFunction(y => document.querySelector('#design').dataset.graphYaw !== y, yaw);
      assert.equal(await stage.getAttribute('data-graph-focus'), '8');
      await page.locator('#designGraphDetailOpen').click();
      await page.locator('#designGraphDetail').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#designGraphAtomTable td button').count(), 25);
      assert.equal(await page.locator('#designGraphRbf span').count(), 16);
      await page.screenshot({ path: 'artifacts/screenshots/graph-edge-features.png' });
      await page.locator('#designGraphDetailClose').click();
      await page.locator('#designGraphMessage').click();
      assert.equal(await page.locator('#designGraphMessage').getAttribute('aria-pressed'), 'true');
      await page.waitForTimeout(100);
      await stage.screenshot({ path: 'artifacts/screenshots/graph-message.png' });
      await page.locator('#designGraphReset').click();
      assert.equal(await stage.getAttribute('data-graph-focus'), '8');
      assert.equal(await stage.getAttribute('data-graph-neighbor-count'), '8');
      await page.locator('#designGraphFocusSelect').selectOption('8');
    }
    if (n === 3) {
      assert.equal(await page.locator('#design').getAttribute('data-sequence-focus'), '9');
      assert.equal(await page.locator('#designSequence .on').count(), 58);
      await page.locator('[data-aa-choice="S"]').click();
      assert.match(await page.locator('#designChoiceNote').innerText(), /セリン/);
      await page.locator('#designSequenceSelect').selectOption('10');
      assert.equal(await page.locator('#design').getAttribute('data-sequence-focus'),'11');
      await page.locator('#designSequenceZoom').click();
      await page.waitForFunction(()=>document.querySelector('#design').dataset.sequenceZoom==='true');
      await page.locator('#design').screenshot({path:'artifacts/screenshots/design-04-neighborhood-zoom.png'});
      await page.locator('#designSequenceZoom').click();
      await page.locator('#design').screenshot({path:'artifacts/screenshots/design-04-selected-residue.png'});
      await page.locator('[data-design-jump="2"]').click();
      await page.waitForFunction(() => document.querySelector('#design').dataset.designStep === '2');
      await page.locator('#designGraphReset').click();
      await page.locator('[data-design-jump="3"]').click();
      await page.waitForFunction(() => document.querySelector('#design').dataset.designStep === '3');
    }
    if (n === 4) {
      await page.waitForFunction(() => document.querySelector('#design').dataset.ribbonVisible === 'true');
      await page.locator('[data-compare="different"]').click();
      assert.equal(await page.locator('#design').getAttribute('data-compare'), 'different');
      assert.match(await page.locator('#designEvalSummary').innerText(), /大/);
      const rmsd=Number(await page.locator('#design').getAttribute('data-rmsd'));
      assert.ok(Math.abs(rmsd-7.1357956)<.00001,'fixed-frame RMSD in angstroms');
      assert.match(await page.locator('#designDeviationScale').innerText(),/0–10 Å/);
      await page.locator('#designDeviationSelect').fill('20');
      assert.equal(await page.locator('#design').getAttribute('data-eval-residue'),'20');
      await page.waitForTimeout(150);
      await page.locator('#design').screenshot({ path: 'artifacts/screenshots/design-05-different.png' });
      await page.locator('[data-compare="close"]').click();
      assert.ok(Math.abs(Number(await page.locator('#design').getAttribute('data-rmsd'))-.89707145)<.00001);
    }
    await page.locator('#design').screenshot({ path: 'artifacts/screenshots/design-0' + (n + 1) + '.png' });
  }
  await page.locator('[data-design-jump="0"]').click();
  await page.waitForFunction(() => document.querySelector('#design').dataset.designStep === '0');
  await page.locator('#designAutoplay').click();
  assert.equal(await page.locator('#design').getAttribute('data-autoplay'), 'true');
  await page.locator('#designAutoplay').click();
  assert.equal(await page.locator('#design').getAttribute('data-autoplay'), 'false');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  async function goDesign(p) {
    await page.evaluate(p => { const story = document.getElementById('designJourney'), stage = document.getElementById('design'); const top = scrollY + story.getBoundingClientRect().top; scrollTo({ top: top + (story.offsetHeight - stage.offsetHeight) * p, behavior: 'instant' }); }, p);
    await page.waitForFunction(n => Number(document.querySelector('#design').dataset.designStep) === n, Math.min(4, Math.floor(p * 5)));
    await page.waitForTimeout(250);
    assert.ok(await page.locator('#design').evaluate(e => e.classList.contains('design-gl')));
  }
  for (const [name, p] of [['noise', .02], ['diffusion-mid', .11], ['ribbon-transition', .27], ['ribbon-final', .36], ['graph', .50]]) {
    await goDesign(p); await page.locator('#design').screenshot({ path: 'artifacts/screenshots/motion-' + name + '.png' });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('[data-design-jump="0"]').click();
  await page.waitForFunction(() => document.querySelector('#design').dataset.designStep === '0');
  await page.waitForTimeout(150);
  const c0 = await page.locator('.design-copy').boundingBox(), b0 = await page.locator('.design-bottom').boundingBox();
  assert.ok(c0.y + c0.height <= b0.y - 2, 'laptop step 01 copy must not overlap bottom nav');
  await page.locator('#designSiteInspect').click();
  await page.waitForFunction(()=>document.querySelector('#design').dataset.siteOnly==='true');
  await page.locator('#design').screenshot({path:'artifacts/screenshots/compact-binding-site.png'});
  await page.locator('#designSiteInspect').click();
  await page.waitForFunction(()=>document.querySelector('#design').dataset.siteOnly==='false');
  await page.locator('#design').screenshot({path:'artifacts/screenshots/compact-intro.png'});
  await page.locator('[data-design-jump="2"]').click();
  await page.waitForFunction(() => document.querySelector('#design').dataset.designStep === '2');
  await page.waitForTimeout(150);
  const s2 = await page.locator('.design-sources').boundingBox(), m2 = await page.locator('#designGraphMatrix').boundingBox(), b2 = await page.locator('.design-bottom').boundingBox();
  assert.ok(s2.y + s2.height <= m2.y + 1, 'laptop step 03 sources must not overlap matrix');
  assert.ok(m2.y + m2.height <= b2.y - 2, 'laptop step 03 matrix must not overlap bottom nav');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, p] of [['intro', .02], ['ribbon', .36], ['graph', .50], ['sequence', .76], ['compare', .92]]) {
    await goDesign(p); await page.locator('#design').screenshot({ path: 'artifacts/screenshots/mobile-' + name + '.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    if (name === 'intro') {
      await page.locator('#designSiteInspect').click();
      await page.waitForFunction(()=>document.querySelector('#design').dataset.siteOnly==='true');
      await page.locator('#design').screenshot({path:'artifacts/screenshots/mobile-binding-site.png'});
      await page.locator('#designSiteInspect').click();
      await page.waitForFunction(()=>document.querySelector('#design').dataset.siteOnly==='false');
      await page.locator('#designFit').click();
      await page.waitForFunction(()=>document.querySelector('#design').dataset.fitVisible==='true');
      await page.locator('#design').screenshot({path:'artifacts/screenshots/mobile-fit.png'});
      await page.locator('#designFit').click();
    }
    if (name === 'ribbon') {
      await page.locator('#designAtomicZoom').click();
      await page.waitForFunction(()=>document.querySelector('#design').dataset.atomicZoom==='true');
      await page.locator('#design').screenshot({path:'artifacts/screenshots/mobile-interface-zoom.png'});
      await page.locator('#designAtomicZoom').click();
    }
    if (name === 'graph') {
      await page.locator('#designGraphMatrixOpen').click();
      await page.locator('#designGraphMatrix').waitFor({ state: 'visible' });
      const ms = await page.locator('#designGraphMatrix').evaluate(el => { const s = getComputedStyle(el); return { opacity: s.opacity, background: s.backgroundColor, animation: s.animationName }; });
      assert.equal(ms.opacity, '1'); assert.equal(ms.background, 'rgb(13, 29, 38)'); assert.equal(ms.animation, 'none');
      await page.locator('#design').screenshot({ path: 'artifacts/screenshots/mobile-graph-matrix.png' });
      await page.locator('#designGraphMatrixClose').click();
      await page.locator('#designGraphMatrix').waitFor({ state: 'hidden' });
    }
    if(name==='sequence'){
      await page.locator('#designSequenceZoom').click();
      await page.waitForFunction(()=>document.querySelector('#design').dataset.sequenceZoom==='true');
      await page.locator('#design').screenshot({path:'artifacts/screenshots/mobile-neighborhood-zoom.png'});
      await page.locator('#designSequenceZoom').click();
    }
    if (name === 'graph' || name === 'ribbon' || name === 'sequence' || name === 'compare') {
      const panel = page.locator(name === 'graph' ? '#designGraphPanel' : name === 'ribbon' ? '#designAtomicPanel' : name === 'sequence' ? '#designSequencePanel' : '#designEvaluate');
      const a = await panel.boundingBox(), b = await page.locator('.design-bottom').boundingBox();
      assert.ok(a.y + a.height <= b.y - 4, 'mobile panel must not overlap navigation: ' + name);
    }
  }
  assert.deepEqual(errors, []);
  console.log('Real libraries + RCSB 8ZNL PD-L1 complex: WebGL scene navigation and design controls passed');
} finally { await browser.close(); }
