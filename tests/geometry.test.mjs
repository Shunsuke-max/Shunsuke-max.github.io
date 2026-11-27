import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGeometry,buildKnn,describePair} from '../assets/js/design-geometry.mjs';
const r=(x,y,z)=>({x,y,z});
test('Euclidean geometry: true zero diagonal, symmetry, 3-4-12 triangle',()=>{
  const g=buildGeometry([r(0,0,0),r(3,4,12),r(3,0,0)]);
  assert.deepEqual(g.distances,[[0,13,3],[13,0,Math.sqrt(160)],[3,Math.sqrt(160),0]]);
});
test('Directed kNN excludes self and retains sequence neighbors; deterministic ties',()=>{
  const g=buildGeometry([r(0,0,0),r(1,0,0),r(-1,0,0),r(4,0,0)]);
  const k=buildKnn(g,1);
  assert.deepEqual(k.neighbors,[[1],[0],[0],[1]]);
  assert.deepEqual(k.edges,[[0,1],[1,0],[2,0],[3,1]]);
  assert.equal(k.adjacency[0][2],0);
  assert.equal(k.adjacency[2][0],1);
  assert.equal(k.adjacency[0][1],1);
  assert.deepEqual(describePair(g,k,0,2),{i:0,j:2,distance:1,sequenceSeparation:2,self:false,isNeighbor:false,rank:2});
  assert.equal(describePair(g,k,0,0).rank,null);
});
test('All valid k: exactly k unique neighbors per row, n*k directed edges; nested neighbor sets',()=>{
  const g=buildGeometry(Array.from({length:46},(_,i)=>r(Math.sin(i),i*.41,Math.cos(i))));
  let last=null;
  for(let k=1;k<46;k++){
    const graph=buildKnn(g,k);
    assert.equal(graph.edges.length,46*k);
    for(let i=0;i<46;i++){
      assert.equal(graph.adjacency[i][i],0);
      assert.equal(graph.adjacency[i].reduce((a,b)=>a+b,0),k);
      assert.equal(new Set(graph.neighbors[i]).size,k);
      if(last)assert.deepEqual(graph.neighbors[i].slice(0,k-1),last.neighbors[i]);
    }
    last=graph;
  }
});
test('Rigid transforms do not change distances or neighbor order',()=>{
  const p=[r(0,1,2),r(2,4,0),r(5,1,4),r(-2,3,7)];
  const a=buildGeometry(p),b=buildGeometry(p.map(v=>r(-v.y+10,v.x-5,v.z+2)));
  for(let i=0;i<p.length;i++)for(let j=0;j<p.length;j++)assert.ok(Math.abs(a.distances[i][j]-b.distances[i][j])<1e-12);
  assert.deepEqual(a.rankings,b.rankings);
});
test('Missing coordinates, invalid k/indices rejected; results immutable',()=>{
  for(const input of [null,[],[r(0,0,0)],[r(0,0,0),r(NaN,0,0)],[r(0,0,0),r('1',0,0)]])assert.throws(()=>buildGeometry(input));
  const p=[r(0,0,0),r(1,0,0)],g=buildGeometry(p);
  for(const k of [0,2,1.5,NaN])assert.throws(()=>buildKnn(g,k),RangeError);
  const graph=buildKnn(g,1);
  assert.throws(()=>describePair(g,graph,-1,0),RangeError);
  p[1].x=3;assert.equal(g.distances[0][1],1);
  assert.throws(()=>{graph.adjacency[0][1]=0;},TypeError);
  assert.throws(()=>{g.distances[0][1]=99;},TypeError);
});
