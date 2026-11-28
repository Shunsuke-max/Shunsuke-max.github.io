// Rotation-minimizing Bishop (parallel-transport) ribbon frames avoid Frenet twists/pinches.
export function makeRibbon(T, coords, labels, palette = null) {
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

export function makeStudioEnv(T, renderer) {
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

export function makeGlowSprite(T) {
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

