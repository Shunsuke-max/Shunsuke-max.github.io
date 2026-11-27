import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const view=process.env.REVIEW_SEGMENT;
const dims={pc:[1440,900],tablet:[768,1024],phone:[390,844]};
const [width,height]=dims[view];
const raw='review-raw',out='review-result';
await mkdir(raw,{recursive:true});await mkdir(out,{recursive:true});
const data={states:[],events:[],errors:[],run:process.env.GITHUB_RUN_ID};
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const ctx=await b.newContext({viewport:{width,height},locale:'ja-JP',deviceScaleFactor:1,isMobile:view!=='pc',hasTouch:view!=='pc',reducedMotion:'no-preference'});
 const headers={'access-control-allow-origin':'*'};
 await ctx.route('https://cdn.jsdelivr.net/npm/**',r=>{const u=new URL(r.request().url());return r.fulfill({path:path.resolve('node_modules',u.pathname.includes('/three@')?'three':'3dmol','build',path.basename(u.pathname)),headers,contentType:'text/javascript'});});
 await ctx.route('https://files.rcsb.org/download/*.pdb',r=>r.fulfill({path:'/tmp/exhibit-pdb/'+path.basename(new URL(r.request().url()).pathname),contentType:'text/plain',headers}));
 const p=await ctx.newPage();p.setDefaultTimeout(12000);
 // Pause the existing viewer by its normal input handler, before auto-spin saturates the software GPU.
 await p.addInitScript(()=>{window.addEventListener('DOMContentLoaded',()=>{
  const gallery=document.getElementById('protein'),host=document.getElementById('molHost');
  const lock=()=>{if(['2','4'].includes(gallery.dataset.scene))host.dispatchEvent(new PointerEvent('pointerdown',{bubbles:false}));};
  new MutationObserver(lock).observe(gallery,{attributes:true,attributeFilter:['data-scene']});
 });});
 await p.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>molStatus.hidden&&design.dataset.designSource==='1CRN');
 const ss=async key=>{await p.screenshot({path:raw+'/'+key+'.jpg',quality:86,type:'jpeg',timeout:25000});};
 for(const [i,kind] of [[2,'protein'],[3,'heme'],[4,'explore']])for(const [phase,f] of [['start',.015],['mid',.50],['end',.98]]){
  await p.evaluate(({i,f})=>{scrollTo({top:scrollY+scaleJourney.getBoundingClientRect().top+(scaleJourney.offsetHeight-protein.offsetHeight)*(i+f)/5,behavior:'instant'});},{i,f});
  await p.waitForFunction(i=>+protein.dataset.scene===i,i);await p.waitForTimeout(400);
  const file=['scale',i+1,view,'no-preference',phase].join('_');
  await ss(file);data.states.push({group:'scale',chapter:i+1,phase,view,mode:'no-preference',file,spinPausedForCapture:i!==3,...await p.evaluate(()=>({xOverflow:document.documentElement.scrollWidth-innerWidth,scrollY,src:design.dataset.designSource,gl:design.classList.contains('design-gl'),depth:protein.classList.contains('depth-ready'),heme:protein.dataset.hemeFocus,spin:molSpin.getAttribute('aria-pressed'),molReady:molStatus.hidden}))});
 }
 for(const id of ['foldlens','ensemble','part5','design']){
  await p.locator('#work-'+id).evaluate(e=>e.scrollIntoView({behavior:'instant',block:'start'}));
  const images=p.locator('#work-'+id+' img');
  for(const img of await images.all())await img.evaluate(e=>Promise.race([e.decode().catch(()=>{}),new Promise(r=>setTimeout(r,3500))]));
  await ss('works_'+id+'_'+view);data.events.push({works:id,view,widths:await images.evaluateAll(xs=>xs.map(x=>x.naturalWidth))});
 }
 if(view==='pc'){
  for(const [s,i] of [['[data-gallery=fold]',1],['[data-gallery=fold]',2],['[data-frame]',7],['[data-gallery=part]',1],['[data-gallery=part]',2],['[data-gallery=part]',3],['[data-phase-button]',1],['[data-phase-button]',2],['[data-phase-button]',3]]){
   const el=p.locator(s).nth(i);await el.click();data.events.push({s,i,pressed:await el.getAttribute('aria-pressed'),content:await p.locator('#ensembleContacts,#phaseTitle,#foldCaption,#partTitle').allTextContents()});
  }
 }
} catch(e){data.errors.push(e.message);console.error(e.message);}finally{await writeFile(out+'/supplement-'+view+'.json',JSON.stringify(data));await b.close();}
