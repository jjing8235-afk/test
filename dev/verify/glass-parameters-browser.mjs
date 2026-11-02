// Deterministic work counts for parameter changes; optional browser dependency, no installs.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import http from 'node:http';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(process.env.NVWA_EXTENSION_ROOT||fileURLToPath(new URL('../../',import.meta.url)));
const moduleName=process.env.NVWA_PLAYWRIGHT_MODULE||'playwright';const {chromium}=await import(path.isAbsolute(moduleName)?pathToFileURL(moduleName).href:moduleName);
const baseline=process.env.NVWA_EXPECT_BASELINE==='1';
const template=fs.readFileSync(path.join(root,'dev/verify/shared-performance-browser.mjs'),'utf8');
const html=vm.runInNewContext('('+template.slice(template.indexOf('function html(count)'),template.indexOf('const server=http.createServer'))+')');
const hooks=[['function paint(el) {','function paint(el) { window.glassWork.paints++;'],['function repaintVisible() {','function repaintVisible() { window.glassWork.visiblePaints++;'],['function lightAngle(el) {','function lightAngle(el) { window.glassWork.angleReads++;'],['f.innerHTML = physicalFilter(maps, o, w, h, angle);','window.glassWork.rebuilds++; f.innerHTML = physicalFilter(maps, o, w, h, angle);']];
let index=fs.readFileSync(path.join(root,'index.js'),'utf8');for(const[from,to]of hooks){assert(index.includes(from));index=index.replace(from,to)}
let engine=fs.readFileSync(path.join(root,'glass2.js'),'utf8').replace('export function updatePhysicalLighting(filter, o) {','export function updatePhysicalLighting(filter, o) { window.glassWork.patches++;');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/'){res.setHeader('content-type','text/html;charset=utf-8');res.end(html(Number(u.searchParams.get('floors'))||4).replace('<script>','<script>window.glassWork={paints:0,visiblePaints:0,rebuilds:0,patches:0,angleReads:0,pngEncodes:0};window.resetGlassWork=()=>{for(const k in glassWork)glassWork[k]=0};const nativePNG=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(...args){glassWork.pngEncodes++;return nativePNG.apply(this,args)};'));return;}if(u.pathname.startsWith('/extension/')){const f=path.resolve(root,decodeURIComponent(u.pathname.slice(11)));if(f.startsWith(root+path.sep)&&fs.existsSync(f)){res.setHeader('content-type',f.endsWith('.css')?'text/css':f.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(f===path.join(root,'index.js')?index:f===path.join(root,'glass2.js')?engine:fs.readFileSync(f));return;}}res.writeHead(u.pathname==='/favicon.ico'?204:404);res.end();});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.NVWA_EDGE_EXECUTABLE||undefined});const results=[],errors=[];
try{for(const floors of [4,240]){const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port+'/?floors='+floors);await page.waitForFunction(()=>fixtureReady||fixtureFailure);assert.equal(await page.evaluate(()=>fixtureFailure),null);await page.evaluate(()=>settle());
const measure=async fn=>{await page.evaluate(()=>resetGlassWork());await page.evaluate(fn);await page.evaluate(()=>settle());return page.evaluate(()=>({...glassWork}))};
const presets=[];for(const preset of ['ultra','depth','thin','standard','thick','extreme']){
await page.evaluate(name=>{document.querySelector('[data-preset="'+name+'"]').click()},preset);await page.evaluate(()=>settle());
const css=await measure(()=>{change('ilg-opt-pShadow',.65);change('ilg-opt-pSheen',.15);change('ilg-opt-mesTint',.45);change('ilg-opt-tint',.06)});
const lighting=await measure(()=>{change('ilg-opt-pSpecular',1.15);change('ilg-opt-pSharp',5.5)});
if(!baseline){assert.equal(css.paints,0,preset+' CSS-only paint');assert.equal(css.rebuilds,0);assert.equal(css.pngEncodes,0);assert(lighting.patches>0,preset+' scalar patch');assert.equal(lighting.rebuilds,0,preset+' scalar rebuild');assert.equal(lighting.pngEncodes,0);}
presets.push({preset,css,lighting});}
await page.evaluate(()=>{document.querySelector('[data-preset="natural"]').click()});await page.evaluate(()=>settle());
const natural=await measure(()=>{dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:280,clientY:360}))});if(!baseline)assert.equal(natural.angleReads,0);
await page.evaluate(()=>{document.querySelector('[data-preset="depth"]').click()});await page.evaluate(()=>settle());
const mixed=await measure(()=>{change('ilg-opt-pStrength',1.45);change('ilg-opt-pShadow',.8)});assert.equal(mixed.visiblePaints,1,'Mixed CSS / geometry burst paints once');
let equivalence=null;if(!baseline){equivalence=await page.evaluate(async()=>{const {physicalFilter,updatePhysicalLighting}=await import('/extension/glass2.js');const NS='http://www.w3.org/2000/svg';const maps={full:{d:'data:image/svg+xml,<svg/>',n:'data:image/svg+xml,<svg/>'},scale:12};let o={profile:'squircle',strength:1,ior:1.5,blur:3,saturate:1.2,brightness:1,contrast:1,aberration:0,specular:1,sharp:4,edgeShade:.2,fresnel:.1,caustic:.2};const filter=document.createElementNS(NS,'filter');filter.innerHTML=physicalFilter(maps,o,300,150,135);const nodes=[...filter.querySelectorAll('*')];const checks=[];for(const value of [1.6,.3,2]){o={...o,specular:value,sharp:3+value,edgeShade:value/3,fresnel:value/4,caustic:value/2};const patched=updatePhysicalLighting(filter,o);const fresh=document.createElementNS(NS,'filter');fresh.innerHTML=physicalFilter(maps,o,300,150,135);checks.push(patched&&filter.innerHTML===fresh.innerHTML&&[...filter.querySelectorAll('*')].every((n,i)=>n===nodes[i]));}const off=document.createElementNS(NS,'filter');off.innerHTML=physicalFilter(maps,{...o,specular:0},300,150,135);return{checks,topologyNeedsRebuild:updatePhysicalLighting(off,o)===false};});assert(equivalence.checks.every(Boolean),'Patched SVG equals fresh filter and retains all nodes');assert(equivalence.topologyNeedsRebuild);assert((await page.locator('#ilg-opt-compatibilityMode option[value="blur"]').innerText()).includes('通用普通玻璃'));}

let combinations=null;
if(!baseline){combinations=await page.evaluate(async()=>{
const wait=async()=>{await new Promise(r=>setTimeout(r,70));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)};
const globalChoices=['natural','ultra','depth','thin','standard','thick','extreme','ordinary'];
const chatChoices=['inherit','ordinary','natural','ultra','depth','thin','standard','thick','extreme'];
let cases=0;
for(const outer of globalChoices){change('ilg-opt-compatibilityMode',outer==='ordinary'?'blur':'auto');if(outer!=='ordinary')document.querySelector('[data-preset="'+outer+'"]').click();await wait();
for(const inner of chatChoices){change('ilg-surface-mes',inner);await wait();const bar=document.getElementById('nonQRFormItems'),mes=document.querySelector('#chat .mes');
const expectedOuter=outer!=='ordinary',expectedInner=inner==='inherit'?expectedOuter:inner!=='ordinary';
if(bar.classList.contains('ilg-phys')!==expectedOuter||mes.classList.contains('ilg-phys')!==expectedInner)throw Error('Surface pairing failed '+outer+'/'+inner);
cases++;}}
change('ilg-surface-mes','depth');await wait();
const settings=SillyTavern.getContext().extensionSettings.iosLiquidGlass,shared=settings.pStrength;
change('ilg-surface-mes-pStrength',1.95);await wait();if(settings.pStrength!==shared||settings.glassSurfaces.mes.pStrength!==1.95)throw Error('Chat strength leaked to shared settings');
const ownBefore=JSON.stringify(settings.glassSurfaces.mes);change('ilg-opt-pStrength',1.1);await wait();if(JSON.stringify(settings.glassSurfaces.mes)!==ownBefore)throw Error('Global strength overwrote independent chat');
resetGlassWork();change('ilg-surface-mes-pShadow',.9);await wait();const shadowWork={...glassWork};if(shadowWork.paints!==0||shadowWork.rebuilds!==0)throw Error('Chat shadow needlessly repainted glass');
const input=document.getElementById('nonQRFormItems');const inputStyle=input.style.cssText;
resetGlassWork();change('ilg-surface-mes-pSpecular',1.4);await wait();const chatWork={...glassWork};if(input.style.cssText!==inputStyle)throw Error('Chat light modified input surface');if(chatWork.rebuilds!==0||chatWork.patches<1)throw Error('Chat light failed to reuse filter nodes');
change('ilg-surface-mes','inherit');await wait();if(document.querySelector('#chat .mes').style.getPropertyValue('--ilg-shadow-k'))throw Error('Inherited chat retained scoped shadow');
change('ilg-surface-mes','ordinary');await wait();change('ilg-opt-enabled',false);await wait();if(document.querySelector('#chat .ilg-glass'))throw Error('Disable retained message glass');change('ilg-opt-enabled',true);await wait();if(document.querySelector('#chat .mes').classList.contains('ilg-phys'))throw Error('Re-enable lost ordinary chat choice');
return{cases,sharedStrengthPreserved:true,globalChangesPreserveChat:true,shadowWork,chatWork,inheritCleanup:true,reenablePreservesChoice:true};});}

results.push({floors,presets,natural,mixed,equivalence,combinations});await page.close();}assert.deepEqual(errors,[]);console.log(JSON.stringify({kind:'glass-parameter-work-counts',baseline,results,errors,limitations:['Synthetic desktop browser at phone width; work counts are not phone FPS or energy.']},null,2));}finally{await browser.close();server.close();}
