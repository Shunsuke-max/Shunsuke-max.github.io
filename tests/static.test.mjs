import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Script } from 'node:vm';
const html=readFileSync('index.html','utf8');
const paths=['assets/css/base.css','assets/css/exhibition.css','assets/js/exhibition.js','assets/morphe-favicon.png','assets/js/design.js','assets/css/design.css'];
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
test('all local assets exist and are referenced',()=>{for(const p of paths){assert.ok(existsSync(p),p);assert.ok(html.includes(p),p);}assert.ok(existsSync('assets/data/8znl-ab.pdb'));assert.ok(readFileSync('assets/js/design.js','utf8').includes('assets/data/8znl-ab.pdb'));});
test('IDs are unique and internal anchors resolve',()=>{assert.equal(new Set(ids).size,ids.length);for(const m of html.matchAll(/\bhref="#([^"]+)"/g))assert.ok(ids.includes(m[1]),m[1]);});
test('JavaScript parses and literal element references resolve',()=>{for(const p of paths.filter(p=>p.endsWith('.js'))){const js=readFileSync(p,'utf8');new Script(js);for(const m of js.matchAll(/\b(?:by|get)\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),m[1]);}});
test('existing exhibits and design controls remain present',()=>{for(const id of ['designJourney','design','designCanvas','designAutoplay','designNext','designReplay','designTimeStep','designEvalSummary','work-foldlens','work-ensemble','work-part5','work-design'])assert.ok(ids.includes(id),id);assert.ok(!ids.includes('experiments'));assert.ok(!ids.includes('scaleJourney'));assert.match(html,/lang="ja"/);});

test('Morphē is the sole site brand without a visible subtitle',()=>{
  assert.match(html,/<title>Morphē<\/title>/);
  assert.match(html,/<meta property="og:title" content="Morphē">/);
  assert.match(html,/<a class="wordmark" href="\.\/">Morphē<\/a>/);
  assert.doesNotMatch(html,/Curiosity Lab/i);
  assert.match(html,/<div class="design-top"><a href="#works">/);
});

test('scientific copy retains provenance and avoids opaque jargon',()=>{
  const js=readFileSync('assets/js/design.js','utf8');
  assert.match(html,/AIによる推論は未実施/);
  assert.match(html,/結合や機能の確認には実験が必要/);
  assert.doesNotMatch(html+js,/棄却ゲート|模式偏差ライン|少しずつ誤差を取り除き/);
  assert.match(js,/近い残基同士を線で結びます/);
  assert.match(html,/<link rel="icon"[^>]*morphe-favicon\.png/);
});
test('formula is in the source disclosure, not the main copy',()=>{
  assert.match(html,/<details class="design-sources">[\s\S]*?id="designFormula"/);
  assert.doesNotMatch(html,/id="designIntent"/);
  assert.match(html,/class="design-eval-key"/);
});
import './geometry.test.mjs';
