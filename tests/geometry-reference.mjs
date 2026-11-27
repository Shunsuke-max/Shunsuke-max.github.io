// Uses the actual RCSB PDB file downloaded by the existing WebGL CI job.
// Independent fixed-column reader and squared-distance ranking oracle.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildGeometry,buildKnn,describePair} from '../assets/js/design-geometry.mjs';

export async function verifyReferenceGeometry(path='/tmp/curiosity-pdb/1CRN.pdb'){
  const pdb=await readFile(path,'utf8');
  const byResidue=new Map();
  for(const l of pdb.split(/\r?\n/)){
    if(!l.startsWith('ATOM  ')||l.slice(12,16).trim()!=='CA'||l[21]!=='A'||![' ','A'].includes(l[16]))continue;
    const id=Number(l.slice(22,26));
    if(!byResidue.has(id))byResidue.set(id,{id,name:l.slice(17,20),x:Number(l.slice(30,38)),y:Number(l.slice(38,46)),z:Number(l.slice(46,54))});
  }
  const residues=[...byResidue.values()].sort((a,b)=>a.id-b.id);
  assert.deepEqual(residues.map(r=>r.id),Array.from({length:46},(_,i)=>i+1));
  const g=buildGeometry(residues);
  for(let i=0;i<46;i++){
    const a=residues[i];
    const sq=residues.map(b=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2);
    const expected=Array.from({length:46},(_,j)=>j).filter(j=>j!==i).sort((j,k)=>sq[j]-sq[k]||j-k);
    assert.deepEqual(g.rankings[i],expected);
    for(let j=0;j<46;j++)assert.ok(Math.abs(g.distances[i][j]-Math.sqrt(sq[j]))<1e-10);
  }
  for(let k=1;k<=45;k++){
    const graph=buildKnn(g,k);
    assert.equal(graph.edges.length,46*k);
    for(let i=0;i<46;i++){
      assert.equal(graph.adjacency[i][i],0);
      assert.equal(graph.adjacency[i].reduce((a,b)=>a+b,0),k);
      for(let j=0;j<46;j++)assert.equal(graph.adjacency[i][j],Number(g.rankings[i].slice(0,k).includes(j)));
    }
  }
  const graph=buildKnn(g,6),pair=describePair(g,graph,3,31);
  assert.equal(residues[3].name,'CYS');assert.equal(residues[31].name,'CYS');
  assert.equal(pair.sequenceSeparation,28);
  assert.ok(pair.distance>4.08&&pair.distance<4.11);
  assert.equal(pair.isNeighbor,true);assert.equal(pair.rank,3);
  assert.deepEqual(graph.neighbors[3].map(j=>residues[j].id),[5,3,32,46,44,10]);
  console.log('1CRN geometry passed: 46 residues; all 2,116 distances; k=1..45; Cys4 neighbors',graph.neighbors[3].map(j=>({residue:residues[j].id,angstrom:g.distances[3][j].toFixed(3)})));
}
