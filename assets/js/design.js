const stage=document.getElementById('design'), journey=document.getElementById('designJourney');
const canvas=document.getElementById('designCanvas'), webgl=document.getElementById('designWebGL');
const by=id=>document.getElementById(id);
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const chapters=[
 ['DIFFUSION','タンパク質を、\n設計する。','欲しい機能から、分子の形を考える。AIはどのようにタンパク質を設計するのか。','X<sub>t</sub> → X<sub>0</sub>'],
 ['RFD3','原子の配置を\n設計する。','ランダムな原子配置から、設計条件に合う立体構造へ。RFD3は主鎖と側鎖を含む原子配置を生成します。','p<sub>θ</sub>(X | C)'],
 ['GEOMETRY','形を、\nグラフに。','配列上では離れていても、空間では隣り合う。残基の位置から、近傍関係を取り出します。','G = (V, E)'],
 ['PROTEINMPNN','骨格から\n配列へ。','形を固定し、各位置に合うアミノ酸を選ぶ。ProteinMPNNは骨格構造から配列を設計します。','p<sub>φ</sub>(S | X<sub>bb</sub>)'],
 ['VALIDATION','設計は、\n検証から。','設計した配列から構造を再予測し、元の形と比べます。一致しない候補は見直し、最終確認は実験で行います。','S → X&#x2032; → RMSD']
];
const aa={ALA:'A',ARG:'R',ASN:'N',ASP:'D',CYS:'C',GLN:'Q',GLU:'E',GLY:'G',HIS:'H',ILE:'I',LEU:'L',LYS:'K',MET:'M',PHE:'F',PRO:'P',SER:'S',THR:'T',TRP:'W',TYR:'Y',VAL:'V'};
function random(n){const x=Math.sin(n*127.1+311.7)*43758.5453123;return x-Math.floor(x);}
function fallback(){return Array.from({length:46},(_,i)=>({x:Math.cos(i*.51)*2.1+Math.sin(i*.14)*5,y:Math.sin(i*.51)*2.1,z:(i-23)*.43,aa:'?'}));}
function parsePDB(pdb){
 const list=[],seen=new Set(),ranges=[],atomMap=new Map();
 for(const line of pdb.split(/\r?\n/)){
  if(line.startsWith('HELIX '))ranges.push({kind:'helix',chain:line[19],from:Number(line.slice(21,25)),to:Number(line.slice(33,37))});
  if(line.startsWith('SHEET '))ranges.push({kind:'sheet',chain:line[21],from:Number(line.slice(22,26)),to:Number(line.slice(33,37))});
  if(line.startsWith('ATOM  ')&&[' ','A'].includes(line[16])){
   const k=line.slice(21,27),xyz=[30,38,46].map(i=>Number(line.slice(i,i+8)));
   if(xyz.every(Number.isFinite)){
    if(!atomMap.has(k))atomMap.set(k,[]);
    atomMap.get(k).push({x:xyz[0],y:xyz[1],z:xyz[2],name:line.slice(12,16).trim(),element:line.slice(76,78).trim()||line.slice(12,16).trim()[0]});
   }
  }
 }
 for(const line of pdb.split(/\r?\n/)){
  if(!line.startsWith('ATOM  ')||line.slice(12,16).trim()!=='CA'||![' ','A'].includes(line[16]))continue;
  const key=line.slice(21,27);if(seen.has(key))continue;seen.add(key);
  const xyz=[30,38,46].map(k=>Number(line.slice(k,k+8)));if(xyz.some(v=>!Number.isFinite(v)))continue;
  list.push({x:xyz[0],y:xyz[1],z:xyz[2],aa:aa[line.slice(17,20)]||'?',residue:key.trim(),ss:ranges.find(r=>r.chain===line[21]&&Number(line.slice(22,26))>=r.from&&Number(line.slice(22,26))<=r.to)?.kind||'loop',atoms:atomMap.get(key)||[]});
 }
 if(list.length!==46)throw Error('Unexpected 1CRN residue count');
 return list;
}
let raw=fallback(),real=false,points=[],noise=[],edges=[],step=-1,progress=0,local=0,visible=true,raf=0,gl=null;
let width=0,height=0,dpr=1,detailAtoms=[],detailBonds=[],atomicMode='local',atomicAngle=.52;
const elementColors={C:'#d2c5ac',N:'#82a9e2',O:'#e18a7b',S:'#e5c47f'},radii={C:.76,N:.71,O:.66,S:1.05};
function buildAtomicStudy(center,max){
 const atoms=real?raw.flatMap((r,residue)=>{const seen=new Set();return r.atoms.filter(a=>radii[a.element]&&!seen.has(a.name)&&seen.add(a.name)).map(a=>({...a,residue}));}):[];
 const bonds=[],disulfides=[];
 for(let i=0;i<atoms.length;i++)for(let j=i+1;j<atoms.length;j++){
  const a=atoms[i],b=atoms[j],distance=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),same=a.residue===b.residue;
  const peptide=b.residue===a.residue+1&&a.name==='C'&&b.name==='N';
  const sulfur=!same&&a.name==='SG'&&b.name==='SG'&&a.element==='S'&&b.element==='S';
  if((same||peptide||sulfur)&&distance>.6&&distance<=radii[a.element]+radii[b.element]+.25){bonds.push([i,j]);if(sulfur)disulfides.push([a.residue,b.residue]);}
 }
 const pair=disulfides[0],focus=new Set(pair?[pair[0],pair[1],Math.min(raw.length-1,pair[0]+1),Math.max(0,pair[1]-1)]:[16,17,18]);
 detailAtoms=atoms.map(a=>({...a,x:(a.x-center[0])/max*6,y:(a.y-center[1])/max*6,z:(a.z-center[2])/max*6,focus:focus.has(a.residue)}));detailBonds=bonds;
 const selected=detailAtoms.filter(a=>a.focus);
 const sulfurs=pair?detailAtoms.filter(a=>pair.includes(a.residue)&&a.name==='SG'):[];
 // Choose a front-facing view that also exposes the S–S bond in screen space.
 atomicAngle=.52;
 if(selected.length){const cx=selected.reduce((v,a)=>v+a.x,0)/selected.length,cz=selected.reduce((v,a)=>v+a.z,0)/selected.length;let best=-Infinity;
  for(let i=0;i<72;i++){const angle=i*Math.PI/36,c=Math.cos(angle),s=Math.sin(angle),depth=-cx*s+cz*c;
   const separation=sulfurs.length===2?Math.hypot((sulfurs[1].x-sulfurs[0].x)*c+(sulfurs[1].z-sulfurs[0].z)*s,sulfurs[1].y-sulfurs[0].y):0;
   const score=depth*.35+separation*2;if(score>best){best=score;atomicAngle=angle;}
  }
 }
 stage.dataset.atomicCount=String(atoms.length);stage.dataset.atomicBondCount=String(bonds.length);
 by('designAtomicFocus').textContent=pair?'Cys '+(pair[0]+1)+'–'+(pair[1]+1)+' · S–S結合と周辺残基':'局所残基の原子配置';updateAtomicMode();
}
function visibleAtomic(a){return atomicMode==='all'||a.focus;}
function updateAtomicMode(){const count=detailAtoms.filter(visibleAtomic).length;stage.dataset.atomicMode=atomicMode;stage.dataset.atomicVisibleCount=String(count);by('designAtomicCount').textContent=count?count+' / '+detailAtoms.length+' 重原子':'参照構造を取得できません';for(const b of stage.querySelectorAll('[data-atomic-mode]')){b.disabled=!detailAtoms.length;b.setAttribute('aria-pressed',String(b.dataset.atomicMode===atomicMode));}by('designAtomicFocus').hidden=atomicMode==='all'||!detailAtoms.length;}
for(const b of stage.querySelectorAll('[data-atomic-mode]'))b.addEventListener('click',()=>{atomicMode=b.dataset.atomicMode;updateAtomicMode();schedule();});
// Gate 02: fixed editorial composition, no picking or selection controls yet.
const graphFocus=3,graphPair=31,graphK=6;
let graphGeometry=null,graphModel=null,geometryModule=null,graphAngle=.61,graphNeighbors=new Set();
function updateGraphStudy(){
 graphGeometry=real&&geometryModule?geometryModule.buildGeometry(raw):null;
 graphModel=graphGeometry?geometryModule.buildKnn(graphGeometry,graphK):null;
 graphNeighbors=new Set(graphModel?.neighbors[graphFocus]||[]);
 edges=graphModel?graphModel.neighbors[graphFocus].map(j=>[graphFocus,j]):[];
 stage.dataset.graphSource=graphModel?'1CRN':'unavailable';
 stage.dataset.graphFocus=graphModel?String(graphFocus+1):'';
 stage.dataset.graphPair=graphModel?String(graphPair+1):'';
 stage.dataset.graphNeighborCount=String(edges.length);
 const pair=graphModel?geometryModule.describePair(graphGeometry,graphModel,graphFocus,graphPair):null;
 by('designGraphDistance').textContent=pair?pair.distance.toFixed(2)+' Å':'—';
 by('designGraphSeparation').textContent=pair?String(pair.sequenceSeparation):'—';
 by('designGraphStatus').textContent=pair?'46残基 · k=6 · 自己ノード除外':'参照構造を取得できないため、近傍は表示しません。';
 by('designGraphNeighbors').textContent=graphModel?graphModel.neighbors[graphFocus].map(j=>raw[j].aa+(j+1)).join(' · '):'—';
 by('designGraphMetrics').hidden=!pair;
 by('designGraphLabels').hidden=step!==2||!pair;
 if(pair){
  // Seek a front-facing direction with separated focus, pair and nearby residues.
  const ids=[graphFocus,...graphNeighbors],f=points[graphFocus],p=points[graphPair];
  let best=-Infinity;
  for(let i=0;i<72;i++){
   const angle=i*Math.PI/36,c=Math.cos(angle),sn=Math.sin(angle);
   const projected=v=>[v.x*c+v.z*sn,v.y*.98-(-v.x*sn+v.z*c)*.198,-v.x*sn+v.z*c];
   const a=projected(f),b=projected(p);
   const separation=Math.hypot(a[0]-b[0],a[1]-b[1]);
   const minNear=Math.min(...ids.filter(j=>j!==graphFocus).map(j=>{const q=projected(points[j]);return Math.hypot(a[0]-q[0],a[1]-q[1]);}));
   const score=separation*1.5+minNear*.9+(a[2]+b[2])*.22;
   if(score>best){best=score;graphAngle=angle;}
  }
 }
}
function graphLabelPositions(project){
 const labels=by('designGraphLabels');labels.hidden=step!==2||!graphModel;
 if(labels.hidden)return;
 const a=project(points[graphFocus]),b=project(points[graphPair]);
 for(const [id,p,other] of [['designGraphFocusLabel',a,b],['designGraphPairLabel',b,a]]){
  const el=by(id),sign=p.x>=other.x?1:-1;
  el.style.left=Math.max(8,Math.min(width-8,p.x+sign*11))+'px';
  el.style.top=Math.max(8,Math.min(height-8,p.y-12))+'px';
  el.style.transform=sign<0?'translate(-100%,-100%)':'translate(0,-100%)';
 }
}
let compare='close',choice='A';
const selectedResidue=17;
const legends=[
 ['明るい点：Cαの位置の模式例','淡い粒子：空間演出'],
 ['青緑：主鎖の模式リボン','球・結合棒：参照残基の原子'],
 ['青緑：主鎖','金：空間的な近接関係'],
 ['青緑：固定した主鎖','金：配列の割り当て例'],
 ['青緑：設計構造','金：再予測構造の模式例']
];
function updateLegend(n){
 const e=by('designLegend');
 e.replaceChildren(...legends[n].map((label,i)=>{
  const s=document.createElement('span'),dot=document.createElement('i');
  dot.className='design-dot'+(i?(n===0?' muted':n===1?' atom':' amber'):'');
  s.append(dot,document.createTextNode(label));
  return s;
 }));
}
function comparisonPoints(coords){
 const magnitude=compare==='close'?.24:1.8;
 return coords.map((p,i)=>({x:p.x+magnitude*Math.sin(i*.29),y:p.y+magnitude*Math.cos(i*.19),z:p.z+magnitude*Math.sin(i*.17+1)}));
}
for(const b of stage.querySelectorAll('[data-compare]'))b.addEventListener('click',()=>{compare=b.dataset.compare;stage.dataset.compare=compare;for(const x of stage.querySelectorAll('[data-compare]'))x.setAttribute('aria-pressed',String(x===b));schedule();});
for(const b of stage.querySelectorAll('[data-aa-choice]'))b.addEventListener('click',()=>{choice=b.dataset.aaChoice;stage.dataset.aaChoice=choice;for(const x of stage.querySelectorAll('[data-aa-choice]'))x.setAttribute('aria-pressed',String(x===b));by('designChoiceNote').textContent=({A:'A：アラニン',V:'V：バリン',S:'S：セリン'})[choice];schedule();});
const ctx=canvas.getContext('2d');
const buttons=[...stage.querySelectorAll('[data-design-jump]')];

function rebuild(){
 const center=['x','y','z'].map(k=>raw.reduce((s,p)=>s+p[k],0)/raw.length);
 const max=Math.max(...raw.map(p=>Math.hypot(p.x-center[0],p.y-center[1],p.z-center[2])));
 const scaleFactor=6/max;
 points=raw.map(p=>({x:(p.x-center[0])*scaleFactor,y:(p.y-center[1])*scaleFactor,z:(p.z-center[2])*scaleFactor,aa:p.aa,ss:p.ss||'loop'}));
 buildAtomicStudy(center,max);
 noise=points.map((p,i)=>({x:(random(i*3+1)-.5)*15.5,y:(random(i*3+2)-.5)*15.5,z:(random(i*3+3)-.5)*15.5}));
 updateGraphStudy();
 by('designSequence').replaceChildren(...raw.map(()=>{const s=document.createElement('span');s.textContent='·';return s;}));
 updateSequence();
 if(gl)gl.rebuild();
}

function updateSequence(){
 const count=real&&step===3?Math.round((motion.matches?1:Math.min(1,local*1.35))*raw.length):0;
 by('designSequenceCount').textContent=count+' / '+raw.length;
 by('designSequenceLabel').textContent=real?'天然クランビンの参照配列（1CRN）':'参照配列は取得できませんでした';
 [...by('designSequence').children].forEach((s,i)=>{s.textContent=i<count?raw[i].aa:'·';s.classList.toggle('on',i<count);});
}

function setStep(n){
 if(n===step)return;step=n;stage.dataset.designStep=String(n);
 by('designIntent').hidden=n!==0;by('designAtomicPanel').hidden=n!==1;by('designGraphPanel').hidden=n!==2;by('designGraphLabels').hidden=n!==2||!graphModel;updateLegend(n);
 const c=chapters[n];
 by('designKicker').textContent='0'+(n+1)+' / 05 — '+c[0];
 by('designTitle').textContent=c[1];
 by('designDescription').textContent=c[2];
 by('designFormula').innerHTML=c[3];
 by('designSequencePanel').hidden=n!==3;
 by('designEvaluate').hidden=n!==4;
 by('designNext').textContent=n===4?'研究と開発へ ↓':n===0?'構造生成へ ↓':'次の工程へ ↓';
 buttons.forEach((b,i)=>{if(i===n)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
 measureNav();
}

function updateScroll(){
 const total=Math.max(1,journey.offsetHeight-stage.offsetHeight);
 progress=Math.max(0,Math.min(1,-journey.getBoundingClientRect().top/total));
 const n=Math.min(4,Math.floor(progress*5));
 local=Math.min(1,progress*5-n);
 setStep(n);
 by('designProgress').style.width=(progress*100)+'%';
 updateSequence();
 schedule();
}

function jump(n){
 const top=scrollY+journey.getBoundingClientRect().top;
 const distance=journey.offsetHeight-stage.offsetHeight;
 window.scrollTo({top:top+distance*(n===0?0:(n+(n===1?.78:.07))/5),behavior:motion.matches?'auto':'smooth'});
}
buttons.forEach((b,i)=>b.addEventListener('click',()=>jump(i)));
by('designNext').addEventListener('click',()=>step===4?document.getElementById('works').scrollIntoView({behavior:motion.matches?'auto':'smooth'}):jump(step+1));

function measureNav(){
 const bottom=stage.querySelector('.design-bottom');
 stage.style.setProperty('--design-nav-height',(bottom.offsetHeight+Math.max(0,stage.getBoundingClientRect().bottom-bottom.getBoundingClientRect().bottom))+'px');
}

function dimensions(){
 const rect=stage.getBoundingClientRect();measureNav();
 width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 if(gl)gl.resize();
 schedule();
}

const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};

function geometry(){
 const u=step===0?(motion.matches?0:.90*ease(local)):step===1?(motion.matches?1:.90+.10*ease(local/.70)):1;
 const ribbon=real&&step>=1?(step===1?ease((u-.94)/.06):1):0;
 const coords=points.map((p,i)=>{const swirl=(1-u)*u*1.2;return {x:noise[i].x+(p.x-noise[i].x)*u+Math.sin(i*.73)*swirl,y:noise[i].y+(p.y-noise[i].y)*u+Math.cos(i*.49)*swirl,z:noise[i].z+(p.z-noise[i].z)*u};});
 return {u,ribbon,coords};
}

let lastFrame=-Infinity;
function draw(now){
 raf=0;if(!visible||document.hidden||!width||!height)return;
 if(!motion.matches&&now-lastFrame<24){raf=requestAnimationFrame(draw);return;}
 lastFrame=now;
 const g=geometry();const angle=step===2?graphAngle:step===1&&real&&atomicMode==='local'?atomicAngle+(motion.matches?0:.18*Math.sin(now*.00035)):.52+(motion.matches?0:now*.00012);
 if(gl){try{gl.draw(g,angle);stage.classList.add('design-gl');}catch{gl.dispose();gl=null;stage.classList.remove('design-gl');}}
 if(!gl&&ctx){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const portrait=width<801,cx=width*(portrait?.50:.67),cy=height*(portrait?(step===1?.49:step===2?.49:step>=3?.47:.54):step===2?.43:step>=3?.34:.45);
  const scale=Math.min(width*(portrait?.043:.037),height*(portrait?.029:.048))*(step===1&&real&&portrait&&atomicMode==='local'?1.35:1);
  const a=Math.cos(angle),b=Math.sin(angle);
  const project=v=>{const x=v.x*a+v.z*b,z=-v.x*b+v.z*a;const k=1/(1+(step===2?-z:z)*.025);return {x:cx+x*scale*k,y:cy-v.y*scale*k,z,k};};
  const p=g.coords.map(project);
  const line=(i,j,color,w)=>{ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(p[i].x,p[i].y);ctx.lineTo(p[j].x,p[j].y);ctx.stroke();};
  if(step===2)for(const [i,j] of edges)line(i,j,j===graphPair?'#fff0c7':'rgba(228,190,132,.82)',j===graphPair?2.5:1.6);
  const trace=(q,color,w)=>{ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(q[0].x,q[0].y);for(let i=1;i<q.length-1;i++)ctx.quadraticCurveTo(q[i].x,q[i].y,(q[i].x+q[i+1].x)/2,(q[i].y+q[i+1].y)/2);ctx.lineTo(q.at(-1).x,q.at(-1).y);ctx.stroke();};
  if(step===4)trace(comparisonPoints(g.coords).map(project),'rgba(228,190,132,.85)',5);
  if(g.u>.12)trace(p,'rgba(127,212,209,'+(Math.pow(g.u,1.6)*(step===2?.30:.88))+')',step===1||step===4?5:2.6);
  const count=step===3?Math.round((motion.matches?1:Math.min(1,local*1.35))*p.length):0;
  if(step===0){ctx.fillStyle='#96bac7';ctx.globalAlpha=.24*(1-g.u);for(let i=0;i<220;i++){const v=project({x:(random(i*3+500)-.5)*24,y:(random(i*3+501)-.5)*22,z:(random(i*3+502)-.5)*25});ctx.beginPath();ctx.arc(v.x,v.y,.6+random(i+750)*1.3,0,Math.PI*2);ctx.fill();}}
  p.map((v,i)=>({...v,i})).sort((a,b)=>b.z-a.z).forEach(v=>{const r=(step===2?(v.i===graphFocus?8:v.i===graphPair?6:graphNeighbors.has(v.i)?5:2.8):step===3&&v.i===selectedResidue?7:2.4+g.u*2.2)*v.k;ctx.beginPath();ctx.arc(v.x,v.y,r,0,Math.PI*2);ctx.fillStyle=step===2?(v.i===graphFocus?'#ffe1a6':v.i===graphPair?'#fff0c7':graphNeighbors.has(v.i)?'#d5b17c':'#63939d'):step===3&&(v.i<count||v.i===selectedResidue)?'#e4be84':'#7fd4d1';ctx.globalAlpha=.7+.25*g.u;ctx.fill();});
  ctx.globalAlpha=1;
  if(step===2)graphLabelPositions(project);
  if(step===1&&real&&g.ribbon>.94){const q=detailAtoms.map(project);for(const [i,j] of detailBonds){if(!visibleAtomic(detailAtoms[i])||!visibleAtomic(detailAtoms[j]))continue;ctx.strokeStyle='#8a989b';ctx.lineWidth=atomicMode==='local'?2.5:1.4;ctx.beginPath();ctx.moveTo(q[i].x,q[i].y);ctx.lineTo(q[j].x,q[j].y);ctx.stroke();}q.map((p,i)=>({...p,i})).filter(p=>visibleAtomic(detailAtoms[p.i])).sort((a,b)=>b.z-a.z).forEach(p=>{const a=detailAtoms[p.i];ctx.fillStyle=elementColors[a.element];ctx.beginPath();ctx.arc(p.x,p.y,(atomicMode==='local'?3.5:2.7)*(a.element==='S'?1.25:1)*p.k,0,Math.PI*2);ctx.fill();});}
 }
 if(!motion.matches)raf=requestAnimationFrame(draw);
}
function schedule(){if(visible&&!raf)raf=requestAnimationFrame(draw);}

// Rotation-minimizing Bishop (parallel-transport) ribbon frames avoid Frenet twists/pinches.
function makeRibbon(T,coords,labels){
 const curve=new T.CatmullRomCurve3(coords.map(p=>new T.Vector3(p.x,p.y,p.z)),false,'centripetal');
 const segments=(coords.length-1)*14,sides=14;
 const tangents=[],normals=[],binormals=[];
 for(let k=0;k<=segments;k++)tangents.push(curve.getTangentAt(k/segments).normalize());
 const up=Math.abs(tangents[0].y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0);
 normals.push(new T.Vector3().crossVectors(tangents[0],up).normalize());
 binormals.push(new T.Vector3().crossVectors(tangents[0],normals[0]).normalize());
 const axis=new T.Vector3();
 for(let k=1;k<=segments;k++){
  const prevT=tangents[k-1],currT=tangents[k],n=normals[k-1].clone();
  axis.crossVectors(prevT,currT);
  const sinA=axis.length();
  if(sinA>1e-5){
   const angle=Math.acos(Math.max(-1,Math.min(1,prevT.dot(currT))));
   n.applyAxisAngle(axis.normalize(),angle);
  }
  n.addScaledVector(currT,-n.dot(currT)).normalize();
  normals.push(n);
  binormals.push(new T.Vector3().crossVectors(currT,n).normalize());
 }
 const sampleWidth=ix=>{
  const i0=Math.max(0,Math.min(coords.length-1,Math.floor(ix))),i1=Math.min(coords.length-1,i0+1),f=ix-i0;
  const wFor=ss=>ss==='helix'?.38:ss==='sheet'?.44:.105;
  const hFor=ss=>ss==='loop'?.105:.072;
  const ss0=labels[i0]?.ss||'loop',ss1=labels[i1]?.ss||'loop';
  let w=wFor(ss0)+(wFor(ss1)-wFor(ss0))*f;
  const h=hFor(ss0)+(hFor(ss1)-hFor(ss0))*f;
  const nearest=Math.min(coords.length-1,Math.floor(ix+.5)),ss=labels[nearest]?.ss||'loop';
  if(ss==='sheet'){
   let end=nearest;while(end+1<labels.length&&labels[end+1].ss==='sheet')end++;
   const distance=end+.48-ix;
   if(distance<1.3)w*=distance<.48?Math.max(.14,distance/.48)*1.55:1+.55*(1.3-distance)/.82;
  }
  return {w,h,ss};
 };
 const pos=[],indices=[],colors=[];const color=new T.Color();
 for(let k=0;k<=segments;k++){
  const t=k/segments,p=curve.getPointAt(t),n=normals[k],b=binormals[k];
  const ix=curve.getUtoTmapping(t)*(coords.length-1);
  const {w,h,ss}=sampleWidth(ix);
  color.set(ss==='helix'?'#8ee4de':ss==='sheet'?'#6eb5c2':'#5a91a4');
  for(let s=0;s<sides;s++){
   const a=s/sides*Math.PI*2;
   const v=p.clone().addScaledVector(n,Math.cos(a)*w).addScaledVector(b,Math.sin(a)*h);
   pos.push(v.x,v.y,v.z);colors.push(color.r,color.g,color.b);
  }
  if(k>0)for(let s=0;s<sides;s++){
   const a=(k-1)*sides+s,b0=(k-1)*sides+(s+1)%sides,c=k*sides+s,d=k*sides+(s+1)%sides;
   indices.push(a,b0,c,b0,d,c);
  }
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 geometry.setIndex(indices);
 geometry.computeVertexNormals();
 return geometry;
}

function makeStudioEnv(T,renderer){
 const pmrem=new T.PMREMGenerator(renderer);
 const envScene=new T.Scene();
 const panel=(w,h,pos,rot,color,intensity)=>{
  const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(intensity),side:T.DoubleSide}));
  m.position.set(...pos);m.rotation.set(...rot);envScene.add(m);
 };
 panel(14,8,[-7,7,8],[.55,-.65,0],0xfff3e0,2.2);
 panel(12,10,[9,3,-7],[.2,2.2,0],0x7ed9e2,2.0);
 panel(16,16,[0,-9,0],[-Math.PI/2,0,0],0x162635,1.1);
 panel(10,6,[0,10,0],[Math.PI/2,0,0],0xdaf5f4,1.6);
 const rt=pmrem.fromScene(envScene,0.04);
 pmrem.dispose();
 return rt;
}

function makeGlowSprite(T){
 const c=document.createElement('canvas');c.width=64;c.height=64;
 const g=c.getContext('2d');
 const grad=g.createRadialGradient(32,32,2,32,32,30);
 grad.addColorStop(0,'rgba(218,246,245,1)');
 grad.addColorStop(.32,'rgba(127,212,209,.62)');
 grad.addColorStop(.7,'rgba(127,212,209,.12)');
 grad.addColorStop(1,'rgba(127,212,209,0)');
 g.fillStyle=grad;g.fillRect(0,0,64,64);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}

function initGL(T){
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(dpr);
 renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.18;
 renderer.setClearColor(0x070c12,0);
 webgl.append(renderer.domElement);

 const scene=new T.Scene(),camera=new T.PerspectiveCamera(42,1,.1,100),group=new T.Group();
 const envRT=makeStudioEnv(T,renderer);
 scene.environment=envRT.texture;
 scene.add(group);
 scene.add(new T.HemisphereLight(0xd2f7f4,0x1a2c3d,0.9));
 const key=new T.DirectionalLight(0xfff1dc,2.2);key.position.set(-6,9,12);scene.add(key);
 const rim=new T.DirectionalLight(0x7fd4e2,2.4);rim.position.set(8,4,-9);scene.add(rim);
 const fill=new T.DirectionalLight(0xd4b384,0.85);fill.position.set(-4,-6,6);scene.add(fill);

 const geom=new T.SphereGeometry(.115,20,14);
 const mat=new T.MeshPhysicalMaterial({color:0xffffff,roughness:.28,metalness:.06,clearcoat:.45,clearcoatRoughness:.25});
 const ribbonMat=new T.MeshPhysicalMaterial({vertexColors:true,roughness:.32,metalness:.05,clearcoat:.38,clearcoatRoughness:.26,side:T.DoubleSide,transparent:true});
 const comparisonMat=new T.MeshPhysicalMaterial({color:0xe8c186,roughness:.36,metalness:.06,clearcoat:.3,clearcoatRoughness:.3,side:T.DoubleSide,transparent:true,opacity:.80,depthWrite:false});
 const glowTex=makeGlowSprite(T);
 const dustGeo=new T.BufferGeometry();
 dustGeo.setAttribute('position',new T.Float32BufferAttribute(Array.from({length:340*3},(_,i)=>(random(i+5000)-.5)*26),3));
 const dustMat=new T.PointsMaterial({map:glowTex,color:0xaad8de,size:.28,transparent:true,opacity:.45,depthWrite:false,blending:T.AdditiveBlending});
 const dust=new T.Points(dustGeo,dustMat);group.add(dust);

 const atomGeo=new T.SphereGeometry(.135,20,14);
 const atomMat=new T.MeshPhysicalMaterial({roughness:.26,metalness:.08,clearcoat:.5,clearcoatRoughness:.2});
 const bondGeo=new T.CylinderGeometry(.045,.045,1,12);
 const bondMat=new T.MeshPhysicalMaterial({color:0xc9d7db,roughness:.35,metalness:.1,clearcoat:.3});
 const rodGeo=new T.CylinderGeometry(.072,.072,1,14);
 const rodMat=new T.MeshPhysicalMaterial({color:0x76c2c4,roughness:.32,metalness:.06,clearcoat:.35});

 const yAxis=new T.Vector3(0,1,0),from=new T.Vector3(),to=new T.Vector3(),delta=new T.Vector3();
 const obj=new T.Object3D(),teal=new T.Color('#80d4d1'),gold=new T.Color('#ebb971'),graphMuted=new T.Color('#527985'),graphGold=new T.Color('#d6ac6d'),graphIvory=new T.Color('#fff0c7'),projected=new T.Vector3();
 const graphRodGeo=new T.CylinderGeometry(.027,.027,1,12),graphRodMat=new T.MeshBasicMaterial({color:0xffffff});
 let graphRods=null;
 let spheres=null,lines=null,links=null,trails=null,compareLine=null,backbone=null,ribbon=null,comparisonRibbon=null,atomDetail=null,bondDetail=null,atomicRenderMode=null,lastCompare=null;

 function updateAtomicMeshes(){
  if(!atomDetail||atomicRenderMode===atomicMode)return;atomicRenderMode=atomicMode;
  const size=atomicMode==='local'?1.12:.88;let n=0,m=0;
  for(const a of detailAtoms){if(!visibleAtomic(a))continue;obj.position.set(a.x,a.y,a.z);obj.rotation.set(0,0,0);obj.scale.setScalar(size*(a.element==='S'?1.3:1));obj.updateMatrix();atomDetail.setMatrixAt(n,obj.matrix);atomDetail.setColorAt(n++,new T.Color(elementColors[a.element]));}
  atomDetail.count=n;atomDetail.instanceMatrix.needsUpdate=true;if(atomDetail.instanceColor)atomDetail.instanceColor.needsUpdate=true;
  if(bondDetail){for(const [i,j] of detailBonds){const a=detailAtoms[i],b=detailAtoms[j];if(!visibleAtomic(a)||!visibleAtomic(b))continue;from.set(a.x,a.y,a.z);to.set(b.x,b.y,b.z);delta.subVectors(to,from);const len=delta.length();obj.position.copy(from).add(to).multiplyScalar(.5);obj.quaternion.setFromUnitVectors(yAxis,delta.normalize());obj.scale.set(.92,len,.92);obj.updateMatrix();bondDetail.setMatrixAt(m++,obj.matrix);}bondDetail.count=m;bondDetail.instanceMatrix.needsUpdate=true;}
 }
 function rebuildGL(){
  for(const m of [ribbon,comparisonRibbon])if(m){group.remove(m);m.geometry.dispose();}
  ribbon=null;comparisonRibbon=null;lastCompare=null;
  for(const m of [atomDetail,bondDetail])if(m){group.remove(m);m.dispose();}
  atomDetail=null;bondDetail=null;atomicRenderMode=null;
  if(real){
   ribbon=new T.Mesh(makeRibbon(T,points,points),ribbonMat);group.add(ribbon);
   if(detailAtoms.length){
    atomDetail=new T.InstancedMesh(atomGeo,atomMat,detailAtoms.length);
    atomDetail.frustumCulled=false;group.add(atomDetail);
    if(detailBonds.length){bondDetail=new T.InstancedMesh(bondGeo,bondMat,detailBonds.length);bondDetail.frustumCulled=false;group.add(bondDetail);}
    updateAtomicMeshes();
   }
  }
  for(const m of [spheres,backbone,graphRods])if(m){group.remove(m);m.dispose();}
  for(const m of [compareLine,lines,links,trails])if(m){group.remove(m);m.geometry.dispose();m.material.dispose();}
  backbone=new T.InstancedMesh(rodGeo,rodMat,points.length-1);backbone.frustumCulled=false;group.add(backbone);
  const cmpGeo=new T.BufferGeometry();cmpGeo.setAttribute('position',new T.BufferAttribute(new Float32Array(points.length*3),3));
  compareLine=new T.Line(cmpGeo,new T.LineBasicMaterial({color:0xe8c186,transparent:true,opacity:.95}));compareLine.frustumCulled=false;group.add(compareLine);
  spheres=new T.InstancedMesh(geom,mat,points.length);spheres.frustumCulled=false;group.add(spheres);
  const lineGeo=new T.BufferGeometry();lineGeo.setAttribute('position',new T.BufferAttribute(new Float32Array(points.length*3),3));
  lines=new T.Line(lineGeo,new T.LineBasicMaterial({color:0x7fd4d1,transparent:true,opacity:.75}));lines.frustumCulled=false;group.add(lines);
  graphRods=new T.InstancedMesh(graphRodGeo,graphRodMat,Math.max(1,edges.length));graphRods.frustumCulled=false;graphRods.count=edges.length;group.add(graphRods);
  const edgeGeo=new T.BufferGeometry();edgeGeo.setAttribute('position',new T.BufferAttribute(new Float32Array(edges.length*6),3));
  links=new T.LineSegments(edgeGeo,new T.LineBasicMaterial({color:0xedc484,transparent:true,opacity:.56}));links.frustumCulled=false;group.add(links);
  const trailGeo=new T.BufferGeometry();trailGeo.setAttribute('position',new T.BufferAttribute(new Float32Array(points.length*6),3));
  trails=new T.LineSegments(trailGeo,new T.LineBasicMaterial({color:0x7fd4d1,transparent:true,opacity:.22}));trails.frustumCulled=false;group.add(trails);
 }

 function resize(){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}

 function render(g,angle){
  const portrait=width<801;
  const depth=step===0?1-ease(local):0;
  const mobileDistance=Math.max(31,9.4/(Math.tan(camera.fov*Math.PI/360)*camera.aspect));
  const desktopDistance=step===2?20.8:step>=3?22.5:20.2;
  camera.position.set(0,0,(step===1&&real?(portrait?(atomicMode==='local'?Math.max(21,mobileDistance*.70):mobileDistance*.93):19.6):(portrait?(step===2?Math.max(23,mobileDistance*.78):mobileDistance):desktopDistance))+depth*3.2);
  camera.lookAt(0,0,0);
  camera.setViewOffset(
   width,height,
   portrait?0:-Math.round(width*.17),
   portrait?Math.round(height*(step===1?.015:step===2?.025:step>=3?.015:-.075)):Math.round(height*(step>=3?.14:.035)),
   width,height
  );
  group.rotation.y=angle;
  group.rotation.x=step===2?.20:step===1&&real?.12:.22+.12*Math.sin(progress*Math.PI);
  key.color.set(step===1?0xf1f6ff:0xfff1dc);rim.intensity=step===1?1.3:2.4;
  dust.visible=step===0;
  dustMat.opacity=.48*(1-g.u*.75);
  trails.visible=step===0&&g.u<.92;
  if(trails.visible){
   g.coords.forEach((p,i)=>{
    const t0=noise[i];
    trails.geometry.attributes.position.setXYZ(i*2,p.x,p.y,p.z);
    trails.geometry.attributes.position.setXYZ(i*2+1,p.x+(points[i].x-t0.x)*.16,p.y+(points[i].y-t0.y)*.16,p.z+(points[i].z-t0.z)*.16);
   });
   trails.geometry.attributes.position.needsUpdate=true;
   trails.material.opacity=.18+.22*Math.sin(g.u*Math.PI);
  }
  const count=step===3?Math.round((motion.matches?1:Math.min(1,local*1.35))*points.length):0;
  g.coords.forEach((p,i)=>{
   obj.position.set(p.x,p.y,p.z);obj.rotation.set(0,0,0);
   obj.scale.setScalar(step===2?(graphModel&&i===graphFocus?3.45:graphModel&&i===graphPair?2.65:graphNeighbors.has(i)?2.05:1.02):step===3&&i===selectedResidue?2.85:.88+g.u*.75);
   obj.updateMatrix();
   spheres.setMatrixAt(i,obj.matrix);
   spheres.setColorAt(i,step===2?(graphModel&&i===graphFocus?graphIvory:graphModel&&i===graphPair?graphIvory:graphNeighbors.has(i)?graphGold:graphMuted):step===3&&(i<count||i===selectedResidue)?gold:teal);
   lines.geometry.attributes.position.setXYZ(i,p.x,p.y,p.z);
  });
  spheres.visible=!(real&&(step===1||step===4)&&g.ribbon>.94);
  spheres.instanceMatrix.needsUpdate=true;
  spheres.instanceColor.needsUpdate=true;
  lines.geometry.attributes.position.needsUpdate=true;
  lines.visible=g.u>.12&&step<2&&!(step===1&&real&&g.ribbon>.94);
  lines.material.opacity=Math.pow(g.u,1.6)*.86;
  backbone.visible=step>=1&&(!real||g.ribbon<.15||step===3);
  if(ribbon){ribbon.visible=(step===1||step===2||step===4)&&g.ribbon>.02;ribbonMat.opacity=step===1?g.ribbon*(atomicMode==='all'?.16:.38):step===2?.22:g.ribbon;ribbonMat.depthWrite=step!==1&&step!==2&&g.ribbon>.85;}
  const showDetail=step===1&&g.ribbon>.94;
  if(atomDetail){updateAtomicMeshes();atomDetail.visible=showDetail;}
  if(bondDetail)bondDetail.visible=showDetail;
  const ribbonState=String(!!ribbon&&ribbon.visible);
  if(stage.dataset.ribbonVisible!==ribbonState)stage.dataset.ribbonVisible=ribbonState;
  for(let i=1;i<g.coords.length;i++){
   const a=g.coords[i-1],b=g.coords[i];
   from.set(a.x,a.y,a.z);to.set(b.x,b.y,b.z);delta.subVectors(to,from);
   const len=delta.length();
   obj.position.copy(from).add(to).multiplyScalar(.5);
   obj.quaternion.setFromUnitVectors(yAxis,delta.normalize());
   obj.scale.set(1,len,1);obj.updateMatrix();
   backbone.setMatrixAt(i-1,obj.matrix);
  }
  backbone.instanceMatrix.needsUpdate=true;
  compareLine.visible=step===4&&!real;
  if(step===4&&real&&lastCompare!==compare){
   if(comparisonRibbon){group.remove(comparisonRibbon);comparisonRibbon.geometry.dispose();}
   comparisonRibbon=new T.Mesh(makeRibbon(T,comparisonPoints(points),points),comparisonMat);
   group.add(comparisonRibbon);lastCompare=compare;
  }
  if(comparisonRibbon)comparisonRibbon.visible=step===4;
  if(step===4&&!real){
   comparisonPoints(g.coords).forEach((v,i)=>compareLine.geometry.attributes.position.setXYZ(i,v.x,v.y,v.z));
   compareLine.geometry.attributes.position.needsUpdate=true;
  }
  links.visible=false;
  graphRods.visible=step===2&&!!graphModel;
  if(graphRods.visible){
   edges.forEach(([i,j],k)=>{
    const a=g.coords[i],b=g.coords[j];
    from.set(a.x,a.y,a.z);to.set(b.x,b.y,b.z);delta.subVectors(to,from);
    const len=delta.length();obj.position.copy(from).add(to).multiplyScalar(.5);
    obj.quaternion.setFromUnitVectors(yAxis,delta.normalize());
    const weight=j===graphPair?1.65:1;
    obj.scale.set(weight,len,weight);obj.updateMatrix();
    graphRods.setMatrixAt(k,obj.matrix);graphRods.setColorAt(k,j===graphPair?graphIvory:graphGold);
   });
   graphRods.instanceMatrix.needsUpdate=true;graphRods.instanceColor.needsUpdate=true;
  }
  if(step===2){group.updateMatrixWorld(true);camera.updateMatrixWorld(true);graphLabelPositions(p=>{projected.set(p.x,p.y,p.z).applyMatrix4(group.matrixWorld).project(camera);return {x:(projected.x+1)*width/2,y:(1-projected.y)*height/2};});}
  renderer.render(scene,camera);
 }

 function dispose(){
  scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  glowTex.dispose();envRT.dispose();renderer.dispose();webgl.replaceChildren();
 }
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();dispose();gl=null;stage.classList.remove('design-gl');schedule();},{once:true});
 rebuildGL();resize();return {draw:render,rebuild:rebuildGL,resize,dispose};
}

rebuild();dimensions();updateScroll();
if('ResizeObserver' in window)new ResizeObserver(measureNav).observe(stage.querySelector('.design-bottom'));
window.addEventListener('scroll',updateScroll,{passive:true});
window.addEventListener('resize',()=>{dimensions();updateScroll();},{passive:true});
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else if(raf){cancelAnimationFrame(raf);raf=0;}},{threshold:.01}).observe(stage);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&raf){cancelAnimationFrame(raf);raf=0;}else schedule();});
motion.addEventListener?.('change',()=>{updateSequence();schedule();});
const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
Promise.all([fetch('https://files.rcsb.org/download/1CRN.pdb',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('PDB unavailable');return r.text();}),import('./design-geometry.mjs').catch(()=>null)]).then(([pdb,module])=>{geometryModule=module;raw=parsePDB(pdb);real=true;stage.dataset.secondaryCount=String(raw.filter(p=>p.ss!=='loop').length);stage.dataset.designSource='1CRN';by('designDataStatus').textContent='模式図 · 構造の参考：PDB 1CRN';rebuild();schedule();}).catch(()=>{stage.dataset.designSource='schematic';by('designDataStatus').textContent='模式図 · 参照構造なしでも探索できます';updateGraphStudy();schedule();}).finally(()=>clearTimeout(timeout));
import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js').then(T=>{try{gl=initGL(T);schedule();}catch{webgl.replaceChildren();}}).catch(()=>{});
