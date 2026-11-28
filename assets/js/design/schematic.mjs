export function buildSidechainExample(residue,p,displayScale,choice,backboneFeatures){
    if(!residue||!p||!backboneFeatures)return null;
    const frame=backboneFeatures(residue);if(!frame)return null;
    const [n,ca,carbon,,cb]=frame;
    const toPoint=(v,element)=>({x:p.x+(v[0]-ca[0])*displayScale,y:p.y+(v[1]-ca[1])*displayScale,z:p.z+(v[2]-ca[2])*displayScale,element});
    const out=cb.map((v,i)=>v-ca[i]),norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);},u=norm(out),ref=norm(carbon.map((v,i)=>v-ca[i])),cross=norm([u[1]*ref[2]-u[2]*ref[1],u[2]*ref[0]-u[0]*ref[2],u[0]*ref[1]-u[1]*ref[0]]);
    const tip=(sign,len)=>cb.map((v,i)=>v+len*(.55*u[i]+sign*.835*cross[i]));
    const atoms=[toPoint(ca,'C'),toPoint(n,'N'),toPoint(carbon,'C'),toPoint(cb,'C')],bonds=[[0,1],[0,2],[0,3]];
    if(choice==='V'){atoms.push(toPoint(tip(1,1.52),'C'),toPoint(tip(-1,1.52),'C'));bonds.push([3,4],[3,5]);}
    if(choice==='S'){atoms.push(toPoint(tip(1,1.43),'O'));bonds.push([3,4]);}
    return {atoms,bonds};
}
export function displacedCoordinates(coords,compare) {
    const magnitude = compare === 'close' ? .22 : 1.75;
    return coords.map((p, i) => ({ x: p.x + magnitude * Math.sin(i * .29), y: p.y + magnitude * Math.cos(i * .19), z: p.z + magnitude * Math.sin(i * .17 + 1) }));
}
