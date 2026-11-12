// Isolated GPU acceptance. No ST data, real accounts or remote resources are used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const output=process.env.NVWA_GPU_OUTPUT;
const moduleName=process.env.NVWA_PLAYWRIGHT_MODULE||'playwright';
const {chromium,webkit}=await import(path.isAbsolute(moduleName)?pathToFileURL(moduleName).href:moduleName);
const fixture=JSON.parse(await fs.readFile(path.join(root,'dev/verify/fixtures/ball-raster-v17.json'),'utf8'));
const server=http.createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 if(name==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module">import{rasterBall,buildBallJob,packBallFrame}from"/ball-raster.js";import{createBallGPU}from"/ball-gpu.js";import{createAdaptiveBallRaster,compareBallRasters}from"/adaptive-ball-raster.js";import{createBallGlass}from"/ball-glass.js";window.api={rasterBall,buildBallJob,packBallFrame,createBallGPU,createAdaptiveBallRaster,compareBallRasters,createBallGlass};</script>');return;}
 if(name==='/no-gpu-worker.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(kind,...args){return kind==="webgl2"?null:get.call(this,kind,...args);};await import("/glass-worker.js");');return;}
 const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!file.endsWith('.js')){res.writeHead(404);res.end();return;}try{const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':'text/javascript'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=process.env.NVWA_GPU_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,...(process.env.NVWA_BROWSER_EXECUTABLE?{executablePath:process.env.NVWA_BROWSER_EXECUTABLE}:{})});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>r.request().url().startsWith(origin)||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
 await page.goto(origin);await page.waitForFunction(()=>window.api);
 const result=await page.evaluate(async fixture=>{
  const {buildBallJob,rasterBall,createBallGPU,compareBallRasters,createAdaptiveBallRaster}=window.api;
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
  const workers=[];let gpu;
  const open=async url=>{const worker=new Worker(url,{type:'module'});workers.push(worker);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker-ready-timeout')),5000);worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.onmessage=e=>{clearTimeout(timer);if(e.data.type==='ready'&&e.data.ok)resolve();else reject(Error('worker-not-ready'));};});return worker;};
  let serial=0;
  const send=(worker,job,graphics='adaptive')=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker-render-timeout')),5000),id=++serial;worker.onmessage=e=>{if(e.data.id!==id)return;clearTimeout(timer);if(e.data.type==='result')resolve(e.data);else reject(Error('worker-render-error'));};worker.postMessage({type:'render',id,job,graphics});});
  const make=item=>{const shape=fixture.shapes[item.shape];return buildBallJob(shape.b,shape.t,fixture.materials[item.material],30,item.low,2,shape.shadow!==false);};
  const seed=make(fixture.cases.find(c=>c.material===7&&c.shape===2&&!c.low));
  try{
   let directUnavailable='';try{gpu=createBallGPU();}catch(e){directUnavailable=e.message;}
   let pixelCases=0,maxChannelDelta=0,decodedImages=0;
   const decode=async url=>{const bitmap=await createImageBitmap(await(await fetch(url)).blob());const c=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,c.width,c.height).data;};
   if(gpu){
    for(const item of fixture.cases){const job=make(item),delta=compareBallRasters(rasterBall(job),gpu.raster(job));check(delta<=1,'GPU image mismatch: '+JSON.stringify(item)+' delta='+delta);maxChannelDelta=Math.max(maxChannelDelta,delta);pixelCases++;}
    for(const material of fixture.materials)for(const dpr of [1,1.25,1.5,2]){
     const shape=fixture.shapes[2],b={...shape.b,cx:shape.b.cx+.317,cy:shape.b.cy-.219,R:shape.b.R*1.127};const job=buildBallJob(b,shape.t,material,30,false,dpr,true),delta=compareBallRasters(rasterBall(job),gpu.raster(job));check(delta<=1,'Fractional DPR mismatch '+material.key+' dpr='+dpr);pixelCases++;maxChannelDelta=Math.max(maxChannelDelta,delta);
    }
   }
   const cpuWorker=await open('/glass-worker.js'),adaptiveWorker=await open('/glass-worker.js');
   const coldAt=performance.now(),first=await send(adaptiveWorker,seed),calibrationRoundTripMs=performance.now()-coldAt;
   check(['gpu','cpu'].includes(first.graphics.state),'Adaptive selection did not settle');
   const unsupported=await open('/no-gpu-worker.js'),fallback=await send(unsupported,seed);
   check(fallback.graphics.state==='cpu'&&fallback.graphics.failures===1,'Unavailable GPU did not retain CPU worker');
   const expected=await send(cpuWorker,seed,'cpu');
   for(const field of ['cover','inv','reflection']){const a=await decode(expected.frame[field]),b=await decode(fallback.frame[field]);check(a.length===b.length&&a.every((v,i)=>v===b[i]),'Fallback pixels changed');decodedImages++;}
   const timings=[];
   for(const material of [0,4,7,10])for(const shape of [1,2])for(const low of [true,false]){
    const job=make({material,shape,low});await send(cpuWorker,job,'cpu');await send(adaptiveWorker,job);
    const cpu=[],accelerated=[];let graphics;
    for(let n=0;n<7;n++){
     const run=async(worker,mode,list)=>{const at=performance.now(),result=await send(worker,job,mode);list.push(performance.now()-at);return result;};
     if(n%2){graphics=(await run(adaptiveWorker,'adaptive',accelerated)).graphics;await run(cpuWorker,'cpu',cpu);}else{await run(cpuWorker,'cpu',cpu);graphics=(await run(adaptiveWorker,'adaptive',accelerated)).graphics;}
    }
    timings.push({material:fixture.materials[material].key,shape:fixture.shapes[shape].name,low,cpuMedianMs:median(cpu),adaptiveMedianMs:median(accelerated),selected:graphics.state,reason:graphics.reason});
   }
   let contextLossFallback=false;
   if(gpu){
    const canvas=new OffscreenCanvas(2,2);let time=0;
    const engine=createAdaptiveBallRaster({cpu:job=>{time+=10;return rasterBall(job);},clock:()=>time,gpuFactory:()=>{const actual=createBallGPU({canvasFactory:()=>canvas});return{...actual,raster:job=>{time+=1;return actual.raster(job);}};}});
    engine.render(seed);check(engine.status().state==='gpu','Controlled loss test did not select GPU');
    const gl=canvas.getContext('webgl2');gl.getExtension('WEBGL_lose_context').loseContext();await new Promise(r=>setTimeout(r,30));
    const recovered=engine.render(seed);check(engine.status().state==='cpu'&&engine.status().reason==='gpu-render-failed','Context loss did not fall back');check(compareBallRasters(rasterBall(seed),recovered)===0,'Context loss changed CPU output');engine.dispose();contextLossFallback=true;
   }
   // Exercise the actual presentation consumer with its real adaptive worker.
   const renderer=window.api.createBallGlass(),shape=fixture.shapes[2],material=fixture.materials[7];
   let presentation;
   try{
    renderer.paint(shape.b,shape.t,material,30,false);
    const began=performance.now();while(renderer.status().mode==='starting'&&performance.now()-began<3000)await new Promise(r=>setTimeout(r,5));
    renderer.paint({...shape.b,R:shape.b.R+.48},shape.t,material,30,false);
    const next=performance.now();while((renderer.status().workerFrames<1||renderer.status().current!==renderer.status().wanted)&&performance.now()-next<3000)await new Promise(r=>setTimeout(r,5));
    const status=renderer.status();check(status.workerFrames>=1&&status.current===status.wanted,'Actual ball presentation did not apply adaptive result');check(document.getElementById('ilg-ball-glass'),'Actual ball glass not mounted');presentation={mode:status.mode,graphics:status.graphics,latestApplied:true};
   }finally{renderer.remove();}
   check(!document.getElementById('ilg-ball-glass'),'Ball presentation cleanup left a layer');presentation.removed=true;
   return{pixelCases,maxChannelDelta,decodedImages,directUnavailable,calibrationRoundTripMs,initialSelection:first.graphics,timings,gpuUnavailableRetainsWorker:true,contextLossFallback,presentation,physicalPhone:false};
  }finally{gpu?.dispose();for(const worker of workers)worker.terminate();}
 },fixture);
 assert.equal(errors.length,0,errors.join('\n'));
 const report={passed:true,observedAt:new Date().toISOString(),environment:process.env.NVWA_GPU_ENGINE==='webkit'?'Desktop Playwright WebKit':'Windows desktop Edge',browser:browser.version(),pageErrors:errors,...result};
 if(output)await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
