import { chromium } from 'playwright';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const output='review-result', url='http://127.0.0.1:4173/';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const d={run:process.env.GITHUB_RUN_ID,browser:browser.version(),load:[],probes:[],errors:[]};
const save=()=>writeFile(output+'/probes.json',JSON.stringify(d,null,2));
async function context(options={}){
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,locale:'ja-JP',...options});
 await ctx.addInitScript(()=>{
  window.reviewVitals={lcp:null,layout:0};
  for(const [type,visit] of [['largest-contentful-paint',e=>window.reviewVitals.lcp=[e.startTime,e.element?.id,e.size]],['layout-shift',e=>{if(!e.hadRecentInput)window.reviewVitals.layout+=e.value}]]){
   new PerformanceObserver(l=>l.getEntries().forEach(visit)).observe({type,buffered:true});
  }
  window.reviewReady={};new MutationObserver(()=>{const g=document.getElementById('design');if(!g)return;
   if(!window.reviewReady.reference&&g.dataset.designSource==='1CRN')window.reviewReady.reference=performance.now();
   if(!window.reviewReady.gl&&g.classList.contains('design-gl'))window.reviewReady.gl=performance.now();
  }).observe(document,{subtree:true,attributes:true,attributeFilter:['class','data-design-source']});
 });
 return ctx;
}
async function localAssets(ctx){
 const headers={'access-control-allow-origin':'*'};
 await ctx.route('https://cdn.jsdelivr.net/npm/**',r=>{const u=new URL(r.request().url());return r.fulfill({path:path.resolve('node_modules',u.pathname.includes('/three@')?'three':'3dmol','build',path.basename(u.pathname)),contentType:'text/javascript',headers});});
 await ctx.route('https://files.rcsb.org/download/*.pdb',r=>r.fulfill({path:'/tmp/exhibit-pdb/'+path.basename(new URL(r.request().url()).pathname),contentType:'text/plain',headers}));
}
async function go(p,design,n,part=.5){const id=design?['designJourney','design','designStep']:['scaleJourney','protein','scene'];await p.evaluate(({id,n,part})=>{const a=document.getElementById(id[0]),b=document.getElementById(id[1]);scrollTo({top:scrollY+a.getBoundingClientRect().top+(a.offsetHeight-b.offsetHeight)*(n+part)/5,behavior:'instant'});},{id,n,part});await p.waitForFunction(({id,n})=>document.getElementById(id[1]).dataset[id[2]]===String(n),{id,n});await p.waitForTimeout(250);}
async function perform(name,fn){try{d.probes.push({name,result:await fn()});}catch(e){d.errors.push([name,e.message.slice(0,300)])}await save();}
async function shot(p,name){await p.screenshot({path:output+'/'+name+'.jpg',type:'jpeg',quality:87});}
for(const [kind,target] of [['local-network',url],['published','https://shunsuke-max.github.io/']]){
 for(let trial=1;trial<=3;trial++){
  const ctx=await context();try{
   const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p),req=new Map();
   await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   cdp.on('Network.responseReceived',x=>{req.set(x.requestId,{url:x.response.url,status:x.response.status,type:x.type});});
   cdp.on('Network.loadingFinished',x=>{if(req.has(x.requestId))req.get(x.requestId).bytes=x.encodedDataLength;});
   await p.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
   await p.waitForFunction(()=>design.dataset.designSource&&design.classList.contains('design-gl'),undefined,{timeout:18000}).catch(()=>{});
   await p.waitForTimeout(1200);
   const metrics=await p.evaluate(()=>({title:document.title,scene:design.dataset.designStep,hasGraph:!!document.getElementById('designGraphPanel'),reference:design.dataset.designSource,gl:design.classList.contains('design-gl'),tEnd:performance.now(),ready:window.reviewReady,vitals:window.reviewVitals,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,nav:performance.getEntriesByType('navigation')[0].toJSON()}));
   const resources=[...req.values()].filter(x=>x.url.startsWith('http')).map(x=>({...x,url:x.url.split('?')[0]}));
   d.load.push({kind,trial,metrics,resources});
   if(trial===1&&kind==='published')await shot(p,'published-entry');
  }catch(e){d.errors.push([kind,trial,e.message.slice(0,500)]);}finally{await ctx.close();await save();}
 }
}
const ctx=await context({reducedMotion:'reduce'});await localAssets(ctx);
const p=await ctx.newPage();await p.goto(url);await p.waitForFunction(()=>design.dataset.designSource==='1CRN'&&design.classList.contains('design-gl'));
await perform('live preference in free exploration',async()=>{
 await p.emulateMedia({reducedMotion:'no-preference'});await go(p,false,4);
 const before=await p.locator('#molSpin').getAttribute('aria-pressed');await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(500);
 const after=await p.locator('#molSpin').getAttribute('aria-pressed');await shot(p,'gallery-motion-change');return {before,after,preference:await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)};
});
await perform('wheel across design and free exploration',async()=>{
 const vals=[];for(const [design,chapter] of [[true,1],[false,2],[false,4]]){
  await go(p,design,chapter);const before=await p.evaluate(()=>scrollY);await p.mouse.move(850,420);await p.mouse.wheel(0,340);await p.waitForTimeout(350);vals.push([design?'design':'scale',chapter+1,before,await p.evaluate(()=>scrollY)]);
 }return vals;
});
await perform('invisible view in keyboard navigation',async()=>{
 await go(p,false,0);await p.locator('#molView').focus();return p.evaluate(()=>({active:document.activeElement.id,visibility:getComputedStyle(molView).visibility,opacity:getComputedStyle(molView).opacity,pointer:getComputedStyle(molView).pointerEvents,scene:protein.dataset.scene}));
});
await perform('context loss design and depth',async()=>{
 await go(p,true,1);const before=await p.locator('#design').getAttribute('class');
 await p.locator('#designWebGL canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
 await p.waitForFunction(()=>!design.classList.contains('design-gl'));await shot(p,'lost-design');
 await go(p,false,0);const beforeDepth=await p.locator('#protein').getAttribute('class');
 await p.locator('#depthScene canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await p.waitForFunction(()=>!protein.classList.contains('depth-ready'));await shot(p,'lost-depth');
 return {before,beforeDepth,after:await p.locator('#design').getAttribute('class'),afterDepth:await p.locator('#protein').getAttribute('class')};
});
await ctx.close();
const m=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await localAssets(m);
const phone=await m.newPage();await phone.goto(url);await phone.waitForFunction(()=>design.dataset.designSource==='1CRN'&&design.classList.contains('design-gl'));
await perform('touch panel and canvas',async()=>{
 const cdp=await m.newCDPSession(phone);
 async function swipe(x,y,dy){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/8}]});await phone.waitForTimeout(24);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await phone.waitForTimeout(550);
 }
 await go(phone,true,3,.6);const box=await phone.locator('#designSequencePanel').boundingBox();const positions=()=>phone.evaluate(()=>[scrollY,designSequencePanel.scrollTop,designSequencePanel.clientHeight,designSequencePanel.scrollHeight]);
 let before=await positions();await swipe(box.x+box.width*.5,box.y+box.height*.88,-Math.min(box.height*.6,110));let after=await positions();await swipe(box.x+box.width*.5,box.y+box.height*.88,-Math.min(box.height*.6,110));let end=await positions();const outside=await positions();await swipe(160,415,-150);return {before,after,end,outside,afterOutside:await positions()};
});
await perform('contrast and target centers',async()=>{
 await go(phone,true,3,.95);
 return phone.evaluate(()=>{const ss=['.design-copy p','.design-kicker','.design-prob','#designSequence button.on','#designSequence button.focused','.design-step-nav button span','.design-step-nav button:not([aria-current]) span'];let o={};
 for(const s of ss){const a=document.querySelector(s),c=getComputedStyle(a),r=a.getBoundingClientRect();o[s]={color:c.color,background:c.backgroundColor,font:c.fontSize,rect:[r.x,r.y,r.width,r.height]};}const b=[...designSequence.children].slice(0,3).map(e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]});return {styles:o,centers:b};});
});
await perform('same focus in two chapters',async()=>{
 await go(phone,true,2);await phone.locator('#designResidueSelect').selectOption('12');const graph=await phone.locator('#designNeighbors').innerText();await shot(phone,'residue13-graph');await go(phone,true,3);const seq=await phone.locator('#designSequence button.focused').getAttribute('aria-label');await shot(phone,'residue13-sequence');return {graph,seq};
});
await m.close();await save();await browser.close();
