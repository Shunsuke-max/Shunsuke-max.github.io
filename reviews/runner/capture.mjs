import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const out='review-result', raw='review-raw', url='http://127.0.0.1:4173/';
await Promise.all([mkdir(out,{recursive:true}),mkdir(raw,{recursive:true})]);
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const devices={pc:[1440,900],tablet:[768,1024],phone:[390,844]};
const modes=['no-preference','reduce'];
const results={environment:{browser:browser.version(),node:process.version,os:os.release(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,run:process.env.GITHUB_RUN_ID,sha:'2779261bba791209b8244f2e3eba9910c4e87fcd'},states:[],loads:[],events:[],perf:[],checks:{},errors:[]};
const write=()=>writeFile(out+'/measurements.json',JSON.stringify(results,null,2));
const flush=async()=>{await write();console.log('Recorded',results.states.length,'states');};
async function env(view,mode,{fault='',instrument=false}={}){
 const [width,height]=devices[view];
 const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:view!=='pc',isMobile:view!=='pc',locale:'ja-JP',reducedMotion:mode});
 if(fault==='webgl')await ctx.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t.includes('webgl')?null:get.call(this,t,...a);};});
 if(instrument)await ctx.addInitScript(()=>{
  const records=new Map();window.reviewGL=records;
  for(const api of [window.WebGLRenderingContext,window.WebGL2RenderingContext].filter(Boolean)){
   for(const name of ['clear','drawArrays','drawElements','drawElementsInstanced','drawArraysInstanced','createBuffer','deleteBuffer','createTexture','deleteTexture']){
    const proto=api.prototype,orig=proto[name];if(!orig)continue;
    proto[name]=function(...args){const r=records.get(this.canvas)||{};r[name]=(r[name]||0)+1;records.set(this.canvas,r);return orig.apply(this,args);};
   }
  }
  window.reviewLong=[];new PerformanceObserver(list=>window.reviewLong.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
 });
 const cors={'access-control-allow-origin':'*'};
 await ctx.route('https://cdn.jsdelivr.net/npm/**',async r=>{
  const u=new URL(r.request().url());const file=path.basename(u.pathname);
  const local=u.pathname.includes('/three@')?'three':'3dmol';
  await r.fulfill({path:path.resolve('node_modules',local,'build',file),contentType:'text/javascript',headers:cors});
 });
 await ctx.route('https://files.rcsb.org/download/*.pdb',async r=>{
  const name=path.basename(new URL(r.request().url()).pathname);
  if(fault==='pdb'&&name==='1CRN.pdb')return r.abort('failed');
  await r.fulfill({path:'/tmp/exhibit-pdb/'+name,contentType:'text/plain',headers:cors});
 });
 const p=await ctx.newPage(); const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,230));});
 await p.goto(url,{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>document.querySelector('#design').dataset.designSource);
 if(fault!=='webgl')await p.waitForFunction(()=>document.querySelector('#design').classList.contains('design-gl'));
 await p.evaluate(()=>document.fonts.ready);return {p,ctx,errors};
}
async function go(p,group,chapter,phase){
 const ids=group==='design'?['designJourney','design','designStep']:['scaleJourney','protein','scene'];
 await p.evaluate(({ids,chapter,phase})=>{const story=document.getElementById(ids[0]),stage=document.getElementById(ids[1]);scrollTo({top:scrollY+story.getBoundingClientRect().top+(story.offsetHeight-stage.offsetHeight)*(chapter+phase)/5,behavior:'instant'});},{ids,chapter,phase});
 await p.waitForFunction(({ids,chapter})=>Number(document.getElementById(ids[1]).dataset[ids[2]])===chapter,{ids,chapter});
 await p.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
}
async function shot(p,file){await p.screenshot({path:raw+'/'+file+'.jpg',type:'jpeg',quality:86,timeout:20000});}
async function state(p){
 return p.evaluate(()=>{
  const rect=s=>{const el=document.querySelector(s);if(!el||!el.getClientRects().length)return null;const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round);};
  const selected=['#designGraphPanel','#designSequencePanel','#designEvaluate'].map(s=>document.querySelector(s)).find(e=>!e.hidden);
  return {xOverflow:document.documentElement.scrollWidth-innerWidth,scrollY,focus:document.activeElement.id||document.activeElement.tagName,src:design.dataset.designSource,gl:design.classList.contains('design-gl'),ribbon:design.dataset.ribbonVisible,depth:protein.classList.contains('depth-ready'),heme:protein.dataset.hemeFocus,seq:designSequenceCount.textContent,panel:selected?[selected.id,selected.clientHeight,selected.scrollHeight]:null,boxes:Object.fromEntries(['.design-copy','.design-bottom','.design-legend','#designGraphPanel','#designSequencePanel','#designEvaluate','#designMessageToggle','#designSequence button','#designChoiceNote','.design-sampling','#scaleTitle','#molView','.gallery-dock'].map(s=>[s,rect(s)]))};
 });
}
async function timing(p){
 return p.evaluate(()=>({paint:performance.getEntriesByType('paint').map(x=>[x.name,x.startTime]),navigation:(()=>{const n=performance.getEntriesByType('navigation')[0];return {dcl:n.domContentLoadedEventEnd,load:n.loadEventEnd,response:n.responseEnd};})(),resources:performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,bytes:r.decodedBodySize,duration:r.duration})),readyObserved:performance.now(),title:document.title}));
}
async function imgsLoaded(p){await p.waitForTimeout(250);return p.locator('#works img').evaluateAll(xs=>xs.map(x=>[x.id||x.className,x.complete,x.naturalWidth]));}
try{
 for(const [view,wh] of Object.entries(devices))for(const mode of modes){
  const {p,ctx,errors}=await env(view,mode);results.loads.push({view,mode,...await timing(p)});
  if(view==='pc'&&mode==='no-preference')await shot(p,'entry');
  for(const group of ['design','scale'])for(let i=0;i<5;i++)for(const [phase,f] of [['start',.015],['mid',.50],['end',.98]]){
   await go(p,group,i,f);
   if(group==='scale'&&i>=2)await p.waitForFunction(()=>molStatus.hidden&&!!document.querySelector('#molHost canvas'));
   if(group==='scale'&&i<2)await p.waitForFunction(()=>protein.classList.contains('depth-ready'));
   await p.waitForTimeout(group==='scale'&&i===3&&phase==='start'?750:100);
   const file=[group,i+1,view,mode,phase].join('_');await shot(p,file);results.states.push({group,chapter:i+1,view,mode,phase,file,...await state(p)});
  }
  if(mode==='no-preference'){
   for(const id of ['foldlens','ensemble','part5','design']){
    await p.locator('#work-'+id).evaluate(e=>e.scrollIntoView({behavior:'instant',block:'start'}));
    const images=await imgsLoaded(p);await shot(p,'works_'+id+'_'+view);results.events.push({works:id,view,images});
   }
   if(view==='pc'){
    for(const [s,i] of [['[data-gallery=fold]',1],['[data-gallery=fold]',2],['[data-frame]',7],['[data-gallery=part]',1],['[data-gallery=part]',2],['[data-gallery=part]',3],['[data-phase-button]',1],['[data-phase-button]',2],['[data-phase-button]',3]]){
     const b=p.locator(s).nth(i);await b.click({timeout:5000});results.events.push({s,i,pressed:await b.getAttribute('aria-pressed'),text:await p.locator('#ensembleContacts,#phaseTitle,#foldCaption,#partTitle').allTextContents()});
    }
   }
  }
  results.errors.push({view,mode,errors});await ctx.close();await flush();
 }
 const {p,ctx}=await env('phone','reduce');await go(p,'design',2,.5);
 await p.locator('#designResidueSelect').focus();await p.keyboard.press('Home');await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');
 await p.locator('#designMessageToggle').tap();results.checks.touchGraph=await p.locator('#designMessageToggle').getAttribute('aria-pressed');
 results.checks.focusedResidue=await p.locator('#design').getAttribute('data-focus-residue');
 await p.locator('[data-design-jump="3"]').tap();await p.waitForFunction(()=>design.dataset.designStep==='3');
 results.checks.carry=await p.locator('#designSequence button.focused').getAttribute('data-residue');
 await p.locator('#designSequence button').first().focus();let keys=0;while(keys<55&&await p.locator('#designSequence button:focus').count()){await p.keyboard.press('Tab');keys++}results.checks.tabsToChoice=keys;
 await p.locator('button[data-aa-choice="S"]').tap();results.checks.serine=await p.locator('#designChoiceNote').innerText();await shot(p,'seq-scroll-phone');
 await p.locator('button[data-compare="different"]').count();await go(p,'design',4,.5);await p.locator('button[data-compare="different"]').tap();await shot(p,'different-phone');results.checks.compare=await p.locator('#design').getAttribute('data-compare');
 await go(p,'scale',4,.50);for(const id of ['1MBN','1UBQ','1LYZ','1CRN','4HHB']){
  await p.locator('#molSelect').selectOption(id);await p.waitForFunction(()=>molStatus.hidden);results.events.push({id,meta:await p.locator('#molMeta').innerText()});
 }await p.locator('#molView').focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('+');results.checks.galleryFocus=await p.evaluate(()=>document.activeElement.id);await ctx.close();
 for(const fault of ['webgl','pdb']){
  const {p,ctx,errors}=await env('pc','reduce',{fault});
  for(const [group,i] of [['design',1],['design',2],['design',3],['scale',0],['scale',2],['scale',4]]){
   await go(p,group,i,.5);await shot(p,'fault_'+fault+'_'+group+'_'+(i+1));results.events.push({fault,group,i,...await state(p),neighbors:await p.locator('#designNeighbors').textContent(),status:await p.locator('#molStatus').textContent(),retryVisible:await p.locator('#molRetry').isVisible()});
  }results.errors.push({fault,errors});await ctx.close();
 }
 const e=await env('pc','no-preference',{instrument:true});const pg=e.p;
 async function profile(label,scroll=false){
  const m=await pg.evaluate(async(scroll)=>{
   const snapshot=()=>Object.fromEntries([...window.reviewGL.entries()].map(([c,r])=>[c.parentElement?.id||'other',{...r}]));
   const start=snapshot(),t0=performance.now();const frame=[],y0=scrollY;let prev=t0;
   const longIndex=window.reviewLong.length;
   await new Promise(done=>{function tick(t){frame.push(t-prev);prev=t;if(scroll)scrollTo({top:y0+Math.min(t-t0,2000)*.6,behavior:'instant'});if(t-t0>=2000)done();else requestAnimationFrame(tick)}requestAnimationFrame(tick)});
   const sorted=frame.slice(1).sort((a,b)=>a-b);
   return {elapsedMs:performance.now()-t0,intervals:sorted.length,rafP50:sorted[Math.floor(sorted.length*.5)],rafP95:sorted[Math.floor(sorted.length*.95)],start,end:snapshot(),longTasks:window.reviewLong.slice(longIndex),jsHeap:performance.memory?.usedJSHeapSize};
  },scroll);results.perf.push({label,...m});
 }
 for(const mode of modes){await pg.emulateMedia({reducedMotion:mode});await go(pg,'design',2,.5);await pg.waitForTimeout(250);await profile('graph-'+mode);}
 await pg.emulateMedia({reducedMotion:'no-preference'});await go(pg,'design',0,.01);await profile('scroll-design',true);
 await go(pg,'scale',4,.5);await pg.waitForTimeout(300);await pg.locator('#works').evaluate(el=>el.scrollIntoView({behavior:'instant'}));await pg.waitForTimeout(250);await profile('works-after-gallery');
 await pg.emulateMedia({reducedMotion:'reduce'});await go(pg,'design',4,.5);for(let batch=0;batch<3;batch++){
  for(let j=0;j<10;j++){await pg.locator('button[data-compare="'+(j%2?'close':'different')+'"]').click();await pg.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
  await profile('compare-after-'+(batch+1)*10);
 }
 await pg.locator('.skip').focus();await pg.keyboard.press('Enter');results.checks.skip=await pg.evaluate(()=>[location.hash,document.activeElement.id]);
 await go(pg,'design',2,.5);await pg.locator('#designMessageToggle').focus();await go(pg,'design',3,.5);results.checks.hideFocus=await pg.evaluate(()=>document.activeElement.id||document.activeElement.tagName);
 results.checks.axGraph=await (async()=>{await go(pg,'design',2,.5);return (await pg.locator('#design').ariaSnapshot()).slice(0,4500);})();
 const cdp=await pg.context().newCDPSession(pg);const gpu=await pg.evaluate(()=>{const gl=document.querySelector('#designWebGL canvas').getContext('webgl2');const info=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(info.UNMASKED_RENDERER_WEBGL);});results.environment.gl=gpu;
 await pg.setViewportSize({width:320,height:568});await go(pg,'design',3,.95);await shot(pg,'small-sequence');results.checks.small=await state(pg);
 await e.ctx.close();await flush();
} finally {await write();await browser.close();}
