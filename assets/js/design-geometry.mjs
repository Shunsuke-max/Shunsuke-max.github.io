/**
 * Geometry for the Chapter 03 educational graph. Input coordinates are Å.
 * No rendering, network, model inference, or mutable selection state.
 * The graph excludes self loops; unlike ProteinMPNN's model-specific top-k,
 * k here counts OTHER residues, including immediate sequence neighbors.
 */
export function buildGeometry(residues) {
  if (!Array.isArray(residues) || residues.length < 2) {
    throw new TypeError('At least two residues are required');
  }
  const coordinates = residues.map((r, i) => {
    if (!r || ![r.x, r.y, r.z].every(Number.isFinite)) {
      throw new TypeError('Invalid C-alpha coordinates at index ' + i);
    }
    return Object.freeze([r.x, r.y, r.z]);
  });
  const n = coordinates.length;
  const distances = Array.from({length:n}, () => Array(n).fill(0));
  for (let i=0; i<n; i++) for (let j=i+1; j<n; j++) {
    const a=coordinates[i], b=coordinates[j];
    const d=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    if (!Number.isFinite(d)) throw new RangeError('Non-finite distance');
    distances[i][j]=distances[j][i]=d;
  }
  const rankings=distances.map((row,i) => Array.from({length:n},(_,j)=>j)
    .filter(j=>j!==i).sort((a,b)=>row[a]-row[b] || a-b));
  const freezeRows = rows => Object.freeze(rows.map(row=>Object.freeze(row)));
  return Object.freeze({
    size:n, coordinates:Object.freeze(coordinates),
    distances:freezeRows(distances), rankings:freezeRows(rankings),
  });
}

/** Directed row i lists the neighbors used by focus residue i. */
export function buildKnn(geometry, k) {
  const n=geometry.size;
  if (!Number.isInteger(k) || k<1 || k>=n) {
    throw new RangeError('k must be an integer in [1, n-1]');
  }
  const neighbors=geometry.rankings.map(row=>Object.freeze(row.slice(0,k)));
  const adjacency=neighbors.map(row=>{
    const set=new Set(row);
    return Object.freeze(Array.from({length:n},(_,j)=>Number(set.has(j))));
  });
  const edges=neighbors.flatMap((row,i)=>row.map(j=>Object.freeze([i,j])));
  return Object.freeze({k, size:n, neighbors:Object.freeze(neighbors),
    adjacency:Object.freeze(adjacency), edges:Object.freeze(edges)});
}

/** Zero-based indices; the display may label them using PDB residue IDs. */
export function describePair(geometry, graph, i, j) {
  const n=geometry.size;
  if (!Number.isInteger(i)||!Number.isInteger(j)||i<0||j<0||i>=n||j>=n) {
    throw new RangeError('Invalid residue index');
  }
  if (graph.size!==n) throw new RangeError('Graph and geometry sizes differ');
  return Object.freeze({i,j, distance:geometry.distances[i][j],
    sequenceSeparation:Math.abs(i-j), self:i===j,
    isNeighbor:graph.adjacency[i][j]===1,
    rank:i===j?null:geometry.rankings[i].indexOf(j)+1});
}

/** ProteinMPNN-style virtual C-beta from N, CA and C; all coordinates in Å. */
export function backboneFeatures(residue) {
  const names=['N','CA','C','O'], atoms=names.map(name=>residue.atoms?.find(a=>a.name===name));
  if(atoms.some(a=>!a||![a.x,a.y,a.z].every(Number.isFinite))) return null;
  const [n,ca,c,o]=atoms.map(a=>[a.x,a.y,a.z]);
  const b=ca.map((v,i)=>v-n[i]), v=c.map((x,i)=>x-ca[i]);
  const a=[b[1]*v[2]-b[2]*v[1],b[2]*v[0]-b[0]*v[2],b[0]*v[1]-b[1]*v[0]];
  const cb=ca.map((x,i)=>x-.58273431*a[i]+.56802827*b[i]-.54067466*v[i]);
  return [n,ca,c,o,cb];
}
export function pairAtomDistances(a,b) {
  const x=backboneFeatures(a),y=backboneFeatures(b);
  return x&&y?x.map(p=>y.map(q=>Math.hypot(...p.map((v,i)=>v-q[i])))):null;
}
/** RBF basis used in the standard ProteinMPNN distance features, not learned weights. */
export function distanceRbf(d) {
  if(!Number.isFinite(d)||d<0)throw new RangeError('Invalid distance');
  return Array.from({length:16},(_,i)=>{const center=2+20*i/15;return {center,value:Math.exp(-(((d-center)/1.25)**2))};});
}

/** Coordinate deviation in a shared, target-fixed frame; no rigid-body fitting. */
export function fixedFrameDeviation(reference,candidate,scale=1){
  if(!Array.isArray(reference)||!Array.isArray(candidate)||!reference.length||reference.length!==candidate.length||!Number.isFinite(scale)||scale<=0)throw new RangeError('Invalid coordinate pairs or scale');
  const distances=reference.map((p,i)=>{const q=candidate[i];const v=Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)/scale;if(!Number.isFinite(v))throw new RangeError('Invalid coordinate');return v;});
  return {distances,rmsd:Math.sqrt(distances.reduce((sum,v)=>sum+v*v,0)/distances.length)};
}
