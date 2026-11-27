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
