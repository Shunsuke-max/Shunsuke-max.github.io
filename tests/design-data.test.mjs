import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRun,selectFrame,topProbabilities} from '../assets/js/design-data.mjs';
// Synthetic fixture only. Never exposed as a real computation.
const good=()=>({schema_version:1,kind:'model-output',units:'angstrom',trajectory_kind:'noisy',provenance:{rfd3:{version:'TEST'},proteinmpnn:{version:'TEST'},note:'Synthetic test fixture'},residue_ids:['A:1','A:2'],final_ca:[[0,0,0],[3.8,0,0]],frames:[{index:0,ca:[[2,3,4],[7,6,5]]},{index:1,ca:[[0,0,0],[3.8,0,0]]}],candidates:[{sequence:'AG',probs:[Array(21).fill(1/21),Array(21).fill(1/21)]}]});
test('accepts mapped coordinates and selects exact saved frames',()=>{const d=validateRun(good());assert.equal(selectFrame(d,0).index,0);assert.equal(selectFrame(d,1).index,1);assert.equal(topProbabilities(d.candidates[0],0).length,3);});
test('rejects malformed frames, sequences and probability rows',()=>{for(const mutate of [d=>d.frames[1].ca.pop(),d=>d.frames[1].index=0,d=>d.candidates[0].sequence='A',d=>d.candidates[0].probs[0].fill(1),d=>d.residue_ids[1]='A:1',d=>d.final_ca[0][0]=Infinity,d=>d.provenance.note='']){const d=good();mutate(d);assert.throws(()=>validateRun(d));}});
