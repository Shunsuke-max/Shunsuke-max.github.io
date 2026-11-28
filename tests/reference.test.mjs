import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePDB,fallback} from '../assets/js/design/reference.mjs';
import {backboneFeatures} from '../assets/js/design/geometry.mjs';
import {buildSidechainExample,displacedCoordinates} from '../assets/js/design/schematic.mjs';

const pdb=readFileSync('assets/data/8znl-ab.pdb','utf8');
test('reference parser preserves chain IDs, residue count and experimental atoms',()=>{
  const {binder,target}=parsePDB(pdb);
  assert.equal(binder.length,58);
  assert.equal(target.length,114);
  assert.deepEqual(binder.map(r=>r.resseq),Array.from({length:58},(_,i)=>i+1));
  assert.equal(binder[7].aa,'R');
  assert.ok(binder[7].atoms.some(a=>a.name==='CA'));
  assert.throws(()=>parsePDB(''),/Unexpected/);
  assert.ok(fallback().every(r=>r.aa==='?'&&r.atoms.length===0));
});
test('schematic sidechains preserve the reference alpha carbon and correct heavy atom count',()=>{
  const residue=parsePDB(pdb).binder[7],p={x:2,y:3,z:4};
  for(const [aa,count] of [['A',4],['V',6],['S',5]]){
    const sc=buildSidechainExample(residue,p,.3,aa,backboneFeatures);
    assert.equal(sc.atoms.length,count);
    assert.equal(sc.bonds.length,count-1);
    assert.deepEqual(sc.atoms[0],{...p,element:'C'});
    assert.equal(sc.atoms.filter(a=>a.element==='O').length,aa==='S'?1:0);
  }
  assert.equal(buildSidechainExample(null,p,.3,'A',backboneFeatures),null);
});
test('schematic comparison keeps its input immutable',()=>{
  const points=[{x:1,y:2,z:3}];
  const small=displacedCoordinates(points,'close'),large=displacedCoordinates(points,'different');
  assert.deepEqual(points,[{x:1,y:2,z:3}]);
  const distance=q=>Math.hypot(q.x-1,q.y-2,q.z-3);
  assert.ok(distance(small[0])<distance(large[0]));
});
