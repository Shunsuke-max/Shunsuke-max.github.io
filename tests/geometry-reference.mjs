// Uses the actual RCSB PDB 8ZNL file downloaded by the WebGL CI job and verifies
// verbatim parity with the bundled Chain A+B subset (assets/data/8znl-ab.pdb).
// Independent fixed-column reader and squared-distance ranking oracle.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGeometry, buildKnn, describePair } from '../assets/js/design-geometry.mjs';

function readChainCA(pdb, chain) {
  const byResidue = new Map();
  for (const l of pdb.split(/\r?\n/)) {
    if (!l.startsWith('ATOM  ') || l.slice(12, 16).trim() !== 'CA' || l[21] !== chain || ![' ', 'A'].includes(l[16])) continue;
    const id = Number(l.slice(22, 26));
    if (!byResidue.has(id)) byResidue.set(id, { id, name: l.slice(17, 20).trim(), x: Number(l.slice(30, 38)), y: Number(l.slice(38, 46)), z: Number(l.slice(46, 54)) });
  }
  return [...byResidue.values()].sort((a, b) => a.id - b.id);
}

export async function verifyReferenceGeometry(path = '/tmp/curiosity-pdb/8ZNL.pdb', localPath = 'assets/data/8znl-ab.pdb') {
  const [rcsbPdb, localPdb] = await Promise.all([readFile(path, 'utf8'), readFile(localPath, 'utf8')]);
  const binder = readChainCA(rcsbPdb, 'A');
  const target = readChainCA(rcsbPdb, 'B');
  const localBinder = readChainCA(localPdb, 'A');
  const localTarget = readChainCA(localPdb, 'B');

  assert.deepEqual(localBinder, binder, 'bundled 8znl-ab.pdb Chain A must match RCSB 8ZNL.pdb verbatim');
  assert.deepEqual(localTarget, target, 'bundled 8znl-ab.pdb Chain B must match RCSB 8ZNL.pdb verbatim');
  assert.deepEqual(binder.map(r => r.id), Array.from({ length: 58 }, (_, i) => i + 1));
  assert.deepEqual(target.map(r => r.id), Array.from({ length: 114 }, (_, i) => i + 20));

  const g = buildGeometry(binder);
  for (let i = 0; i < 58; i++) {
    const a = binder[i];
    const sq = binder.map(b => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
    const expected = Array.from({ length: 58 }, (_, j) => j).filter(j => j !== i).sort((j, k) => sq[j] - sq[k] || j - k);
    assert.deepEqual(g.rankings[i], expected);
    for (let j = 0; j < 58; j++) assert.ok(Math.abs(g.distances[i][j] - Math.sqrt(sq[j])) < 1e-10);
  }
  for (let k = 1; k <= 57; k++) {
    const graph = buildKnn(g, k);
    assert.equal(graph.edges.length, 58 * k);
    for (let i = 0; i < 58; i++) {
      assert.equal(graph.adjacency[i][i], 0);
      assert.equal(graph.adjacency[i].reduce((a, b) => a + b, 0), k);
      for (let j = 0; j < 58; j++) assert.equal(graph.adjacency[i][j], Number(g.rankings[i].slice(0, k).includes(j)));
    }
  }
  const graph = buildKnn(g, 8), pair = describePair(g, graph, 7, 45);
  assert.equal(binder[7].name, 'ARG');
  assert.equal(binder[45].name, 'VAL');
  assert.equal(pair.sequenceSeparation, 38);
  assert.ok(pair.distance > 5.65 && pair.distance < 5.67);
  assert.equal(pair.isNeighbor, true);
  assert.equal(pair.rank, 7);
  assert.deepEqual(graph.neighbors[7].map(j => binder[j].id), [7, 9, 11, 5, 6, 10, 46, 4]);
  console.log('8ZNL geometry passed: 58 binder + 114 PD-L1 residues; all 3,364 distances; k=1..57; Arg8 neighbors', graph.neighbors[7].map(j => ({ residue: binder[j].id, angstrom: g.distances[7][j].toFixed(3) })));
}
