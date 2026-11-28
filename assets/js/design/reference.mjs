const aa = { ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V' };
export function random(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); }
export function fallback() { return Array.from({ length: 58 }, (_, i) => ({ x: Math.cos(i * .52) * 2.0 + Math.sin(i * .12) * 4.2, y: Math.sin(i * .52) * 2.0, z: (i - 29) * .36, aa: '?', resseq: i + 1, ss: 'helix', atoms: [] })); }
export function parsePDB(pdb) {
    const ranges = [], atomMap = new Map(), chains = { A: [], B: [] }, seen = new Set();
    for (const line of pdb.split(/\r?\n/)) {
        if (line.startsWith('HELIX ')) ranges.push({ kind: 'helix', chain: line[19], from: Number(line.slice(21, 25)), to: Number(line.slice(33, 37)) });
        if (line.startsWith('SHEET ')) ranges.push({ kind: 'sheet', chain: line[21], from: Number(line.slice(22, 26)), to: Number(line.slice(33, 37)) });
        if (line.startsWith('ATOM  ') && [' ', 'A'].includes(line[16]) && (line[21] === 'A' || line[21] === 'B')) {
            const k = line.slice(21, 27), xyz = [30, 38, 46].map(i => Number(line.slice(i, i + 8)));
            if (xyz.every(Number.isFinite)) {
                if (!atomMap.has(k)) atomMap.set(k, []);
                atomMap.get(k).push({ x: xyz[0], y: xyz[1], z: xyz[2], name: line.slice(12, 16).trim(), element: (line.slice(76, 78).trim() || line.slice(12, 16).trim()[0]).toUpperCase() });
            }
        }
    }
    for (const line of pdb.split(/\r?\n/)) {
        const ch = line[21];
        if (!line.startsWith('ATOM  ') || line.slice(12, 16).trim() !== 'CA' || ![' ', 'A'].includes(line[16]) || !(ch === 'A' || ch === 'B')) continue;
        const key = line.slice(21, 27); if (seen.has(key)) continue; seen.add(key);
        const xyz = [30, 38, 46].map(k => Number(line.slice(k, k + 8))); if (xyz.some(v => !Number.isFinite(v))) continue;
        const resseq = Number(line.slice(22, 26));
        chains[ch].push({
            x: xyz[0], y: xyz[1], z: xyz[2],
            aa: aa[line.slice(17, 20).trim()] || '?',
            resseq, residue: key.trim(), chain: ch,
            ss: ranges.find(r => r.chain === ch && resseq >= r.from && resseq <= r.to)?.kind || 'loop',
            atoms: atomMap.get(key) || []
        });
    }
    if (chains.A.length !== 58 || chains.B.length !== 114) throw Error('Unexpected 8ZNL residue count');
    return { binder: chains.A, target: chains.B };
}

