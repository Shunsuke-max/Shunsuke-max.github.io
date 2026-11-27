import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Script } from 'node:vm';
const html=readFileSync('index.html','utf8');
const paths=['assets/css/base.css','assets/css/journey.css','assets/css/exhibition.css','assets/js/journey.js','assets/js/exhibition.js','assets/mark.svg','assets/js/depth-scene.js','assets/js/design.js','assets/css/design.css'];
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
test('all local assets exist and are referenced',()=>{for(const p of paths){assert.ok(existsSync(p),p);assert.ok(html.includes(p),p);}});
test('IDs are unique and internal anchors resolve',()=>{assert.equal(new Set(ids).size,ids.length);for(const m of html.matchAll(/\bhref="#([^"]+)"/g))assert.ok(ids.includes(m[1]),m[1]);});
test('JavaScript parses and literal element references resolve',()=>{for(const p of paths.filter(p=>p.endsWith('.js'))){const js=readFileSync(p,'utf8');new Script(js);for(const m of js.matchAll(/\b(?:by|get)\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),m[1]);}});
test('existing exhibits and molecular viewer remain present',()=>{for(const id of ['designJourney','design','designCanvas','protein','scaleJourney','depthScene','molHost','molSelect','work-foldlens','work-ensemble','work-part5','work-design'])assert.ok(ids.includes(id),id);assert.ok(!ids.includes('experiments'));assert.match(html,/lang="ja"/);});

import './geometry.test.mjs';
