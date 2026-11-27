
const stage=document.getElementById('design'), journey=document.getElementById('designJourney');
const canvas=document.getElementById('designCanvas'), webgl=document.getElementById('designWebGL');
const by=id=>document.getElementById(id);
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const chapters=[
 ['DIFFUSION','タンパク質を、\n設計する。','原子の配置から立体構造へ。立体構造からアミノ酸配列へ。スクロールして、設計の流れをたどる。','X(t) → X(0)'],
 ['RFD3','原子の配置を\n設計する。','RFdiffusion3は、設計条件に基づいて主鎖・側鎖を含む原子配置の候補を生成する。ここでは参照構造のCαを可視化する。','pθ(X | C)'],
 ['GEOMETRY','形を、\nグラフに。','近くにある残基同士の幾何学的な関係を可視化する。ProteinMPNNは主鎖の幾何情報を用いて配列を設計する。','G = (V, E)'],
 ['PROTEINMPNN','骨格から\n配列へ。','固定した主鎖に対して、アミノ酸の候補を選ぶ逆フォールディング。ここでは既知の参照配列を順に表示する。','pφ(S | Xbackbone)'],
 ['VALIDATION','設計は、\n検証から。','配列から構造を再予測し、設計時の構造との一致や信頼度を調べる。予測だけでは実際の機能は証明できない。','S → X̂ → compare']
];
const aa={ALA:'A',ARG:'R',ASN:'N',ASP:'D',CYS:'C',GLN:'Q',GLU:'E',GLY:'G',HIS:'H',ILE:'I',LEU:'L',LYS:'K',MET:'M',PHE:'F',PRO:'P',SER:'S',THR:'T',TRP:'W',TYR:'Y',VAL:'V'};
function random(n){const x=Math.sin(n*127.1+311.7)*43758.5453123;return x-Math.floor(x);}
function fallback(){return Array.from({length:46},(_,i)=>({x:Math.cos(i*.51)*2.1+Math.sin(i*.14)*5,y:Math.sin(i*.51)*2.1,z:(i-23)*.43,aa:'?'}));}
function parsePDB(pdb){const list=[],seen=new Set();for(const line of pdb.split(/\r?\n/)){if(!line.startsWith('ATOM  ')||line.slice(12,16).trim()!=='CA'||![' ','A'].includes(line[16]))continue;const key=line.slice(21,27);if(seen.has(key))continue;seen.add(key);const xyz=[30,38,46].map(k=>Number(line.slice(k,k+8)));if(xyz.some(v=>!Number.isFinite(v)))continue;list.push({x:xyz[0],y:xyz[1],z:xyz[2],aa:aa[line.slice(17,20)]||'?',residue:key.trim()});}if(list.length!==46)throw Error('Unexpected 1CRN residue count');return list;}
let raw=fallback(),real=false,points=[],noise=[],edges=[],step=-1,progress=0,local=0,visible=true,raf=0,gl=null;
let width=0,height=0,dpr=1;
const ctx=canvas.getContext('2d');
const buttons=[...stage.querySelectorAll('[data-design-jump]')];
function rebuild(){const center=['x','y','z'].map(k=>raw.reduce((s,p)=>s+p[k],0)/raw.length);const max=Math.max(...raw.map(p=>Math.hypot(p.x-center[0],p.y-center[1],p.z-center[2])));points=raw.map(p=>({x:(p.x-center[0])/max*6,y:(p.y-center[1])/max*6,z:(p.z-center[2])/max*6,aa:p.aa}));noise=points.map((p,i)=>({x:(random(i*3+1)-.5)*16,y:(random(i*3+2)-.5)*16,z:(random(i*3+3)-.5)*16}));edges=[];if(real)for(let i=0;i<raw.length;i++)for(let j=i+3;j<raw.length;j++){const a=raw[i],b=raw[j];if(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<8)edges.push([i,j]);}by('designSequence').replaceChildren(...raw.map(()=>{const s=document.createElement('span');s.textContent='·';return s;}));updateSequence();if(gl)gl.rebuild();}
function updateSequence(){const count=real&&step===3?Math.round((motion.matches?1:Math.min(1,local*1.35))*raw.length):0;by('designSequenceCount').textContent=count+' / '+raw.length;by('designSequenceLabel').textContent=real?'天然クランビンの参照配列（1CRN）':'参照配列は取得できませんでした';[...by('designSequence').children].forEach((s,i)=>{s.textContent=i<count?raw[i].aa:'·';s.classList.toggle('on',i<count);});}
function setStep(n){if(n===step)return;step=n;stage.dataset.designStep=String(n);const c=chapters[n];by('designKicker').textContent='0'+(n+1)+' / 05 — '+c[0];by('designTitle').textContent=c[1];by('designDescription').textContent=c[2];by('designFormula').textContent=c[3];by('designSequencePanel').hidden=n!==3;by('designEvaluate').hidden=n!==4;by('designNext').textContent=n===4?'研究と開発へ ↓':n===0?'構造生成へ ↓':'次の工程へ ↓';buttons.forEach((b,i)=>{if(i===n)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});}
function updateScroll(){const total=Math.max(1,journey.offsetHeight-stage.offsetHeight);progress=Math.max(0,Math.min(1,-journey.getBoundingClientRect().top/total));const n=Math.min(4,Math.floor(progress*5));local=Math.min(1,progress*5-n);setStep(n);by('designProgress').style.width=(progress*100)+'%';updateSequence();schedule();}
function jump(n){const top=scrollY+journey.getBoundingClientRect().top;const distance=journey.offsetHeight-stage.offsetHeight;window.scrollTo({top:top+distance*(n===0?0:(n+.07)/5),behavior:motion.matches?'auto':'smooth'});}
buttons.forEach((b,i)=>b.addEventListener('click',()=>jump(i)));
by('designNext').addEventListener('click',()=>step===4?document.getElementById('works').scrollIntoView({behavior:motion.matches?'auto':'smooth'}):jump(step+1));
function dimensions(){const rect=stage.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,1.6);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(gl)gl.resize();schedule();}
function geometry(){const u=step===0?(motion.matches?.82:Math.pow(Math.max(0,local),.8)*.88):step===1?.88+(motion.matches?1:local)*.12:1;return {u,coords:points.map((p,i)=>({x:noise[i].x+(p.x-noise[i].x)*u,y:noise[i].y+(p.y-noise[i].y)*u,z:noise[i].z+(p.z-noise[i].z)*u}))};}
function draw(now){raf=0;if(!visible||document.hidden||!width||!height)return;const g=geometry();const angle=.52+(motion.matches?0:now*.00012);if(gl){try{gl.draw(g,angle);stage.classList.add('design-gl');}catch{gl.dispose();gl=null;stage.classList.remove('design-gl');}}
 if(!gl&&ctx){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);const portrait=width<801,cx=width*(portrait?.50:.67),cy=height*(portrait?.53:.45);const scale=Math.min(width*(portrait?.058:.037),height*(portrait?.029:.048));const a=Math.cos(angle),b=Math.sin(angle);const p=g.coords.map(v=>{const x=v.x*a+v.z*b,z=-v.x*b+v.z*a;const k=1/(1+z*.025);return {x:cx+x*scale*k,y:cy-v.y*scale*k,z,k};});
 const line=(i,j,color,w)=>{ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(p[i].x,p[i].y);ctx.lineTo(p[j].x,p[j].y);ctx.stroke();};
 if(step===2)for(const [i,j] of edges)line(i,j,'rgba(212,179,132,.38)',1);
 for(let i=1;i<p.length;i++)line(i-1,i,'rgba(130,199,195,'+(.08+g.u*.78)+')',1+g.u*2.4);
 const count=step===3?Math.round((motion.matches?1:Math.min(1,local*1.35))*p.length):0;
 p.map((v,i)=>({...v,i})).sort((a,b)=>b.z-a.z).forEach(v=>{const r=(2.3+g.u*2.2)*v.k;ctx.beginPath();ctx.arc(v.x,v.y,r,0,Math.PI*2);ctx.fillStyle=v.i<count&&real?'#e2bb82':'#83c6c5';ctx.globalAlpha=.65+.25*g.u;ctx.fill();});ctx.globalAlpha=1;
 }
 if(!motion.matches)raf=requestAnimationFrame(draw);}
function schedule(){if(visible&&!raf)raf=requestAnimationFrame(draw);}
function initGL(T){const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(dpr);renderer.setClearColor(0x080e14,0);webgl.append(renderer.domElement);const scene=new T.Scene(),camera=new T.PerspectiveCamera(43,1,.1,100),group=new T.Group();scene.add(group);scene.add(new T.HemisphereLight(0xc7f2ee,0x23364b,2.2));const light=new T.DirectionalLight(0xffe5c2,2.8);light.position.set(-5,9,12);scene.add(light);const geom=new T.SphereGeometry(.105,12,8),mat=new T.MeshStandardMaterial({color:0xffffff,roughness:.48});let spheres=null,lines=null,links=null;const obj=new T.Object3D(),teal=new T.Color('#83c6c5'),gold=new T.Color('#e2bb82');
 function rebuildGL(){if(spheres)group.remove(spheres);if(lines){group.remove(lines);lines.geometry.dispose();lines.material.dispose();}if(links){group.remove(links);links.geometry.dispose();links.material.dispose();}spheres=new T.InstancedMesh(geom,mat,points.length);spheres.frustumCulled=false;group.add(spheres);const lineGeo=new T.BufferGeometry();lineGeo.setAttribute('position',new T.BufferAttribute(new Float32Array(points.length*3),3));lines=new T.Line(lineGeo,new T.LineBasicMaterial({color:0x83c6c5,transparent:true,opacity:.7}));lines.frustumCulled=false;group.add(lines);const edgeGeo=new T.BufferGeometry();edgeGeo.setAttribute('position',new T.BufferAttribute(new Float32Array(edges.length*6),3));links=new T.LineSegments(edgeGeo,new T.LineBasicMaterial({color:0xd4b384,transparent:true,opacity:.36}));links.frustumCulled=false;group.add(links);}
 function resize(){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
 function render(g,angle){const portrait=width<801;camera.position.set(0,0,portrait?29:21);camera.lookAt(0,0,0);camera.setViewOffset(width,height,portrait?0:-Math.round(width*.17),portrait?-Math.round(height*.03):Math.round(height*.04),width,height);group.rotation.y=angle;group.rotation.x=.22;const count=step===3?Math.round((motion.matches?1:Math.min(1,local*1.35))*points.length):0;g.coords.forEach((p,i)=>{obj.position.set(p.x,p.y,p.z);obj.scale.setScalar(.8+g.u*.85);obj.updateMatrix();spheres.setMatrixAt(i,obj.matrix);spheres.setColorAt(i,i<count&&real?gold:teal);lines.geometry.attributes.position.setXYZ(i,p.x,p.y,p.z);});spheres.instanceMatrix.needsUpdate=true;spheres.instanceColor.needsUpdate=true;lines.geometry.attributes.position.needsUpdate=true;lines.material.opacity=.08+g.u*.72;links.visible=step===2&&real;edges.forEach(([i,j],k)=>{const a=g.coords[i],b=g.coords[j];links.geometry.attributes.position.setXYZ(k*2,a.x,a.y,a.z);links.geometry.attributes.position.setXYZ(k*2+1,b.x,b.y,b.z);});links.geometry.attributes.position.needsUpdate=true;renderer.render(scene,camera);}
 function dispose(){renderer.dispose();webgl.replaceChildren();}
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();dispose();gl=null;stage.classList.remove('design-gl');schedule();},{once:true});
 rebuildGL();resize();return {draw:render,rebuild:rebuildGL,resize,dispose};}
rebuild();dimensions();updateScroll();
window.addEventListener('scroll',updateScroll,{passive:true});window.addEventListener('resize',()=>{dimensions();updateScroll();},{passive:true});
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else if(raf){cancelAnimationFrame(raf);raf=0;}},{threshold:.01}).observe(stage);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&raf){cancelAnimationFrame(raf);raf=0;}else schedule();});
motion.addEventListener?.('change',()=>{updateSequence();schedule();});
const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
fetch('https://files.rcsb.org/download/1CRN.pdb',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('PDB unavailable');return r.text();}).then(pdb=>{raw=parsePDB(pdb);real=true;stage.dataset.designSource='1CRN';by('designDataStatus').textContent='参照：PDB 1CRN / Cα 46残基・天然タンパク質';rebuild();schedule();}).catch(()=>{stage.dataset.designSource='schematic';by('designDataStatus').textContent='模式図のみ / 実験構造の取得に失敗しました';schedule();}).finally(()=>clearTimeout(timeout));
import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js').then(T=>{try{gl=initGL(T);schedule();}catch{webgl.replaceChildren();}}).catch(()=>{});
