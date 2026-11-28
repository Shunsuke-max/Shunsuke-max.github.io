const stage = document.getElementById('design'), journey = document.getElementById('designJourney');
const canvas = document.getElementById('designCanvas'), webgl = document.getElementById('designWebGL');
const by = id => document.getElementById(id);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const DEFAULT_FOCUS = 7, DEFAULT_PAIR = 45, DEFAULT_K = 8;
const chapters = [
    ['DIFFUSION', 'ノイズから\nバインダーを生成する', 'がん免疫療法の標的PD-L1に結合する小型タンパク質（バインダー）を設計します。', 'X<sub>t</sub> → X<sub>0</sub>'],
    ['RFD3', '標的に合わせて\n原子を配置する', 'RFdiffusion3は、標的との結合面に合わせて、主鎖と側鎖の原子の位置を生成します。', 'p<sub>θ</sub>(X | C)'],
    ['GEOMETRY', '立体構造を\nグラフで表す', '配列上で離れた残基も、折り畳まれると近くに位置することがあります。近い残基同士を線で結びます。', 'G = (V, E)'],
    ['PROTEINMPNN', '立体構造に合う\n配列を設計する', 'ProteinMPNNは主鎖の形を変えず、周囲の残基との位置関係からアミノ酸配列を予測します。', 'p<sub>φ</sub>(S | X<sub>bb</sub>)'],
    ['VALIDATION', '構造を再予測して\n設計を検証する', '設計した配列から立体構造を予測し、目標の形に近いか確かめます。', 'S → X&#x2032; → RMSD']
];
const aa = { ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V' };
function random(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); }
function fallback() { return Array.from({ length: 58 }, (_, i) => ({ x: Math.cos(i * .52) * 2.0 + Math.sin(i * .12) * 4.2, y: Math.sin(i * .52) * 2.0, z: (i - 29) * .36, aa: '?', resseq: i + 1, ss: 'helix', atoms: [] })); }
function parsePDB(pdb) {
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

let raw = fallback(), targetRaw = [], real = false, points = [], targetPoints = [], noise = [], edges = [], complexShift = { x: 0, y: 0, z: 0 };
let step = -1, progress = 0, local = 0, visible = true, raf = 0, gl = null;
let width = 0, height = 0, dpr = 1, detailAtoms = [], detailBonds = [], interfaceContacts = [], atomicMode = 'local', atomicAngle = .52, binderAtomTotal = 0;
const elementColors = { C: '#d2c5ac', N: '#82a9e2', O: '#e18a7b', S: '#e5c47f' }, targetElementColors = { C: '#8ea5b5', N: '#7ea4dc', O: '#d48680', S: '#d4bd82' }, radii = { C: .76, N: .71, O: .66, S: 1.05 };
const binderInterfaceSet = new Set([6, 9, 10, 29, 33]);
const targetInterfaceSet = new Set([70, 114, 118, 124, 126]);
// Display-only van der Waals spheres, not a solvent-excluded surface.
const surfaceRadii = { C: 1.70, N: 1.55, O: 1.52, S: 1.80 };
let targetSurfaceAtoms = [], targetSiteYaw = .52, inspectSite = false;
const siteIntroMs = 1500;
function syncSiteInspect() {
    const b = by('designSiteInspect');
    b.hidden = step !== 0 && step !== -1;
    b.disabled = !targetSurfaceAtoms.length;
    b.setAttribute('aria-pressed', String(inspectSite));
}
function buildTargetSurface(center, scaleFactor) {
    targetSurfaceAtoms = [];
    const binder = raw.flatMap(r => r.atoms).filter(a => surfaceRadii[a.element]);
    const contact = [];
    const transform = (a, site) => ({
        x: (a.x - center[0]) * scaleFactor, y: (a.y - center[1]) * scaleFactor,
        z: (a.z - center[2]) * scaleFactor, radius: surfaceRadii[a.element] * scaleFactor, site
    });
    if (real && binder.length) {
        for (const r of targetRaw) {
            const atoms = r.atoms.filter(a => surfaceRadii[a.element]);
            const site = atoms.some(a => binder.some(b => (a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2 <= 16));
            if (site) contact.push(r.resseq);
            targetSurfaceAtoms.push(...atoms.map(a => transform(a, site)));
        }
        // Orient binder to the right of PD-L1 and slightly towards the viewer.
        const mean = key => targetPoints.reduce((sum,p)=>sum+p[key],0)/targetPoints.length;
        targetSiteYaw = Math.atan2(-mean('z'), -mean('x')) - .45;
    }
    stage.dataset.targetContactResidues = contact.join(',');
    stage.dataset.targetSurfaceAtoms = String(targetSurfaceAtoms.length);
    syncSiteInspect();
    updateLegend(Math.max(0,step));
}

function buildAtomicStudy(center, scaleFactor) {
    const collect = (list, chain, focusSet) => list.flatMap((r, idx) => {
        const seen = new Set();
        return r.atoms.filter(a => radii[a.element] && !seen.has(a.name) && seen.add(a.name))
            .map(a => ({ ...a, chain, residue: idx, resseq: r.resseq, focus: focusSet.has(r.resseq) }));
    });
    const binderAtoms = real ? collect(raw, 'A', binderInterfaceSet) : [];
    const targetFocusAtoms = real ? collect(targetRaw, 'B', targetInterfaceSet).filter(a => a.focus) : [];
    binderAtomTotal = binderAtoms.length;
    const allRaw = [...binderAtoms, ...targetFocusAtoms];
    const bonds = [], polar = [];
    for (let i = 0; i < allRaw.length; i++) {
        for (let j = i + 1; j < allRaw.length; j++) {
            const a = allRaw[i], b = allRaw[j];
            const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
            if (a.chain === b.chain) {
                const same = a.residue === b.residue;
                const peptide = b.resseq === a.resseq + 1 && a.name === 'C' && b.name === 'N';
                if ((same || peptide) && distance > .6 && distance <= radii[a.element] + radii[b.element] + .25) bonds.push([i, j]);
            } else if (a.focus && b.focus && (a.element === 'N' || a.element === 'O') && (b.element === 'N' || b.element === 'O') && distance < 3.5) {
                polar.push([i, j, distance]);
            }
        }
    }
    detailAtoms = allRaw.map(a => ({
        ...a,
        x: (a.x - center[0]) * scaleFactor,
        y: (a.y - center[1]) * scaleFactor,
        z: (a.z - center[2]) * scaleFactor
    }));
    detailBonds = bonds;
    interfaceContacts = polar;

    // Pick a front-facing yaw angle that separates binder interface atoms and PD-L1 hotspot atoms clearly.
    const aFocus = detailAtoms.filter(a => a.chain === 'A' && a.focus);
    const bFocus = detailAtoms.filter(a => a.chain === 'B' && a.focus);
    atomicAngle = .52;
    if (aFocus.length && bFocus.length) {
        const avg = arr => ['x', 'y', 'z'].map(k => arr.reduce((s, v) => s + v[k], 0) / arr.length);
        const ca = avg(aFocus), cb = avg(bFocus), mid = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2, (ca[2] + cb[2]) / 2];
        let best = -Infinity;
        for (let i = 0; i < 72; i++) {
            const angle = i * Math.PI / 36, c = Math.cos(angle), s = Math.sin(angle);
            const sepX = Math.abs((ca[0] - cb[0]) * c + (ca[2] - cb[2]) * s);
            const depth = -(mid[0] - complexShift.x) * s + (mid[2] - complexShift.z) * c;
            const score = sepX * 2.2 + depth * .45;
            if (score > best) { best = score; atomicAngle = angle; }
        }
    }
    stage.dataset.atomicCount = String(binderAtomTotal);
    stage.dataset.atomicBondCount = String(bonds.length);
    stage.dataset.interfaceContacts = String(polar.length);
    by('designAtomicFocus').textContent = polar.length
        ? 'PD-L1とのN・O原子間の近接：' + polar.length + ' 対（< 3.5 Å）'
        : 'PD-L1との結合面の原子';
    updateAtomicMode();
}
function visibleAtomic(a) { return atomicMode === 'all' ? a.chain === 'A' : a.focus; }
function updateAtomicMode() {
    const count = detailAtoms.filter(visibleAtomic).length;
    stage.dataset.atomicMode = atomicMode;
    stage.dataset.atomicVisibleCount = String(count);
    by('designAtomicCount').textContent = count
        ? (atomicMode === 'all' ? count + ' / ' + binderAtomTotal + ' 原子（水素を除く）' : '結合面：' + count + ' 原子（水素を除く）')
        : '参照構造を取得できません';
    for (const b of stage.querySelectorAll('[data-atomic-mode]')) {
        b.disabled = !detailAtoms.length;
        b.setAttribute('aria-pressed', String(b.dataset.atomicMode === atomicMode));
    }
    by('designAtomicFocus').hidden = atomicMode === 'all' || !detailAtoms.length;
}
for (const b of stage.querySelectorAll('[data-atomic-mode]')) b.addEventListener('click', () => { atomicMode = b.dataset.atomicMode; updateAtomicMode(); schedule(); });

let graphFocus = DEFAULT_FOCUS, graphPair = DEFAULT_PAIR, graphK = DEFAULT_K, graphMode = 'adj', graphMessage = false, graphPitch = .20, graphProjected = [], graphPhase = 0, graphMatrixOpen = false;
let graphFrameKey = '', graphInitialAngle = .61, graphTransitionStart = -Infinity, graphFromAtoms = false, graphTransition = 1;
let graphGeometry = null, graphModel = null, geometryModule = null, graphAngle = .61, graphNeighbors = new Set();

function updateGraphStudy(rebuildGeometry = true) {
    if (rebuildGeometry) graphGeometry = real && geometryModule ? geometryModule.buildGeometry(raw) : null;
    graphModel = graphGeometry ? geometryModule.buildKnn(graphGeometry, graphK) : null;
    graphNeighbors = new Set(graphModel?.neighbors[graphFocus] || []);
    edges = graphModel ? graphModel.neighbors[graphFocus].map(j => [graphFocus, j]) : [];
    stage.dataset.graphSource = graphModel ? '8ZNL' : 'unavailable';
    stage.dataset.graphFocus = graphModel ? String(raw[graphFocus].resseq) : '';
    stage.dataset.graphPair = graphModel ? String(raw[graphPair].resseq) : '';
    stage.dataset.graphNeighborCount = String(edges.length); stage.dataset.graphK = String(graphK); stage.dataset.graphMode = graphMode; stage.dataset.graphPairNeighbor = String(graphNeighbors.has(graphPair)); graphFrameKey = '';
    const pair = graphModel ? geometryModule.describePair(graphGeometry, graphModel, graphFocus, graphPair) : null;
    by('designGraphDistance').textContent = pair ? pair.distance.toFixed(2) + ' Å' : '—';
    by('designGraphSeparation').textContent = pair ? String(pair.sequenceSeparation) : '—';
    by('designGraphStatus').textContent = pair ? ('ドラッグで回転、クリックで残基を選択') : '参照構造を取得できないため、近傍グラフを表示できません。';
    by('designGraphNeighbors').textContent = graphModel ? graphModel.neighbors[graphFocus].map(j => raw[j].aa + raw[j].resseq).join(' · ') : '—';
    by('designGraphMetrics').hidden = !pair; by('designGraphControls').hidden = !pair; by('designGraphHit').hidden = step !== 2 || !pair; by('designGraphMatrix').hidden = step !== 2 || !pair;
    if (pair) renderGraphUI(pair);
    by('designGraphLabels').hidden = step !== 2 || !pair;
    if (pair && rebuildGeometry) {
        const ids = [graphFocus, ...graphNeighbors], f = points[graphFocus], p = points[graphPair];
        let best = -Infinity;
        for (let i = 0; i < 72; i++) {
            const angle = i * Math.PI / 36, c = Math.cos(angle), sn = Math.sin(angle);
            const projected = v => [v.x * c + v.z * sn, v.y * .98 - (-v.x * sn + v.z * c) * .198, -v.x * sn + v.z * c];
            const a = projected(f), b = projected(p);
            const separation = Math.hypot(a[0] - b[0], a[1] - b[1]);
            const minNear = Math.min(...ids.filter(j => j !== graphFocus).map(j => { const q = projected(points[j]); return Math.hypot(a[0] - q[0], a[1] - q[1]); }));
            const vectors = ids.filter(j => j !== graphFocus).map(j => { const q = projected(points[j]); return Math.atan2(q[1] - a[1], q[0] - a[0]); });
            let minAngular = Math.PI;
            for (let j = 0; j < vectors.length; j++) for (let k = j + 1; k < vectors.length; k++) { const d = Math.abs(vectors[j] - vectors[k]); minAngular = Math.min(minAngular, d, 2 * Math.PI - d); }
            const score = separation * 1.5 + minNear * 1.3 + minAngular * .65 + (a[2] + b[2]) * .22;
            if (score > best) { best = score; graphAngle = angle; graphInitialAngle = angle; }
        }
    }
}

function graphLabelPositions(project) {
    const labels = by('designGraphLabels'); labels.hidden = step !== 2 || !graphModel;
    if (labels.hidden) return;
    const projected = points.map(project); graphProjected = projected;
    const key = [width, height, graphFocus, graphPair, graphAngle, graphPitch, step].join(':'); if (key === graphFrameKey) return; graphFrameKey = key;
    const a = projected[graphFocus], b = projected[graphPair], portrait = width < 801;
    stage.dataset.graphFocusScreen = JSON.stringify([a.x, a.y]); stage.dataset.graphPairScreen = JSON.stringify([b.x, b.y]); stage.dataset.graphYaw = String(graphAngle);
    by('designGraphPairLabel').hidden = graphFocus === graphPair; by('designGraphPairLeader').hidden = graphFocus === graphPair;
    const ring = by('designGraphFocusRing'); ring.style.left = a.x + 'px'; ring.style.top = a.y + 'px';
    const placed = [];
    for (const [id, lineId, p, other] of [['designGraphFocusLabel', 'designGraphFocusLeader', a, b], ['designGraphPairLabel', 'designGraphPairLeader', b, a]]) {
        if (graphFocus === graphPair && id === 'designGraphPairLabel') continue;
        const el = by(id), leader = by(lineId), w = el.offsetWidth || 58, h = el.offsetHeight || 20;
        const offset = portrait ? 19 : 29; let best = null, bestScore = Infinity;
        for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI / 8, dx = Math.cos(angle), dy = Math.sin(angle);
            const x = p.x + dx * (offset + w / 2) - w / 2, y = p.y + dy * (offset + h / 2) - h / 2;
            if (x < 8 || x + w > width - 8 || y < 8 || y + h > height - 8) continue;
            const overlap = (q, r) => Math.max(0, Math.min(q.x + q.w, r.x + r.w + 8) - Math.max(q.x, r.x - 8)) * Math.max(0, Math.min(q.y + q.h, r.y + r.h + 8) - Math.max(q.y, r.y - 8));
            const rect = { x, y, w, h };
            let penalty = placed.reduce((v, r) => v + overlap(rect, r) * 2, 0);
            for (const q of projected) { const ddx = Math.max(x - q.x, 0, q.x - x - w), ddy = Math.max(y - q.y, 0, q.y - y - h); const distance = Math.hypot(ddx, ddy); penalty += Math.max(0, 14 - distance) * 4; }
            const outward = (p.x - other.x) * dx + (p.y - other.y) * dy;
            const matrix = by('designGraphMatrix'), copy = stage.querySelector('.design-copy'), stageRect = stage.getBoundingClientRect();
            const exclusions = [copy, by('designGraphPanel'), matrix].filter(e => e && e.getClientRects().length).map(e => { const b = e.getBoundingClientRect(); return { x: b.left - stageRect.left, y: b.top - stageRect.top, w: b.width, h: b.height }; });
            penalty += exclusions.reduce((v, r) => v + overlap(rect, r) * 3, 0);
            const score = penalty - outward * .09 + Math.abs(dy) * 2;
            if (score < bestScore) { bestScore = score; best = rect; }
        }
        const r = best || { x: Math.max(8, Math.min(width - w - 8, p.x + offset)), y: Math.max(8, Math.min(height - h - 8, p.y - h - offset)), w, h };
        placed.push(r); el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.transform = 'none';
        const ex = Math.max(r.x, Math.min(r.x + r.w, p.x)), ey = Math.max(r.y, Math.min(r.y + r.h, p.y));
        const dx = ex - p.x, dy = ey - p.y, len = Math.hypot(dx, dy), inset = portrait ? 11 : 19;
        leader.style.left = (p.x + dx / Math.max(1, len) * inset) + 'px'; leader.style.top = (p.y + dy / Math.max(1, len) * inset) + 'px'; leader.style.width = Math.max(0, len - inset) + 'px'; leader.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
    }
}

let compare = 'close', choice = 'A';
let selectedResidue = DEFAULT_FOCUS;
const legends = [
    ['バインダー（模式図）', 'PD-L1', '結合面（接触残基）'],
    ['青緑：バインダー主鎖', 'PD-L1', '金点線：N・O原子間の近接'],
    ['青緑：バインダー主鎖', '近い残基を結ぶ線'],
    ['青緑：固定した主鎖', '近い残基・側鎖候補'],
    []
];
function updateLegend(n) {
    const e = by('designLegend');
    e.hidden = n === 4;
    e.replaceChildren(...legends[n].filter((_,i)=>!(n===0 && i>0 && !targetSurfaceAtoms.length)).map((label, i) => {
        const s = document.createElement('span'), dot = document.createElement('i');
        const cls = i === 0 ? '' : ((n === 0 && i === 1) || (n === 1 && i === 1)) ? ' target' : ' amber';
        dot.className = 'design-dot' + cls;
        s.append(dot, document.createTextNode(label));
        return s;
    }));
}
function comparisonPoints(coords) {
    const magnitude = compare === 'close' ? .22 : 1.75;
    return coords.map((p, i) => ({ x: p.x + magnitude * Math.sin(i * .29), y: p.y + magnitude * Math.cos(i * .19), z: p.z + magnitude * Math.sin(i * .17 + 1) }));
}
function updateEvalSummary() {
    const el = by('designEvalSummary');
    if (!el) return;
    const isDiff = compare === 'different';
    el.textContent = isDiff ? 'ずれ：大（設計を見直す例）' : 'ずれ：小（候補に残す例）';
    el.classList.toggle('is-warn', isDiff);
}
for (const b of stage.querySelectorAll('[data-compare]')) b.addEventListener('click', () => {
    compare = b.dataset.compare; stage.dataset.compare = compare;
    for (const x of stage.querySelectorAll('[data-compare]')) x.setAttribute('aria-pressed', String(x === b));
    updateEvalSummary(); schedule();
});
for (const b of stage.querySelectorAll('[data-aa-choice]')) b.addEventListener('click', () => {
    choice = b.dataset.aaChoice; stage.dataset.aaChoice = choice;
    for (const x of stage.querySelectorAll('[data-aa-choice]')) x.setAttribute('aria-pressed', String(x === b));
    by('designChoiceNote').textContent = ({ A: 'A：アラニン（小型・疎水性）', V: 'V：バリン（分岐鎖・疎水性）', S: 'S：セリン（極性・水酸基あり）' })[choice];
    if (gl) gl.updateSidechain();
    schedule();
});
const ctx = canvas.getContext('2d');
const buttons = [...stage.querySelectorAll('[data-design-jump]')];

function rebuild() {
    const center = ['x', 'y', 'z'].map(k => raw.reduce((s, p) => s + p[k], 0) / raw.length);
    const max = Math.max(...raw.map(p => Math.hypot(p.x - center[0], p.y - center[1], p.z - center[2])));
    const scaleFactor = 5.6 / max;
    points = raw.map(p => ({ x: (p.x - center[0]) * scaleFactor, y: (p.y - center[1]) * scaleFactor, z: (p.z - center[2]) * scaleFactor, aa: p.aa, ss: p.ss || 'loop' }));
    targetPoints = targetRaw.map(p => ({ x: (p.x - center[0]) * scaleFactor, y: (p.y - center[1]) * scaleFactor, z: (p.z - center[2]) * scaleFactor, aa: p.aa, ss: p.ss || 'loop' }));
    if (targetPoints.length) {
        const allPts = [...points, ...targetPoints];
        complexShift = {
            x: allPts.reduce((s, p) => s + p.x, 0) / allPts.length,
            y: allPts.reduce((s, p) => s + p.y, 0) / allPts.length,
            z: allPts.reduce((s, p) => s + p.z, 0) / allPts.length
        };
    } else {
        complexShift = { x: 0, y: 0, z: 0 };
    }
    buildTargetSurface(center, scaleFactor);
    buildAtomicStudy(center, scaleFactor);
    // Keep illustrative noise near the known binder pose; this is not collision-aware diffusion.
    const spread = real ? 10.5 : 15.5;
    noise = points.map((p, i) => ({ x: (random(i * 3 + 1) - .5) * spread, y: (random(i * 3 + 2) - .5) * spread, z: (random(i * 3 + 3) - .5) * spread }));
    updateGraphStudy();
    by('designSequence').replaceChildren(...raw.map(() => { const s = document.createElement('span'); s.textContent = '·'; return s; }));
    updateSequence();
    if (gl) gl.rebuild();
}

function updateSequence(now = performance.now()) {
    const seqProgress = motion.matches ? 1 : autoplay && step === 3 ? clamp((now - autoplayStepStart) / 3600) : Math.min(1, local * 1.35);
    const count = real && step === 3 ? Math.round(seqProgress * raw.length) : 0;
    by('designSequenceCount').textContent = count + ' / ' + raw.length;
    selectedResidue = graphFocus; stage.dataset.sequenceFocus = String(raw[selectedResidue]?.resseq || selectedResidue + 1);
    by('designSequenceFocus').textContent = real ? residueLabel(selectedResidue) + ' の側鎖候補' : '注目残基の候補例';
    by('designSequenceLabel').textContent = real ? '実験構造の配列（8ZNL・鎖A）' : '参照配列を取得できませんでした';
    [...by('designSequence').children].forEach((s, i) => { s.textContent = i < count ? raw[i].aa : '·'; s.classList.toggle('on', i < count); s.classList.toggle('design-seq-focus', real && i === selectedResidue); });
    if (gl) gl.updateSidechain();
}

function setStep(n) {
    if (n === step) return; graphFromAtoms = n === 2 && step === 1 && real; graphTransitionStart = performance.now(); step = n; stage.dataset.designStep = String(n);
    inspectSite = false; syncSiteInspect();
    stage.querySelector('.design-formula-row').hidden = n !== 0;
    by('designTimeStep').hidden = n !== 0; by('designReplay').hidden = n !== 0;
    by('designAtomicPanel').hidden = n !== 1; by('designGraphPanel').hidden = n !== 2; by('designGraphMatrix').hidden = n !== 2 || !graphModel; by('designGraphHit').hidden = n !== 2 || !graphModel; graphFrameKey = '';
    if (n !== 2) { if (by('designGraphDetail').open) by('designGraphDetail').close(); setMatrixOpen(false); }
    by('designGraphLabels').hidden = n !== 2 || !graphModel; updateLegend(n);
    const c = chapters[n];
    by('designKicker').textContent = '0' + (n + 1) + ' / 05 — ' + c[0];
    by('designTitle').textContent = c[1];
    by('designDescription').innerHTML = c[2];
    by('designFormula').innerHTML = c[3];
    by('designFormulaNote').textContent = [
        'ノイズを含む状態から目標構造へ変化する過程の模式図です。tは説明用の進行度で、実モデルの時刻ではありません。',
        '設計条件Cを与えたときの原子座標Xの生成を表します。',
        'Vは残基、Eは空間的に近い残基を結ぶ辺を表します。',
        '主鎖座標Xbbを条件として、配列Sを予測することを表します。',
        '配列Sから構造を再予測し、目標構造とのずれを調べます。RMSDは位置のずれの二乗平均平方根です。この展示では実際のRMSDを計算していません。'
    ][n];
    by('designSequencePanel').hidden = n !== 3;
    by('designEvaluate').hidden = n !== 4;
    by('designNext').textContent = ['次へ：原子配置 ↓', '次へ：グラフ表現 ↓', '次へ：配列設計 ↓', '次へ：構造検証 ↓', '研究と開発へ ↓'][n];
    buttons.forEach((b, i) => { b.style.setProperty('--step-progress', '0'); if (i === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    measureNav();
}

function updateScroll() {
    if (autoplay && performance.now() > programmaticScrollUntil) stopAutoplay();
    const total = Math.max(1, journey.offsetHeight - stage.offsetHeight);
    progress = Math.max(0, Math.min(1, -journey.getBoundingClientRect().top / total));
    const n = Math.min(4, Math.floor(progress * 5));
    local = Math.min(1, progress * 5 - n);
    setStep(n);
    by('designProgress').style.width = (progress * 100) + '%';
    updateSequence();
    schedule();
}

const autoplayButton = by('designAutoplay');
const replayButton = by('designReplay');
const autoplayDurations = [6500, 7500, 10000, 8000, 8500];
let autoplay = false, autoplayTimer = 0, autoplayStepStart = 0, step0IntroStart = null, programmaticScrollUntil = 0;
function syncAutoplayUI() {
    stage.dataset.autoplay = String(autoplay);
    if (autoplayButton) autoplayButton.textContent = autoplay ? '⏸ 一時停止' : '▶ 自動で再生';
    if (!autoplay) buttons.forEach(b => b.style.setProperty('--step-progress', '0'));
}
function stopAutoplay() {
    if (!autoplay && !autoplayTimer) return;
    autoplay = false; clearTimeout(autoplayTimer); autoplayTimer = 0;
    syncAutoplayUI(); schedule();
}
function scheduleAutoplayNext(targetStep) {
    clearTimeout(autoplayTimer);
    if (!autoplay) return;
    autoplayStepStart = performance.now();
    const delay = autoplayDurations[Math.max(0, Math.min(4, targetStep))] || 8000;
    autoplayTimer = setTimeout(() => {
        if (!autoplay) return;
        if (targetStep >= 4) { stopAutoplay(); return; }
        const nextStep = targetStep + 1;
        jump(nextStep);
        scheduleAutoplayNext(nextStep);
    }, delay);
}
function startAutoplay() {
    inspectSite = false; syncSiteInspect();
    autoplay = true;
    syncAutoplayUI();
    const startStep = step >= 4 ? 0 : Math.max(0, step);
    if (step >= 4) jump(0);
    else if (startStep === 0) step0IntroStart = performance.now();
    scheduleAutoplayNext(startStep);
    schedule();
}
if (autoplayButton) autoplayButton.addEventListener('click', () => { if (autoplay) stopAutoplay(); else startAutoplay(); });
if (replayButton) replayButton.addEventListener('click', () => {
    stopAutoplay();
    inspectSite = false; syncSiteInspect();
    step0IntroStart = performance.now();
    if (local >= .02) jump(0);
    schedule();
});
by('designSiteInspect').addEventListener('click', () => {
    if (!targetSurfaceAtoms.length || step !== 0) return;
    stopAutoplay(); inspectSite = !inspectSite;
    if (!inspectSite) step0IntroStart = performance.now() - siteIntroMs;
    syncSiteInspect(); schedule();
});
function jump(n) {
    programmaticScrollUntil = performance.now() + 1100;
    const top = scrollY + journey.getBoundingClientRect().top;
    const distance = journey.offsetHeight - stage.offsetHeight;
    window.scrollTo({ top: top + distance * (n === 0 ? 0 : (n + (n === 1 ? .78 : .07)) / 5), behavior: motion.matches ? 'auto' : 'smooth' });
}
buttons.forEach((b, i) => b.addEventListener('click', () => { stopAutoplay(); jump(i); }));
by('designNext').addEventListener('click', () => { stopAutoplay(); if (step === 4) document.getElementById('works').scrollIntoView({ behavior: motion.matches ? 'auto' : 'smooth' }); else jump(step + 1); });
window.addEventListener('wheel', () => { if (autoplay) stopAutoplay(); }, { passive: true });
window.addEventListener('touchstart', e => { if (autoplay && e.target !== autoplayButton) stopAutoplay(); }, { passive: true });
stage.addEventListener('pointerdown', e => { if (autoplay && e.target !== autoplayButton && !autoplayButton?.contains(e.target)) stopAutoplay(); });
window.addEventListener('keydown', e => { if (autoplay && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Space', ' ', 'Home', 'End', 'Escape'].includes(e.key)) stopAutoplay(); });

function measureNav() {
    const bottom = stage.querySelector('.design-bottom');
    stage.style.setProperty('--design-nav-height', (bottom.offsetHeight + Math.max(0, stage.getBoundingClientRect().bottom - bottom.getBoundingClientRect().bottom)) + 'px');
}

function dimensions() {
    const rect = stage.getBoundingClientRect(); measureNav();
    width = rect.width; height = rect.height; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    if (gl) gl.resize(); graphFrameKey = ''; if (graphModel) drawMatrix();
    schedule();
}

const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };

function geometry(now = performance.now()) {
    let u = 1, siteOnly = false;
    if (step === 0) {
        if (inspectSite && real) { siteOnly = true; u = 0; }
        else if (motion.matches) { u = .90; }
        else if (autoplay) {
            const elapsed = now - autoplayStepStart;
            siteOnly = real && elapsed < siteIntroMs;
            const t = clamp((elapsed - (real ? siteIntroMs : 0)) / 4800);
            u = .90 * ease(t);
        } else if (local < .02) {
            if (step0IntroStart === null) step0IntroStart = now;
            const elapsed = now - step0IntroStart;
            siteOnly = real && elapsed < siteIntroMs;
            const t = clamp((elapsed - (real ? siteIntroMs : 0)) / 4500);
            u = .90 * ease(t);
        } else {
            u = .90 * ease(local);
        }
    } else if (step === 1) {
        u = motion.matches ? 1 : .90 + .10 * ease(local / .70);
    }
    const ribbon = real && step >= 1 ? (step === 1 ? ease((u - .94) / .06) : 1) : 0;
    const coords = points.map((p, i) => { const swirl = (1 - u) * u * 1.2; return { x: noise[i].x + (p.x - noise[i].x) * u + Math.sin(i * .73) * swirl, y: noise[i].y + (p.y - noise[i].y) * u + Math.cos(i * .49) * swirl, z: noise[i].z + (p.z - noise[i].z) * u }; });
    return { u, ribbon, coords, siteOnly };
}

let lastFrame = -Infinity;
function draw(now) {
    raf = 0; if (!visible || document.hidden || !width || !height) return;
    if (!motion.matches && now - lastFrame < 24) { raf = requestAnimationFrame(draw); return; }
    lastFrame = now;
    graphTransition = step === 2 && graphFromAtoms && !motion.matches ? ease((now - graphTransitionStart) / 800) : 1;
    graphPhase = motion.matches ? .55 : (now % 1500) / 1500;
    if (autoplay && step === 3) updateSequence(now);
    if (autoplay && !motion.matches && buttons[step]) {
        const dur = autoplayDurations[step] || 8000;
        buttons[step].style.setProperty('--step-progress', clamp((now - autoplayStepStart) / dur).toFixed(3));
    }
    const g = geometry(now);
    if (step === 0) {
        const tVal = Math.max(0, 1 - g.u / .90);
        by('designTimeStep').textContent = 't = ' + tVal.toFixed(2);
    }
    stage.dataset.siteOnly = String(g.siteOnly);
    const angle = step === 0 && real ? targetSiteYaw + (motion.matches || g.siteOnly ? 0 : .16 * Math.sin(now * .00035)) : step === 2 ? graphAngle : step === 1 && real && atomicMode === 'local' ? atomicAngle + (motion.matches ? 0 : .16 * Math.sin(now * .00035)) : .52 + (motion.matches ? 0 : now * .00012);
    if (gl) { try { gl.draw(g, angle); stage.classList.add('design-gl'); } catch { gl.dispose(); gl = null; stage.classList.remove('design-gl'); } }
    if (!gl && ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
        const portrait = width < 801, wide = width >= 1280, cx = width * (step === 2 && wide ? .51 : portrait ? .50 : .67), cy = height * (portrait ? (step === 1 ? .49 : step === 2 ? .40 : step >= 3 ? .47 : .54) : step === 2 ? .43 : step >= 3 ? .34 : .45);
        const showTarget = real && targetPoints.length && (step === 0 || step === 1 || step === 4);
        const shift = showTarget ? complexShift : { x: 0, y: 0, z: 0 };
        const scale = Math.min(width * (portrait ? .040 : .035), height * (portrait ? .027 : .045)) * (showTarget ? .78 : step === 2 && wide ? .76 : 1);
        const a = Math.cos(angle), b = Math.sin(angle);
        const project = v => { const vx = v.x - shift.x, vy = v.y - shift.y, vz = v.z - shift.z; const x = vx * a + vz * b, z = -vx * b + vz * a; const k = 1 / (1 + (step === 0 || step === 2 ? -z : z) * .025); return { x: cx + x * scale * k, y: cy - (step === 2 ? vy * Math.cos(graphPitch) - z * Math.sin(graphPitch) : vy) * scale * k, z, k }; };
        const trace = (q, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length - 1; i++) ctx.quadraticCurveTo(q[i].x, q[i].y, (q[i].x + q[i + 1].x) / 2, (q[i].y + q[i + 1].y) / 2); ctx.lineTo(q.at(-1).x, q.at(-1).y); ctx.stroke(); };
        const showSurface = step === 0 && real && targetSurfaceAtoms.length > 0;
        stage.dataset.targetSurfaceVisible = String(showSurface);
        if (showSurface) {
            const atoms = targetSurfaceAtoms.map(a=>({...project(a), radius:a.radius, site:a.site})).sort((a,b)=>a.z-b.z);
            for (const a of atoms) {
                const radius = a.radius * scale * a.k;
                const gradient = ctx.createRadialGradient(a.x-radius*.30,a.y-radius*.35,0,a.x,a.y,radius);
                gradient.addColorStop(0,a.site?'#f2d39a':'#94aebc');
                gradient.addColorStop(1,a.site?'#98713e':'#344e61');
                ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(a.x,a.y,radius,0,Math.PI*2);ctx.fill();
            }
        } else if (showTarget) trace(targetPoints.map(project), 'rgba(110,148,174,.30)', 4.5);
        const p = g.coords.map(project);
        const line = (i, j, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p[i].x, p[i].y); ctx.lineTo(p[j].x, p[j].y); ctx.stroke(); };
        if (step === 2) { for (const [i, j] of edges) { line(i, j, j === graphPair ? '#fff0c7' : 'rgba(228,190,132,.82)', j === graphPair ? 2.5 : 1.6); if (graphMessage) { const pa = p[j], pb = p[i]; ctx.fillStyle = '#fff0c7'; ctx.beginPath(); ctx.arc(pa.x + (pb.x - pa.x) * graphPhase, pa.y + (pb.y - pa.y) * graphPhase, 3, 0, Math.PI * 2); ctx.fill(); } } if (graphModel && graphPair !== graphFocus && !graphNeighbors.has(graphPair)) { ctx.setLineDash([4, 5]); line(graphFocus, graphPair, '#b2c1c8', 1.4); ctx.setLineDash([]); } }
        if (step === 4) {
            const cmp = comparisonPoints(g.coords).map(project);
            trace(cmp, 'rgba(228,190,132,.85)', 5);
            ctx.strokeStyle = compare === 'different' ? 'rgba(242,115,102,.75)' : 'rgba(111,227,189,.45)'; ctx.lineWidth = 1.3;
            for (let i = 0; i < p.length; i += 2) { ctx.beginPath(); ctx.moveTo(p[i].x, p[i].y); ctx.lineTo(cmp[i].x, cmp[i].y); ctx.stroke(); }
        }
        if (g.u > .12) trace(p, 'rgba(127,212,209,' + (Math.pow(g.u, 1.6) * (step === 2 ? .22 : .88)) + ')', step === 1 || step === 4 ? 5 : 2.6);
        const count = step === 3 ? Math.round((motion.matches ? 1 : Math.min(1, local * 1.35)) * p.length) : 0;
        if (step === 0 && !g.siteOnly) { ctx.fillStyle = '#96bac7'; ctx.globalAlpha = .24 * (1 - g.u); for (let i = 0; i < 220; i++) { const v = project({ x: (random(i * 3 + 500) - .5) * 24, y: (random(i * 3 + 501) - .5) * 22, z: (random(i * 3 + 502) - .5) * 25 }); ctx.beginPath(); ctx.arc(v.x, v.y, .6 + random(i + 750) * 1.3, 0, Math.PI * 2); ctx.fill(); } }
        if (!g.siteOnly) p.map((v, i) => ({ ...v, i })).sort((a, b) => step === 0 ? a.z - b.z : b.z - a.z).forEach(v => { const r = (step === 2 ? (graphModel && v.i === graphFocus ? 8 : graphModel && v.i === graphPair ? 6 : graphNeighbors.has(v.i) ? 5 : 2.8) : step === 3 && v.i === selectedResidue ? 7.5 : 2.4 + g.u * 2.2) * v.k; ctx.beginPath(); ctx.arc(v.x, v.y, r, 0, Math.PI * 2); ctx.fillStyle = step === 2 ? (graphModel && v.i === graphFocus ? '#ffe1a6' : graphModel && v.i === graphPair ? '#fff0c7' : graphNeighbors.has(v.i) ? '#d5b17c' : '#63939d') : step === 3 && (v.i === selectedResidue || graphNeighbors.has(v.i) || v.i < count) ? '#e4be84' : '#7fd4d1'; ctx.globalAlpha = .7 + .25 * g.u; ctx.fill(); });
        ctx.globalAlpha = 1;
        if (step === 2) graphLabelPositions(project);
        if (step === 1 && real && g.ribbon > .94) { const q = detailAtoms.map(project); for (const [i, j] of detailBonds) { if (!visibleAtomic(detailAtoms[i]) || !visibleAtomic(detailAtoms[j])) continue; ctx.strokeStyle = detailAtoms[i].chain === 'B' ? '#708798' : '#8a989b'; ctx.lineWidth = atomicMode === 'local' ? 2.4 : 1.3; ctx.beginPath(); ctx.moveTo(q[i].x, q[i].y); ctx.lineTo(q[j].x, q[j].y); ctx.stroke(); } if (atomicMode === 'local') { ctx.setLineDash([4, 4]); ctx.strokeStyle = '#f2cc84'; ctx.lineWidth = 1.6; for (const [i, j] of interfaceContacts) { ctx.beginPath(); ctx.moveTo(q[i].x, q[i].y); ctx.lineTo(q[j].x, q[j].y); ctx.stroke(); } ctx.setLineDash([]); } q.map((pt, i) => ({ ...pt, i })).filter(pt => visibleAtomic(detailAtoms[pt.i])).sort((a, b) => b.z - a.z).forEach(pt => { const at = detailAtoms[pt.i]; ctx.fillStyle = (at.chain === 'B' ? targetElementColors : elementColors)[at.element]; ctx.beginPath(); ctx.arc(pt.x, pt.y, (atomicMode === 'local' ? 3.5 : 2.5) * (at.element === 'S' ? 1.25 : 1) * pt.k, 0, Math.PI * 2); ctx.fill(); }); }
    }
    if (!motion.matches && (step !== 2 || graphMessage || graphTransition < 1 || autoplay)) raf = requestAnimationFrame(draw);
}
function schedule() { if (visible && !raf) raf = requestAnimationFrame(draw); }

// Rotation-minimizing Bishop (parallel-transport) ribbon frames avoid Frenet twists/pinches.
function makeRibbon(T, coords, labels, palette = null) {
    const curve = new T.CatmullRomCurve3(coords.map(p => new T.Vector3(p.x, p.y, p.z)), false, 'centripetal');
    const segments = (coords.length - 1) * 12, sides = 12;
    const tangents = [], normals = [], binormals = [];
    for (let k = 0; k <= segments; k++) tangents.push(curve.getTangentAt(k / segments).normalize());
    const up = Math.abs(tangents[0].y) < .9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
    normals.push(new T.Vector3().crossVectors(tangents[0], up).normalize());
    binormals.push(new T.Vector3().crossVectors(tangents[0], normals[0]).normalize());
    const axis = new T.Vector3();
    for (let k = 1; k <= segments; k++) {
        const prevT = tangents[k - 1], currT = tangents[k], n = normals[k - 1].clone();
        axis.crossVectors(prevT, currT);
        const sinA = axis.length();
        if (sinA > 1e-5) {
            const angle = Math.acos(Math.max(-1, Math.min(1, prevT.dot(currT))));
            n.applyAxisAngle(axis.normalize(), angle);
        }
        n.addScaledVector(currT, -n.dot(currT)).normalize();
        normals.push(n);
        binormals.push(new T.Vector3().crossVectors(currT, n).normalize());
    }
    const sampleWidth = ix => {
        const i0 = Math.max(0, Math.min(coords.length - 1, Math.floor(ix))), i1 = Math.min(coords.length - 1, i0 + 1), f = ix - i0;
        const wFor = ss => ss === 'helix' ? .36 : ss === 'sheet' ? .42 : .10;
        const hFor = ss => ss === 'loop' ? .10 : .068;
        const ss0 = labels[i0]?.ss || 'loop', ss1 = labels[i1]?.ss || 'loop';
        let w = wFor(ss0) + (wFor(ss1) - wFor(ss0)) * f;
        const h = hFor(ss0) + (hFor(ss1) - hFor(ss0)) * f;
        const nearest = Math.min(coords.length - 1, Math.floor(ix + .5)), ss = labels[nearest]?.ss || 'loop';
        if (ss === 'sheet') {
            let end = nearest; while (end + 1 < labels.length && labels[end + 1].ss === 'sheet') end++;
            const distance = end + .48 - ix;
            if (distance < 1.3) w *= distance < .48 ? Math.max(.14, distance / .48) * 1.55 : 1 + .55 * (1.3 - distance) / .82;
        }
        return { w, h, ss };
    };
    const pos = [], indices = [], colors = []; const color = new T.Color();
    const pal = palette || { helix: '#8ee4de', sheet: '#6eb5c2', loop: '#5a91a4' };
    for (let k = 0; k <= segments; k++) {
        const t = k / segments, p = curve.getPointAt(t), n = normals[k], b = binormals[k];
        const ix = curve.getUtoTmapping(t) * (coords.length - 1);
        const { w, h, ss } = sampleWidth(ix);
        color.set(pal[ss] || pal.loop);
        for (let s = 0; s < sides; s++) {
            const a = s / sides * Math.PI * 2;
            const v = p.clone().addScaledVector(n, Math.cos(a) * w).addScaledVector(b, Math.sin(a) * h);
            pos.push(v.x, v.y, v.z); colors.push(color.r, color.g, color.b);
        }
        if (k > 0) for (let s = 0; s < sides; s++) {
            const a = (k - 1) * sides + s, b0 = (k - 1) * sides + (s + 1) % sides, c = k * sides + s, d = k * sides + (s + 1) % sides;
            indices.push(a, b0, c, b0, d, c);
        }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function makeStudioEnv(T, renderer) {
    const pmrem = new T.PMREMGenerator(renderer);
    const envScene = new T.Scene();
    const panel = (w, h, pos, rot, color, intensity) => {
        const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity), side: T.DoubleSide }));
        m.position.set(...pos); m.rotation.set(...rot); envScene.add(m);
    };
    panel(14, 8, [-7, 7, 8], [.55, -.65, 0], 0xfff3e0, 2.2);
    panel(12, 10, [9, 3, -7], [.2, 2.2, 0], 0x7ed9e2, 2.0);
    panel(16, 16, [0, -9, 0], [-Math.PI / 2, 0, 0], 0x162635, 1.1);
    panel(10, 6, [0, 10, 0], [Math.PI / 2, 0, 0], 0xdaf5f4, 1.6);
    const rt = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    return rt;
}

function makeGlowSprite(T) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(218,246,245,1)');
    grad.addColorStop(.32, 'rgba(127,212,209,.62)');
    grad.addColorStop(.7, 'rgba(127,212,209,.12)');
    grad.addColorStop(1, 'rgba(127,212,209,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex;
}

function initGL(T) {
    const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setClearColor(0x070c12, 0);
    webgl.append(renderer.domElement);

    const scene = new T.Scene(), camera = new T.PerspectiveCamera(42, 1, .1, 120), group = new T.Group(), inner = new T.Group();
    const envRT = makeStudioEnv(T, renderer);
    scene.environment = envRT.texture;
    group.add(inner);
    scene.add(group);
    scene.add(new T.HemisphereLight(0xd2f7f4, 0x1a2c3d, 0.9));
    const key = new T.DirectionalLight(0xfff1dc, 2.2); key.position.set(-6, 9, 12); scene.add(key);
    const rim = new T.DirectionalLight(0x7fd4e2, 2.4); rim.position.set(8, 4, -9); scene.add(rim);
    const fill = new T.DirectionalLight(0xd4b384, 0.85); fill.position.set(-4, -6, 6); scene.add(fill);

    const geom = new T.SphereGeometry(.115, 20, 14);
    const mat = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: .28, metalness: .06, clearcoat: .45, clearcoatRoughness: .25 });
    const ribbonMat = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: .32, metalness: .05, clearcoat: .38, clearcoatRoughness: .26, side: T.DoubleSide, transparent: true });
    const targetRibbonMat = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: .42, metalness: .04, clearcoat: .24, side: T.DoubleSide, transparent: true, opacity: .34, depthWrite: false });
    const comparisonMat = new T.MeshPhysicalMaterial({ color: 0xe8c186, roughness: .36, metalness: .06, clearcoat: .3, clearcoatRoughness: .3, side: T.DoubleSide, transparent: true, opacity: .82, depthWrite: false });
    const glowTex = makeGlowSprite(T);
    const dustGeo = new T.BufferGeometry();
    dustGeo.setAttribute('position', new T.Float32BufferAttribute(Array.from({ length: 340 * 3 }, (_, i) => (random(i + 5000) - .5) * 26), 3));
    const dustMat = new T.PointsMaterial({ map: glowTex, color: 0xaad8de, size: .28, transparent: true, opacity: .45, depthWrite: false, blending: T.AdditiveBlending });
    const dust = new T.Points(dustGeo, dustMat); group.add(dust);

    const surfaceGeo = new T.SphereGeometry(1, 16, 12);
    const surfaceMat = new T.MeshStandardMaterial({ roughness: .72, metalness: .02 });
    let targetSurface = null;
    const atomGeo = new T.SphereGeometry(.13, 18, 12);
    const atomMat = new T.MeshPhysicalMaterial({ roughness: .26, metalness: .08, clearcoat: .5, clearcoatRoughness: .2 });
    const bondGeo = new T.CylinderGeometry(.042, .042, 1, 10);
    const bondMat = new T.MeshPhysicalMaterial({ color: 0xc9d7db, roughness: .35, metalness: .1, clearcoat: .3 });
    const rodGeo = new T.CylinderGeometry(.068, .068, 1, 14);
    const rodMat = new T.MeshPhysicalMaterial({ color: 0x76c2c4, roughness: .32, metalness: .06, clearcoat: .35 });
    const devBeamGeo = new T.CylinderGeometry(.032, .032, 1, 8);
    const devBeamMat = new T.MeshBasicMaterial({ color: 0xf27366, transparent: true, opacity: .82 });

    // 3D schematic sidechain group for Step 04 (ProteinMPNN A / V / S live morph on focal residue)
    const sidechainGroup = new T.Group();
    const scSphereGeo = new T.SphereGeometry(.22, 18, 12);
    const scBondGeo = new T.CylinderGeometry(.062, .062, 1, 10);
    const scCarbonMat = new T.MeshPhysicalMaterial({ color: 0xeec480, roughness: .24, metalness: .08, clearcoat: .5 });
    const scOxygenMat = new T.MeshPhysicalMaterial({ color: 0xf07a6d, roughness: .22, metalness: .06, clearcoat: .55 });
    const scBondMat = new T.MeshPhysicalMaterial({ color: 0xe5d7be, roughness: .30, metalness: .1, clearcoat: .35 });
    const scHaloRing = new T.Mesh(new T.TorusGeometry(.48, .022, 10, 40), new T.MeshBasicMaterial({ color: 0xf5d49b, transparent: true, opacity: .82 }));
    inner.add(sidechainGroup);

    const yAxis = new T.Vector3(0, 1, 0), from = new T.Vector3(), to = new T.Vector3(), delta = new T.Vector3();
    const obj = new T.Object3D(), teal = new T.Color('#80d4d1'), gold = new T.Color('#ebb971'), graphMuted = new T.Color('#426675'), graphGold = new T.Color('#d6ac6d'), graphIvory = new T.Color('#fff0c7'), projected = new T.Vector3();
    const graphRodGeo = new T.CylinderGeometry(.026, .026, 1, 12), graphRodMat = new T.MeshBasicMaterial({ color: 0xffffff });
    let graphRods = null, graphSignals = null, graphDashed = null, polarLines = null, devBeams = null;
    const signalGeo = new T.SphereGeometry(.072, 12, 8), signalMat = new T.MeshBasicMaterial({ color: 0xffe6a5 });
    let spheres = null, lines = null, trails = null, compareLine = null, backbone = null, ribbon = null, targetRibbon = null, comparisonRibbon = null, atomDetail = null, bondDetail = null, atomicRenderMode = null, lastCompare = null;

    function addScSegment(a, b) {
        delta.subVectors(b, a); const len = delta.length();
        const rod = new T.Mesh(scBondGeo, scBondMat);
        rod.position.copy(a).add(b).multiplyScalar(.5);
        rod.quaternion.setFromUnitVectors(yAxis, delta.clone().normalize());
        rod.scale.set(1, len, 1);
        sidechainGroup.add(rod);
    }

    function updateSidechain() {
        while (sidechainGroup.children.length) sidechainGroup.remove(sidechainGroup.children[0]);
        if (!points.length || !points[selectedResidue]) return;
        const p = points[selectedResidue];
        const origin = new T.Vector3(p.x, p.y, p.z);
        const out = origin.clone().normalize();
        if (out.lengthSq() < .01) out.set(0, 0, 1);
        const refUp = Math.abs(out.y) < .85 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
        const u = new T.Vector3().crossVectors(out, refUp).normalize();
        const v = new T.Vector3().crossVectors(out, u).normalize();
        const cb = origin.clone().addScaledVector(out, .82);
        addScSegment(origin, cb);
        const cbMesh = new T.Mesh(scSphereGeo, scCarbonMat); cbMesh.position.copy(cb); sidechainGroup.add(cbMesh);
        if (choice === 'V') {
            const cg1 = cb.clone().addScaledVector(out, .58).addScaledVector(u, .52);
            const cg2 = cb.clone().addScaledVector(out, .58).addScaledVector(u, -.46).addScaledVector(v, .38);
            addScSegment(cb, cg1); addScSegment(cb, cg2);
            const m1 = new T.Mesh(scSphereGeo, scCarbonMat); m1.position.copy(cg1); sidechainGroup.add(m1);
            const m2 = new T.Mesh(scSphereGeo, scCarbonMat); m2.position.copy(cg2); sidechainGroup.add(m2);
        } else if (choice === 'S') {
            const og = cb.clone().addScaledVector(out, .58).addScaledVector(u, .42);
            addScSegment(cb, og);
            const mo = new T.Mesh(scSphereGeo, scOxygenMat); mo.position.copy(og); mo.scale.setScalar(1.08); sidechainGroup.add(mo);
        }
        scHaloRing.position.copy(origin);
        scHaloRing.lookAt(origin.clone().add(out));
        sidechainGroup.add(scHaloRing);
    }

    function updateAtomicMeshes() {
        if (!atomDetail || atomicRenderMode === atomicMode) return; atomicRenderMode = atomicMode;
        const size = atomicMode === 'local' ? 1.05 : .78; let n = 0, m = 0;
        for (const a of detailAtoms) {
            if (!visibleAtomic(a)) continue;
            obj.position.set(a.x, a.y, a.z); obj.rotation.set(0, 0, 0);
            obj.scale.setScalar(size * (a.element === 'S' ? 1.25 : 1)); obj.updateMatrix();
            atomDetail.setMatrixAt(n, obj.matrix);
            atomDetail.setColorAt(n++, new T.Color((a.chain === 'B' ? targetElementColors : elementColors)[a.element]));
        }
        atomDetail.count = n; atomDetail.instanceMatrix.needsUpdate = true; if (atomDetail.instanceColor) atomDetail.instanceColor.needsUpdate = true;
        if (bondDetail) {
            for (const [i, j] of detailBonds) {
                const a = detailAtoms[i], b = detailAtoms[j]; if (!visibleAtomic(a) || !visibleAtomic(b)) continue;
                from.set(a.x, a.y, a.z); to.set(b.x, b.y, b.z); delta.subVectors(to, from); const len = delta.length();
                obj.position.copy(from).add(to).multiplyScalar(.5); obj.quaternion.setFromUnitVectors(yAxis, delta.normalize());
                obj.scale.set(.86, len, .86); obj.updateMatrix(); bondDetail.setMatrixAt(m++, obj.matrix);
            }
            bondDetail.count = m; bondDetail.instanceMatrix.needsUpdate = true;
        }
    }

    function rebuildGL() {
        if (targetSurface) { inner.remove(targetSurface); targetSurface.dispose(); targetSurface = null; }
        if (targetSurfaceAtoms.length) {
            targetSurface = new T.InstancedMesh(surfaceGeo, surfaceMat, targetSurfaceAtoms.length);
            targetSurface.frustumCulled = false;
            const blue = new T.Color('#648498'), site = new T.Color('#e5bc78');
            targetSurfaceAtoms.forEach((a,i)=>{
                obj.position.set(a.x,a.y,a.z); obj.rotation.set(0,0,0); obj.scale.setScalar(a.radius); obj.updateMatrix();
                targetSurface.setMatrixAt(i,obj.matrix); targetSurface.setColorAt(i,a.site?site:blue);
            });
            targetSurface.instanceMatrix.needsUpdate = true; targetSurface.instanceColor.needsUpdate = true;
            inner.add(targetSurface);
        }
        for (const m of [ribbon, targetRibbon, comparisonRibbon]) if (m) { inner.remove(m); m.geometry.dispose(); }
        ribbon = null; targetRibbon = null; comparisonRibbon = null; lastCompare = null;
        for (const m of [atomDetail, bondDetail, devBeams]) if (m) { inner.remove(m); m.dispose(); }
        atomDetail = null; bondDetail = null; devBeams = null; atomicRenderMode = null;
        if (polarLines) { inner.remove(polarLines); polarLines.geometry.dispose(); polarLines.material.dispose(); polarLines = null; }
        if (real) {
            ribbon = new T.Mesh(makeRibbon(T, points, points), ribbonMat); inner.add(ribbon);
            if (targetPoints.length) {
                targetRibbon = new T.Mesh(makeRibbon(T, targetPoints, targetPoints, { helix: '#698da3', sheet: '#52738a', loop: '#415c70' }), targetRibbonMat);
                inner.add(targetRibbon);
            }
            if (detailAtoms.length) {
                atomDetail = new T.InstancedMesh(atomGeo, atomMat, detailAtoms.length);
                atomDetail.frustumCulled = false; inner.add(atomDetail);
                if (detailBonds.length) { bondDetail = new T.InstancedMesh(bondGeo, bondMat, detailBonds.length); bondDetail.frustumCulled = false; inner.add(bondDetail); }
                updateAtomicMeshes();
            }
            if (interfaceContacts.length) {
                const pPos = new Float32Array(interfaceContacts.length * 6);
                interfaceContacts.forEach(([ia, ib], k) => {
                    const a = detailAtoms[ia], b = detailAtoms[ib];
                    pPos[k * 6] = a.x; pPos[k * 6 + 1] = a.y; pPos[k * 6 + 2] = a.z;
                    pPos[k * 6 + 3] = b.x; pPos[k * 6 + 4] = b.y; pPos[k * 6 + 5] = b.z;
                });
                const pGeo = new T.BufferGeometry(); pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3));
                polarLines = new T.LineSegments(pGeo, new T.LineDashedMaterial({ color: 0xf4cf87, dashSize: .14, gapSize: .10, transparent: true, opacity: .92 }));
                polarLines.computeLineDistances(); polarLines.frustumCulled = false; inner.add(polarLines);
            }
        }
        for (const m of [spheres, backbone, graphRods, graphSignals]) if (m) { inner.remove(m); m.dispose(); }
        for (const m of [compareLine, lines, trails, graphDashed]) if (m) { inner.remove(m); m.geometry.dispose(); m.material.dispose(); }
        backbone = new T.InstancedMesh(rodGeo, rodMat, points.length - 1); backbone.frustumCulled = false; inner.add(backbone);
        const cmpGeo = new T.BufferGeometry(); cmpGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(points.length * 3), 3));
        compareLine = new T.Line(cmpGeo, new T.LineBasicMaterial({ color: 0xe8c186, transparent: true, opacity: .95 })); compareLine.frustumCulled = false; inner.add(compareLine);
        spheres = new T.InstancedMesh(geom, mat, points.length); spheres.frustumCulled = false; inner.add(spheres);
        const lineGeo = new T.BufferGeometry(); lineGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(points.length * 3), 3));
        lines = new T.Line(lineGeo, new T.LineBasicMaterial({ color: 0x7fd4d1, transparent: true, opacity: .75 })); lines.frustumCulled = false; inner.add(lines);
        graphRods = new T.InstancedMesh(graphRodGeo, graphRodMat, Math.max(1, raw.length - 1)); graphRods.frustumCulled = false; graphRods.count = edges.length; inner.add(graphRods);
        graphSignals = new T.InstancedMesh(signalGeo, signalMat, Math.max(1, raw.length - 1)); graphSignals.frustumCulled = false; inner.add(graphSignals);
        const dashedGeo = new T.BufferGeometry(); dashedGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3)); graphDashed = new T.Line(dashedGeo, new T.LineDashedMaterial({ color: 0xb2c1c8, dashSize: .13, gapSize: .12, transparent: true, opacity: .8 })); graphDashed.frustumCulled = false; inner.add(graphDashed);
        devBeams = new T.InstancedMesh(devBeamGeo, devBeamMat, points.length); devBeams.frustumCulled = false; inner.add(devBeams);
        const trailGeo = new T.BufferGeometry(); trailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(points.length * 6), 3));
        trails = new T.LineSegments(trailGeo, new T.LineBasicMaterial({ color: 0x7fd4d1, transparent: true, opacity: .22 })); trails.frustumCulled = false; inner.add(trails);
        updateSidechain();
    }

    function resize() { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }

    function render(g, angle) {
        const portrait = width < 801;
        const showTarget = real && !!targetRibbon && (step === 0 || step === 1 || step === 4);
        inner.position.set(showTarget ? -complexShift.x : 0, showTarget ? -complexShift.y : 0, showTarget ? -complexShift.z : 0);

        const depth = step === 0 ? 1 - ease(local) : 0;
        const mobileDistance = Math.max(31, 9.4 / (Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
        const complexBoost = showTarget ? 1.24 : 1;
        const desktopDistance = (step === 2 ? (width >= 1280 ? Math.max(25, 12.4 / (2 * Math.tan(camera.fov * Math.PI / 360) * camera.aspect * .39)) : 20.8) : step >= 3 ? 22.8 : 20.4) * complexBoost;
        camera.position.set(0, 0, (step === 1 && real ? (portrait ? (atomicMode === 'local' ? Math.max(25, mobileDistance * .84) : mobileDistance * 1.05) : 24.4) : (portrait ? (step === 2 ? Math.max(23, mobileDistance * .76) : mobileDistance * complexBoost) : desktopDistance)) + depth * 3.0);
        camera.lookAt(0, 0, 0);
        camera.setViewOffset(
            width, height,
            portrait ? 0 : step === 2 && width >= 1280 ? -Math.round(width * .01) : -Math.round(width * .17),
            portrait ? Math.round(height * (step === 1 ? .015 : step === 2 ? .10 : step >= 3 ? .015 : -.075)) : Math.round(height * (step >= 3 ? .14 : .035)),
            width, height
        );
        group.rotation.y = angle;
        group.rotation.x = step === 2 ? graphPitch : step === 1 && real ? .10 : .20 + .10 * Math.sin(progress * Math.PI);
        key.color.set(step === 1 ? 0xf1f6ff : 0xfff1dc); rim.intensity = step === 1 ? 1.35 : 2.4;

        if (targetRibbon) {
            targetRibbon.visible = showTarget && !(step === 0 && targetSurface);
            targetRibbonMat.opacity = step === 1 ? (atomicMode === 'local' ? .38 : .26) : step === 0 ? .34 : .26;
        }
        if (targetSurface) targetSurface.visible = step === 0 && real;
        stage.dataset.targetSurfaceVisible = String(!!targetSurface && targetSurface.visible);
        dust.visible = step === 0 && !g.siteOnly;
        dustMat.opacity = .48 * (1 - g.u * .75);
        trails.visible = step === 0 && !g.siteOnly && g.u < .92;
        if (trails.visible) {
            g.coords.forEach((p, i) => {
                const t0 = noise[i];
                trails.geometry.attributes.position.setXYZ(i * 2, p.x, p.y, p.z);
                trails.geometry.attributes.position.setXYZ(i * 2 + 1, p.x + (points[i].x - t0.x) * .16, p.y + (points[i].y - t0.y) * .16, p.z + (points[i].z - t0.z) * .16);
            });
            trails.geometry.attributes.position.needsUpdate = true;
            trails.material.opacity = .18 + .22 * Math.sin(g.u * Math.PI);
        }
        const seqProgress = motion.matches ? 1 : autoplay && step === 3 ? clamp((performance.now() - autoplayStepStart) / 3600) : Math.min(1, local * 1.35);
        const count = step === 3 ? Math.round(seqProgress * points.length) : 0;
        g.coords.forEach((p, i) => {
            obj.position.set(p.x, p.y, p.z); obj.rotation.set(0, 0, 0);
            obj.scale.setScalar(step === 2 ? (graphModel && i === graphFocus ? 2.8 : graphModel && i === graphPair ? 2.2 : graphNeighbors.has(i) ? 1.65 : .92) : step === 3 ? (i === selectedResidue ? 2.75 : graphNeighbors.has(i) ? 1.65 : 1.15) : .88 + g.u * .72);
            obj.updateMatrix();
            spheres.setMatrixAt(i, obj.matrix);
            spheres.setColorAt(i, step === 2 ? (graphModel && i === graphFocus ? graphIvory : graphModel && i === graphPair ? graphIvory : graphNeighbors.has(i) ? graphGold : graphMuted) : step === 3 ? (i === selectedResidue ? graphIvory : graphNeighbors.has(i) || i < count ? gold : teal) : teal);
            lines.geometry.attributes.position.setXYZ(i, p.x, p.y, p.z);
        });
        spheres.visible = !g.siteOnly && !(real && (step === 1 || step === 4) && g.ribbon > .94);
        spheres.instanceMatrix.needsUpdate = true;
        spheres.instanceColor.needsUpdate = true;
        lines.geometry.attributes.position.needsUpdate = true;
        lines.visible = g.u > .12 && step < 2 && !(step === 1 && real && g.ribbon > .94);
        lines.material.opacity = Math.pow(g.u, 1.6) * .86;
        backbone.visible = step >= 1 && (!real || g.ribbon < .15 || step === 3);
        if (ribbon) { ribbon.visible = (step === 1 || step === 2 || step === 4) && g.ribbon > .02; ribbonMat.opacity = step === 1 ? g.ribbon * (atomicMode === 'all' ? .18 : .40) : step === 2 ? (.14 + .24 * (1 - graphTransition)) : g.ribbon; ribbonMat.depthWrite = step !== 1 && step !== 2 && g.ribbon > .85; }
        const showDetail = step === 1 && g.ribbon > .94 || step === 2 && graphFromAtoms && graphTransition < 1;
        atomMat.transparent = step === 2; bondMat.transparent = step === 2; atomMat.opacity = step === 2 ? 1 - graphTransition : 1; bondMat.opacity = atomMat.opacity; atomMat.depthWrite = step !== 2; bondMat.depthWrite = step !== 2;
        if (atomDetail) { updateAtomicMeshes(); atomDetail.visible = showDetail; }
        if (bondDetail) bondDetail.visible = showDetail;
        if (polarLines) polarLines.visible = step === 1 && g.ribbon > .94 && atomicMode === 'local';
        sidechainGroup.visible = step === 3 && real;
        const ribbonState = String(!!ribbon && ribbon.visible);
        if (stage.dataset.ribbonVisible !== ribbonState) stage.dataset.ribbonVisible = ribbonState;
        for (let i = 1; i < g.coords.length; i++) {
            const a = g.coords[i - 1], b = g.coords[i];
            from.set(a.x, a.y, a.z); to.set(b.x, b.y, b.z); delta.subVectors(to, from);
            const len = delta.length();
            obj.position.copy(from).add(to).multiplyScalar(.5);
            obj.quaternion.setFromUnitVectors(yAxis, delta.normalize());
            obj.scale.set(1, len, 1); obj.updateMatrix();
            backbone.setMatrixAt(i - 1, obj.matrix);
        }
        backbone.instanceMatrix.needsUpdate = true;
        compareLine.visible = step === 4 && !real;
        if (step === 4 && real && lastCompare !== compare) {
            if (comparisonRibbon) { inner.remove(comparisonRibbon); comparisonRibbon.geometry.dispose(); }
            comparisonRibbon = new T.Mesh(makeRibbon(T, comparisonPoints(points), points), comparisonMat);
            inner.add(comparisonRibbon); lastCompare = compare;
        }
        if (comparisonRibbon) comparisonRibbon.visible = step === 4;
        if (devBeams) {
            devBeams.visible = step === 4 && real;
            if (devBeams.visible) {
                const cmp = comparisonPoints(g.coords);
                devBeamMat.color.set(compare === 'different' ? 0xf27366 : 0x6fe3bd);
                devBeamMat.opacity = compare === 'different' ? .84 : .46;
                for (let i = 0; i < g.coords.length; i++) {
                    const a = g.coords[i], b = cmp[i];
                    from.set(a.x, a.y, a.z); to.set(b.x, b.y, b.z); delta.subVectors(to, from);
                    const len = delta.length();
                    if (len > .04) {
                        obj.position.copy(from).add(to).multiplyScalar(.5);
                        obj.quaternion.setFromUnitVectors(yAxis, delta.normalize());
                        obj.scale.set(1, len, 1);
                    } else obj.scale.set(0, 0, 0);
                    obj.updateMatrix();
                    devBeams.setMatrixAt(i, obj.matrix);
                }
                devBeams.instanceMatrix.needsUpdate = true;
            }
        }
        if (step === 4 && !real) {
            comparisonPoints(g.coords).forEach((v, i) => compareLine.geometry.attributes.position.setXYZ(i, v.x, v.y, v.z));
            compareLine.geometry.attributes.position.needsUpdate = true;
        }
        graphRods.visible = step === 2 && !!graphModel; graphRods.count = edges.length;
        graphSignals.visible = graphRods.visible && graphMessage; graphSignals.count = edges.length;
        graphDashed.visible = graphRods.visible && graphPair !== graphFocus && !graphNeighbors.has(graphPair);
        if (graphDashed.visible) { const a = g.coords[graphFocus], b = g.coords[graphPair], attr = graphDashed.geometry.attributes.position; attr.setXYZ(0, a.x, a.y, a.z); attr.setXYZ(1, b.x, b.y, b.z); attr.needsUpdate = true; graphDashed.computeLineDistances(); }
        if (graphRods.visible) {
            edges.forEach(([i, j], k) => {
                const a = g.coords[i], b = g.coords[j];
                from.set(a.x, a.y, a.z); to.set(b.x, b.y, b.z); delta.subVectors(to, from);
                const len = delta.length(); obj.position.copy(from).add(to).multiplyScalar(.5);
                obj.quaternion.setFromUnitVectors(yAxis, delta.normalize());
                const weight = (j === graphPair ? 1.55 : .84) * Math.max(.02, graphTransition);
                obj.scale.set(weight, len, weight); obj.updateMatrix();
                graphRods.setMatrixAt(k, obj.matrix); graphRods.setColorAt(k, j === graphPair ? graphIvory : graphGold);
                if (graphMessage) { obj.position.set(b.x + (a.x - b.x) * graphPhase, b.y + (a.y - b.y) * graphPhase, b.z + (a.z - b.z) * graphPhase); obj.rotation.set(0, 0, 0); obj.scale.setScalar(1); obj.updateMatrix(); graphSignals.setMatrixAt(k, obj.matrix); }
            });
            graphRods.instanceMatrix.needsUpdate = true; if (graphRods.instanceColor) graphRods.instanceColor.needsUpdate = true; if (graphMessage) graphSignals.instanceMatrix.needsUpdate = true;
        }
        if (step === 2) { inner.updateMatrixWorld(true); camera.updateMatrixWorld(true); graphLabelPositions(p => { projected.set(p.x, p.y, p.z).applyMatrix4(inner.matrixWorld).project(camera); return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, z: projected.z }; }); }
        renderer.render(scene, camera);
    }

    function dispose() {
        scene.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        surfaceGeo.dispose(); surfaceMat.dispose(); glowTex.dispose(); envRT.dispose(); renderer.dispose(); webgl.replaceChildren();
    }
    renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); dispose(); gl = null; stage.classList.remove('design-gl'); schedule(); }, { once: true });
    rebuildGL(); resize(); return { draw: render, rebuild: rebuildGL, resize, dispose, updateSidechain };
}

const residueNames = { A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val' };
function residueLabel(i) { return (residueNames[raw[i]?.aa] || '?') + (raw[i]?.resseq ?? (i + 1)); }
function renderGraphUI(pair) {
    by('designGraphPairTitle').textContent = residueLabel(graphFocus) + ' — ' + residueLabel(graphPair);
    by('designGraphFocusLabel').textContent = residueLabel(graphFocus).toUpperCase();
    by('designGraphPairLabel').textContent = residueLabel(graphPair).toUpperCase();
    by('designGraphRank').textContent = pair.self ? '同じ残基' : pair.isNeighbor ? '距離の近い順に' + pair.rank + '番目（近傍内）' : '距離の近い順に' + pair.rank + '番目（近傍外）';
    by('designGraphKValue').textContent = String(graphK); by('designGraphK').value = String(graphK);
    for (const [id, selected] of [['designGraphFocusSelect', graphFocus], ['designGraphPairSelect', graphPair]]) {
        const select = by(id);
        if (select.options.length !== raw.length) { select.replaceChildren(...raw.map((_, i) => new Option(residueLabel(i), String(i)))); }
        select.value = String(selected);
    }
    const track = by('designGraphSequence');
    if (track.children.length !== raw.length) { track.replaceChildren(...raw.map((r, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = r.aa; b.dataset.residue = String(i); b.title = residueLabel(i); b.setAttribute('aria-label', residueLabel(i) + ' を注目残基に選択'); b.addEventListener('click', () => selectGraph(i)); return b; })); }
    [...track.children].forEach((b, i) => { b.classList.toggle('near', graphNeighbors.has(i)); b.classList.toggle('pair', i === graphPair); b.setAttribute('aria-pressed', String(i === graphFocus)); });
    by('designMatrixReadout').textContent = residueLabel(graphFocus) + ' → ' + residueLabel(graphPair) + ' · ' + pair.distance.toFixed(2) + ' Å · ' + (pair.self ? '同一残基' : pair.isNeighbor ? '近傍内' : '近傍外');
    for (const b of stage.querySelectorAll('[data-matrix-mode]')) b.setAttribute('aria-pressed', String(b.dataset.matrixMode === graphMode));
    by('designMatrixLegend').textContent = graphMode === 'adj' ? '近い残基：1（青緑・金）／ その他：0（暗色）／ 同じ残基：灰色' : 'Cα間距離：明るいほど近い（0〜24 Å以上）';
    drawMatrix(); if (by('designGraphDetail').open) renderAtomDetail();
}
function selectGraph(i, j = null) {
    if (!graphGeometry || !Number.isInteger(i) || i < 0 || i >= raw.length) return;
    graphFocus = i; graphPair = j === null ? graphGeometry.rankings[i][Math.min(6, graphK - 1)] : Math.max(0, Math.min(raw.length - 1, j));
    updateGraphStudy(false); updateSequence(); schedule();
}
function setMatrixOpen(open) {
    graphFrameKey = '';
    graphMatrixOpen = open; stage.classList.toggle('graph-matrix-open', open);
    by('designGraphMatrixOpen').setAttribute('aria-expanded', String(open));
    if (open) { drawMatrix(); by('designMatrixCanvas').focus({ preventScroll: true }); } schedule();
}
const matrixCanvas = by('designMatrixCanvas'), matrixContext = matrixCanvas.getContext('2d');
const matrixOrigin = 30, matrixSpan = 276;
function drawMatrix() {
    if (!graphModel || !matrixContext) return;
    const ctx = matrixContext, n = graphModel.size, cell = matrixSpan / n;
    ctx.clearRect(0, 0, 320, 320); ctx.fillStyle = '#10232e'; ctx.fillRect(matrixOrigin, matrixOrigin, matrixSpan, matrixSpan);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const active = graphModel.adjacency[i][j] === 1, d = graphGeometry.distances[i][j];
        if (graphMode === 'adj') ctx.fillStyle = i === j ? '#566a74' : active ? (i === graphFocus ? '#e5bc7e' : '#568a92') : '#1b303b';
        else { const t = Math.max(0, 1 - d / 24); ctx.fillStyle = 'rgb(' + Math.round(23 + 155 * t) + ',' + Math.round(43 + 173 * t) + ',' + Math.round(55 + 161 * t) + ')'; }
        ctx.fillRect(matrixOrigin + j * cell, matrixOrigin + i * cell, Math.max(1, cell - .35), Math.max(1, cell - .35));
    }
    ctx.font = '9px monospace'; ctx.fillStyle = '#a4bbc2'; ctx.textAlign = 'center';
    for (const i of [0, 14, 29, 44, n - 1]) { ctx.fillText(String(i + 1), matrixOrigin + (i + .5) * cell, 22); ctx.fillText(String(i + 1), 15, matrixOrigin + (i + .8) * cell); }
    ctx.strokeStyle = '#e6be81'; ctx.lineWidth = 1.2; ctx.strokeRect(matrixOrigin - .5, matrixOrigin + graphFocus * cell - .5, matrixSpan + 1, cell + 1);
    ctx.strokeStyle = '#fff1cc'; ctx.lineWidth = 1.8; ctx.strokeRect(matrixOrigin + graphPair * cell - .5, matrixOrigin + graphFocus * cell - .5, cell + 1, cell + 1);
    ctx.fillStyle = '#b1c4c9'; ctx.fillText('列 j →', 170, 316); ctx.fillText('i ↓', 12, 12);
    matrixCanvas.dataset.focus = String(raw[graphFocus].resseq); matrixCanvas.dataset.pair = String(raw[graphPair].resseq); matrixCanvas.dataset.mode = graphMode;
    matrixCanvas.setAttribute('aria-label', '残基間行列 ' + residueLabel(graphFocus) + ' と ' + residueLabel(graphPair) + '。矢印キーでペアを選択');
}
matrixCanvas.addEventListener('click', e => { if (!graphModel) return; const r = matrixCanvas.getBoundingClientRect(), x = (e.clientX - r.left) * 320 / r.width, y = (e.clientY - r.top) * 320 / r.height, j = Math.floor((x - matrixOrigin) * graphModel.size / matrixSpan), i = Math.floor((y - matrixOrigin) * graphModel.size / matrixSpan); if (i >= 0 && j >= 0 && i < graphModel.size && j < graphModel.size) selectGraph(i, j); });
matrixCanvas.addEventListener('keydown', e => { const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]; if (!delta || !graphModel) return; e.preventDefault(); selectGraph(Math.max(0, Math.min(raw.length - 1, graphFocus + delta[0])), Math.max(0, Math.min(raw.length - 1, graphPair + delta[1]))); });
by('designGraphFocusSelect').addEventListener('change', e => selectGraph(Number(e.target.value)));
by('designGraphPairSelect').addEventListener('change', e => selectGraph(graphFocus, Number(e.target.value)));
by('designGraphK').addEventListener('input', e => { graphK = Number(e.target.value); updateGraphStudy(false); schedule(); });
for (const b of stage.querySelectorAll('[data-matrix-mode]')) b.addEventListener('click', () => { graphMode = b.dataset.matrixMode; updateGraphStudy(false); });
by('designGraphMatrixOpen').addEventListener('click', () => setMatrixOpen(!graphMatrixOpen));
function closeGraphMatrix() { setMatrixOpen(false); by('designGraphMatrixOpen').focus({ preventScroll: true }); }
by('designGraphMatrixClose').addEventListener('click', closeGraphMatrix);
by('designGraphMatrix').addEventListener('keydown', e => { if (e.key === 'Escape' && graphMatrixOpen) { e.preventDefault(); closeGraphMatrix(); } });
by('designGraphMessage').addEventListener('click', () => { graphMessage = !graphMessage; by('designGraphMessage').setAttribute('aria-pressed', String(graphMessage)); by('designGraphMessageNote').hidden = !graphMessage; schedule(); });
by('designGraphReset').addEventListener('click', () => { graphK = DEFAULT_K; graphMode = 'adj'; graphAngle = graphInitialAngle; graphPitch = .20; graphMessage = false; by('designGraphMessage').setAttribute('aria-pressed', 'false'); by('designGraphMessageNote').hidden = true; selectGraph(DEFAULT_FOCUS, DEFAULT_PAIR); });
let drag = null;
const hit = by('designGraphHit');
hit.addEventListener('pointerdown', e => { if (!graphModel || e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, angle: graphAngle, pitch: graphPitch, moved: false }; hit.setPointerCapture(e.pointerId); });
hit.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 6) drag.moved = true; if (drag.moved) { graphAngle = drag.angle + dx * .009; graphPitch = Math.max(-1.2, Math.min(1.2, drag.pitch + dy * .006)); schedule(); } });
hit.addEventListener('pointercancel', () => { drag = null; });
hit.addEventListener('pointerup', e => { if (!drag) return; const moved = drag.moved; drag = null; if (moved) return; const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let nearest = -1, best = Infinity; graphProjected.forEach((p, i) => { const d = Math.hypot(x - p.x, y - p.y); if (d < best) { best = d; nearest = i; } }); if (best < 22) selectGraph(nearest); });
const atomNames = ['N', 'Cα', 'C', 'O', 'Cβ*'];
function renderAtomDetail() {
    const host = by('designGraphAtomTable'), values = geometryModule?.pairAtomDistances(raw[graphFocus], raw[graphPair]); host.replaceChildren();
    by('designGraphRbf').replaceChildren(); by('designGraphRbfLabel').textContent = '';
    if (!values) { host.textContent = '主鎖原子が不足しているため計算できません。'; return; }
    const table = document.createElement('table'), head = table.createTHead().insertRow(); head.append(document.createElement('th'));
    for (const label of atomNames) { const th = document.createElement('th'); th.textContent = label; th.scope = 'col'; head.append(th); }
    const body = table.createTBody();
    values.forEach((row, i) => { const tr = body.insertRow(), th = document.createElement('th'); th.textContent = atomNames[i]; th.scope = 'row'; tr.append(th); row.forEach((d, j) => { const td = tr.insertCell(), b = document.createElement('button'); b.type = 'button'; b.textContent = d.toFixed(2); b.style.setProperty('--distance-shade', String(Math.max(.06, 1 - d / 24))); b.setAttribute('aria-label', atomNames[i] + ' から ' + atomNames[j] + ' ' + d.toFixed(2) + ' Å'); b.addEventListener('click', () => showRbf(i, j, d)); td.append(b); }); });
    host.append(table); showRbf(1, 1, values[1][1]);
}
function showRbf(i, j, d) {
    by('designGraphRbfLabel').textContent = residueLabel(graphFocus) + ' ' + atomNames[i] + ' — ' + residueLabel(graphPair) + ' ' + atomNames[j] + ' の距離：' + d.toFixed(2) + ' Å（RBF特徴量）';
    by('designGraphRbf').replaceChildren(...geometryModule.distanceRbf(d).map(r => { const el = document.createElement('span'); el.style.setProperty('--rbf', String(r.value)); el.title = '中心 ' + r.center.toFixed(2) + ' Å: ' + r.value.toFixed(4); el.setAttribute('aria-label', el.title); return el; }));
}
by('designGraphDetailOpen').addEventListener('click', () => { renderAtomDetail(); by('designGraphDetail').showModal(); });
by('designGraphDetailClose').addEventListener('click', () => by('designGraphDetail').close());

updateEvalSummary();
rebuild(); dimensions(); updateScroll();
if ('ResizeObserver' in window) new ResizeObserver(measureNav).observe(stage.querySelector('.design-bottom'));
window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', () => { dimensions(); updateScroll(); }, { passive: true });
if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) schedule(); else { if (autoplay) stopAutoplay(); if (raf) { cancelAnimationFrame(raf); raf = 0; } } }, { threshold: .01 }).observe(stage);
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (autoplay) stopAutoplay(); if (raf) { cancelAnimationFrame(raf); raf = 0; } } else schedule(); });
motion.addEventListener?.('change', () => { if (motion.matches && autoplay) stopAutoplay(); updateSequence(); schedule(); });
const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
Promise.all([fetch('assets/data/8znl-ab.pdb', { signal: controller.signal }).then(r => { if (!r.ok) throw Error('PDB unavailable'); return r.text(); }), import('./design-geometry.mjs').catch(() => null)])
    .then(([pdb, module]) => {
        geometryModule = module;
        const parsed = parsePDB(pdb);
        raw = parsed.binder; targetRaw = parsed.target; real = true;
        stage.dataset.secondaryCount = String(raw.filter(p => p.ss !== 'loop').length);
        stage.dataset.designSource = '8ZNL';
        by('designDataStatus').textContent = '参照：PDB 8ZNL（実験構造）';
        if (!autoplay && step === 0 && local < .02) step0IntroStart = null;
        rebuild(); schedule();
    })
    .catch(() => {
        stage.dataset.designSource = 'schematic';
        by('designDataStatus').textContent = '参照構造なし・模式図を表示';
        updateGraphStudy(); schedule();
    })
    .finally(() => clearTimeout(timeout));
import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js').then(T => { try { gl = initGL(T); schedule(); } catch { webgl.replaceChildren(); } }).catch(() => { });
