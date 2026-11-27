// Procedural scenery. The geometries and distances are illustrative, not measured biology.
const host=document.getElementById('depthScene');
const gallery=document.getElementById('protein');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
if(host&&gallery){
  import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js').then(T=>init(T)).catch(()=>{});
}
function init(T){
  let renderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});}catch{return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));
  renderer.setClearColor(0x10090e);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  renderer.domElement.setAttribute('aria-hidden','true');
  host.append(renderer.domElement);
  const camera=new T.PerspectiveCamera(43,1,.05,140);
  const vessel=new T.Scene(),interior=new T.Scene();
  vessel.background=new T.Color(0x160a10);vessel.fog=new T.FogExp2(0x190b13,.045);
  interior.background=new T.Color(0x160d15);interior.fog=new T.FogExp2(0x190e18,.055);
  function light(scene){scene.add(new T.HemisphereLight(0xfbd5c0,0x3d1932,1.55));const key=new T.DirectionalLight(0xffc2a0,3.1);key.position.set(-5,8,9);scene.add(key);const rim=new T.DirectionalLight(0xa96d99,2.1);rim.position.set(5,-4,-8);scene.add(rim);}
  light(vessel);light(interior);
  let seed=72931;function random(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
  // Revolve a biconcave radial profile about the vertical axis.
  const profile=[];const radialSteps=28;
  function thickness(r){return Math.sqrt(Math.max(0,1-r*r))*(.13+.49*r*r);}
  for(let i=0;i<=radialSteps;i++){const r=i/radialSteps;profile.push(new T.Vector2(r,thickness(r)));}
  for(let i=radialSteps-1;i>=0;i--){const r=i/radialSteps;profile.push(new T.Vector2(r,-thickness(r)));}
  const disc=new T.LatheGeometry(profile.reverse(),48);
  const cellMaterial=new T.MeshStandardMaterial({color:0xb63235,roughness:.48,metalness:.02});
  const highlighted=new T.MeshStandardMaterial({color:0xd34e49,roughness:.42,metalness:.02});
  const focus=new T.Mesh(disc,highlighted);focus.position.set(0,0,-2);focus.scale.setScalar(2.05);focus.rotation.set(1.05,.15,.30);vessel.add(focus);
  const cells=[];
  for(let i=0;i<43;i++){const angle=random()*Math.PI*2,rad=2.9+random()*4.3,z=-30+random()*45;const m=new T.Mesh(disc,cellMaterial);m.position.set(Math.cos(angle)*rad,Math.sin(angle)*rad,z);m.rotation.set(random()*Math.PI,random()*Math.PI,random()*Math.PI);m.scale.setScalar(.85+random()*.9);vessel.add(m);cells.push({m,z,phase:random()*Math.PI*2});}
  const wall=new T.Mesh(new T.CylinderGeometry(9,9,90,56,1,true),new T.MeshStandardMaterial({color:0x54202b,roughness:.95,side:T.BackSide}));wall.rotation.x=Math.PI/2;wall.position.z=-15;vessel.add(wall);
  // Four-lobed shapes are symbolic hemoglobin molecules, not experimental coordinates.
  const sphere=new T.IcosahedronGeometry(.48,2);
  const lobes=new T.InstancedMesh(sphere,new T.MeshStandardMaterial({roughness:.53,color:0xffffff}),320);
  const matrix=new T.Object3D(),colors=[new T.Color(0xc98a7c),new T.Color(0x77b3b5),new T.Color(0xd3b080),new T.Color(0x8894ae)];
  let instance=0;
  for(let i=0;i<80;i++){const x=(random()-.5)*16,y=(random()-.5)*11,z=-17+random()*20;const center=new T.Vector3(x,y,z);for(let j=0;j<4;j++){const a=j*Math.PI/2;matrix.position.set(center.x+.46*Math.cos(a),center.y+.46*Math.sin(a),center.z+(j%2?.22:-.22));matrix.rotation.set(random(),random(),random());matrix.scale.setScalar(.76+random()*.25);matrix.updateMatrix();lobes.setMatrixAt(instance,matrix.matrix);lobes.setColorAt(instance,colors[j]);instance++;}}
  interior.add(lobes);
  const featured=new T.Group();
  for(let j=0;j<4;j++){const a=j*Math.PI/2,m=new T.Mesh(sphere,new T.MeshStandardMaterial({color:colors[j],roughness:.4}));m.position.set(.5*Math.cos(a),.5*Math.sin(a),j%2?.22:-.22);featured.add(m);}
  featured.position.set(0,0,-3);featured.scale.setScalar(1.7);interior.add(featured);
  let visible=true,frame=0,last=0,failed=false;
  function size(){const w=host.clientWidth,h=host.clientHeight;if(w<2||h<2)return false;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();return true;}
  function render(now=0){
    frame=0;if(failed||!visible||document.hidden)return;
    const scene=Number(gallery.dataset.scene);if(scene!==0&&scene!==1)return;
    const p=Math.max(0,Math.min(1,Number(gallery.dataset.sceneProgress)||0));
    const u=motion.matches?0:p*p*(3-2*p);
    if(scene===0){camera.position.set(1.1*(1-u),.65*(1-u),13-9.1*u);camera.lookAt(0,0,-2);if(!motion.matches){for(const c of cells)c.m.position.z=c.z+Math.sin(now*.00032+c.phase)*.52;}}
    else{camera.position.set(.7*(1-u),.55*(1-u),11-8.7*u);camera.lookAt(0,0,-3);if(!motion.matches)featured.rotation.y=now*.00019;}
    try{renderer.render(scene===0?vessel:interior,camera);gallery.classList.add('depth-ready');}catch{fallback();return;}
    if(!motion.matches)frame=requestAnimationFrame(tick);
  }
  function tick(t){if(t-last<33){frame=requestAnimationFrame(tick);return;}last=t;render(t);}
  function schedule(){if(!frame&&!failed)frame=requestAnimationFrame(render);}
  function fallback(){failed=true;if(frame)cancelAnimationFrame(frame);frame=0;gallery.classList.remove('depth-ready');host.replaceChildren();}
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback();});
  try{if(!size()){fallback();return;}render();}catch{fallback();return;}
  const stateObserver=new MutationObserver(schedule);stateObserver.observe(gallery,{attributes:true,attributeFilter:['data-scene','data-scene-progress']});
  if('ResizeObserver' in window)new ResizeObserver(()=>{if(!failed&&size())schedule();}).observe(host);
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else if(frame){cancelAnimationFrame(frame);frame=0;}},{threshold:.01}).observe(gallery);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else schedule();});
  motion.addEventListener?.('change',schedule);
}
