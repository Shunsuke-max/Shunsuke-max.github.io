// Procedural scenery. The geometries and distances are illustrative, not measured biology.
const host=document.getElementById('depthScene');
const gallery=document.getElementById('protein');
const motion=matchMedia('(prefers-reduced-motion: reduce)');
if(host&&gallery){
  import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js').then(T=>init(T)).catch(()=>{});
}

function makeSoftBokeh(T){
  const c=document.createElement('canvas');c.width=64;c.height=64;
  const g=c.getContext('2d');
  const grad=g.createRadialGradient(32,32,2,32,32,30);
  grad.addColorStop(0,'rgba(255,216,196,.85)');
  grad.addColorStop(.45,'rgba(220,120,120,.28)');
  grad.addColorStop(1,'rgba(160,60,80,0)');
  g.fillStyle=grad;g.fillRect(0,0,64,64);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}

function makeBioEnv(T,renderer){
  const pmrem=new T.PMREMGenerator(renderer);
  const env=new T.Scene();
  const panel=(w,h,pos,rot,color,intensity)=>{
    const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(intensity),side:T.DoubleSide}));
    m.position.set(...pos);m.rotation.set(...rot);env.add(m);
  };
  panel(14,8,[-7,8,8],[.55,-.65,0],0xffd7c2,2.4);
  panel(12,10,[9,3,-7],[.2,2.2,0],0xba7aa8,1.9);
  panel(16,14,[0,-9,0],[-Math.PI/2,0,0],0x3b1322,1.2);
  const rt=pmrem.fromScene(env,0.05);
  pmrem.dispose();
  return rt;
}

function init(T){
  let renderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});}catch{return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.setClearColor(0x0f080d);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.18;
  renderer.domElement.setAttribute('aria-hidden','true');
  host.append(renderer.domElement);

  const camera=new T.PerspectiveCamera(43,1,.05,140);
  const envRT=makeBioEnv(T,renderer);
  const vessel=new T.Scene(),interior=new T.Scene();
  vessel.environment=envRT.texture;
  interior.environment=envRT.texture;
  vessel.background=new T.Color(0x13080e);vessel.fog=new T.FogExp2(0x160911,.046);
  interior.background=new T.Color(0x110a13);interior.fog=new T.FogExp2(0x130b16,.056);

  function light(scene){
    scene.add(new T.HemisphereLight(0xfed8c4,0x36142b,1.25));
    const key=new T.DirectionalLight(0xffcab0,2.8);key.position.set(-5,8,9);scene.add(key);
    const rim=new T.DirectionalLight(0xc281b4,2.2);rim.position.set(6,-3,-8);scene.add(rim);
  }
  light(vessel);light(interior);

  let seed=72931;function random(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
  // High-resolution biconcave radial profile revolved cleanly about the vertical axis.
  const profile=[];const radialSteps=40;
  function thickness(r){return Math.sqrt(Math.max(0,1-r*r))*(.13+.49*r*r);}
  for(let i=0;i<=radialSteps;i++){const r=i/radialSteps;profile.push(new T.Vector2(r,thickness(r)));}
  for(let i=radialSteps-1;i>=0;i--){const r=i/radialSteps;profile.push(new T.Vector2(r,-thickness(r)));}
  const disc=new T.LatheGeometry(profile.reverse(),64);
  const cellMaterial=new T.MeshPhysicalMaterial({color:0xb52d34,roughness:.36,metalness:.02,clearcoat:.42,clearcoatRoughness:.34,sheen:.35,sheenColor:new T.Color(0xff9a8b)});
  const highlighted=new T.MeshPhysicalMaterial({color:0xd44643,roughness:.30,metalness:.02,clearcoat:.50,clearcoatRoughness:.28,sheen:.42,sheenColor:new T.Color(0xffb5a3)});
  const focus=new T.Mesh(disc,highlighted);focus.position.set(0,0,-2);focus.scale.setScalar(2.05);focus.rotation.set(1.05,.15,.30);vessel.add(focus);

  const cells=[];
  for(let i=0;i<43;i++){
    const angle=random()*Math.PI*2,rad=2.9+random()*4.3,z=-30+random()*45;
    const m=new T.Mesh(disc,cellMaterial);
    m.position.set(Math.cos(angle)*rad,Math.sin(angle)*rad,z);
    m.rotation.set(random()*Math.PI,random()*Math.PI,random()*Math.PI);
    m.scale.setScalar(.85+random()*.9);
    vessel.add(m);cells.push({m,z,phase:random()*Math.PI*2});
  }
  const wall=new T.Mesh(new T.CylinderGeometry(9,9,90,64,1,true),new T.MeshStandardMaterial({color:0x4a1b26,roughness:.92,side:T.BackSide}));
  wall.rotation.x=Math.PI/2;wall.position.z=-15;vessel.add(wall);

  // Soft plasma depth bokeh particles for atmospheric scale cues.
  const bokehTex=makeSoftBokeh(T);
  const plasmaGeo=new T.BufferGeometry();
  plasmaGeo.setAttribute('position',new T.Float32BufferAttribute(Array.from({length:120*3},(_,i)=>i%3===2?-24+random()*36:(random()-.5)*14),3));
  const plasma=new T.Points(plasmaGeo,new T.PointsMaterial({map:bokehTex,size:.42,transparent:true,opacity:.26,depthWrite:false,blending:T.AdditiveBlending}));
  vessel.add(plasma);

  // Smooth high-resolution spheres for symbolic hemoglobin tetramers (replaces low-poly icosahedrons).
  const sphere=new T.SphereGeometry(.40,22,16);
  const lobes=new T.InstancedMesh(sphere,new T.MeshPhysicalMaterial({roughness:.36,metalness:.04,clearcoat:.34,clearcoatRoughness:.30,color:0xffffff}),1600);
  const matrix=new T.Object3D(),colors=[new T.Color(0xd08d7b),new T.Color(0x78bdc0),new T.Color(0xe0b97e),new T.Color(0x909ec0)];
  let instance=0;
  for(let i=0;i<80;i++){
    const x=(random()-.5)*16,y=(random()-.5)*11,z=-17+random()*20;
    const center=new T.Vector3(x,y,z);
    for(let j=0;j<4;j++){
      const a=j*Math.PI/2;
      for(let k=0;k<5;k++){
        matrix.position.set(center.x+.42*Math.cos(a)+(random()-.5)*.52,center.y+.42*Math.sin(a)+(random()-.5)*.52,center.z+(j%2?.22:-.22)+(random()-.5)*.50);
        matrix.rotation.set(random(),random(),random());
        matrix.scale.setScalar(.68+random()*.38);
        matrix.updateMatrix();
        lobes.setMatrixAt(instance,matrix.matrix);
        lobes.setColorAt(instance,colors[j]);
        instance++;
      }
    }
  }
  interior.add(lobes);

  const featured=new T.Group();
  for(let j=0;j<4;j++){
    const a=j*Math.PI/2,mat=new T.MeshPhysicalMaterial({color:colors[j],roughness:.32,metalness:.04,clearcoat:.42,clearcoatRoughness:.26});
    for(let k=0;k<5;k++){
      const m=new T.Mesh(sphere,mat);
      m.position.set(.42*Math.cos(a)+(random()-.5)*.52,.42*Math.sin(a)+(random()-.5)*.52,(j%2?.22:-.22)+(random()-.5)*.50);
      m.scale.setScalar(.72+random()*.32);
      featured.add(m);
    }
  }
  featured.position.set(0,0,-3);featured.scale.setScalar(1.7);interior.add(featured);

  let visible=true,frame=0,last=0,failed=false;
  function size(){const w=host.clientWidth,h=host.clientHeight;if(w<2||h<2)return false;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();return true;}
  function render(now=0){
    frame=0;if(failed||!visible||document.hidden)return;
    const scene=Number(gallery.dataset.scene);if(scene!==0&&scene!==1)return;
    const p=Math.max(0,Math.min(1,Number(gallery.dataset.sceneProgress)||0));
    const u=motion.matches?0:p*p*(3-2*p);
    const portrait=camera.aspect<.85;
    const distance=portrait?1.26:1;
    const w=host.clientWidth,h=host.clientHeight;
    if(portrait)camera.clearViewOffset();else camera.setViewOffset(w,h,-Math.round(w*.07),0,w,h);
    if(scene===0){
      camera.position.set(1.1*(1-u),.65*(1-u),-2+(15-9.1*u)*distance);
      camera.lookAt(0,0,-2);
      if(!motion.matches){for(const c of cells)c.m.position.z=c.z+Math.sin(now*.00032+c.phase)*.52;}
    }else{
      camera.position.set(.7*(1-u),.55*(1-u),-3+(14-8.7*u)*distance);
      camera.lookAt(0,0,-3);
      if(!motion.matches)featured.rotation.y=now*.00019;
    }
    try{renderer.render(scene===0?vessel:interior,camera);gallery.classList.add('depth-ready');}catch{fallback();return;}
    if(!motion.matches)frame=requestAnimationFrame(tick);
  }
  function tick(t){if(t-last<33){frame=requestAnimationFrame(tick);return;}last=t;render(t);}
  function schedule(){if(!frame&&!failed)frame=requestAnimationFrame(render);}
  function fallback(){failed=true;if(frame)cancelAnimationFrame(frame);frame=0;gallery.classList.remove('depth-ready');bokehTex.dispose();envRT.dispose();host.replaceChildren();}
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback();});
  try{if(!size()){fallback();return;}render();}catch{fallback();return;}
  const stateObserver=new MutationObserver(schedule);stateObserver.observe(gallery,{attributes:true,attributeFilter:['data-scene','data-scene-progress']});
  if('ResizeObserver' in window)new ResizeObserver(()=>{if(!failed&&size())schedule();}).observe(host);
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else if(frame){cancelAnimationFrame(frame);frame=0;}},{threshold:.01}).observe(gallery);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else schedule();});
  motion.addEventListener?.('change',schedule);
}
