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
 if(name==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module">import{rasterBall,buildBallJob,packBallFrame}from"/ball-raster.js";import{createBallGPU}from"/ball-gpu.js";import{createAdaptiveBallRaster,compareBallRasters}from"/adaptive-ball-raster.js";import{createBallGlass}from"/ball-glass.js";import{createGlassPerformance}from"/glass-performance.js";window.api={rasterBall,buildBallJob,packBallFrame,createBallGPU,createAdaptiveBallRaster,compareBallRasters,createBallGlass,createGlassPerformance};</script>');return;}
 if(name==='/stall-worker.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('await import("/glass-worker.js");const handle=self.onmessage;self.onmessage=e=>{if(e.data.graphics==="adaptive")return;handle(e);};');return;}
 if(name==='/no-gpu-worker.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(kind,...args){return kind==="webgl2"?null:get.call(this,kind,...args);};await import("/glass-worker.js");');return;}
 const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!file.endsWith('.js')){res.writeHead(404);res.end();return;}try{const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':'text/javascript'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const watchdog=setTimeout(()=>{console.error('GPU compatibility watchdog expired');process.exit(2);},20000);
try{
 browser=process.env.NVWA_GPU_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,...(process.env.NVWA_BROWSER_EXECUTABLE?{executablePath:process.env.NVWA_BROWSER_EXECUTABLE}:{})});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>r.request().url().startsWith(origin)||/^(data|blob):/.test(r.request().url())?r.continue():r.abort());
 await page.goto(origin);await page.waitForFunction(()=>window.api);
 const result=await page.evaluate(async fixture=>{
  const {buildBallJob,rasterBall,packBallFrame,createGlassPerformance}=window.api;
  const shape=fixture.shapes[2],job=buildBallJob(shape.b,shape.t,fixture.materials[7],30,false,2,true);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const sync=job=>{const raw=rasterBall(job),canvas=document.createElement('canvas');return packBallFrame(raw,raw.images.map(im=>{canvas.width=im.w;canvas.height=im.h;canvas.getContext('2d').putImageData(new ImageData(im.data,im.w,im.h),0,0);return canvas.toDataURL();}));};
  const run=async forcedStall=>{
   let complete,heartbeat=0;const done=new Promise(r=>complete=r),ticker=setInterval(()=>heartbeat++,10);
   const engine=createGlassPerformance({graphics:true,workerFactory:()=>new Worker(forcedStall?'/stall-worker.js':'/glass-worker.js',{type:'module'}),computeSync:sync,onResult:(job,frame)=>complete({status:engine.status(),hasFrame:frame.cover.startsWith('data:image/png')})});
   try{
    engine.prepare();const started=performance.now();while(engine.status().mode==='starting'&&performance.now()-started<3000)await sleep(5);
    if(engine.status().mode==='sync'){engine.request(job);const fallback=await done;check(fallback.hasFrame&&fallback.status.reason==='canvas-unavailable','Unsupported canvas fallback failed');return{...fallback,workerCanvasAvailable:false};}
    check(engine.status().mode==='worker','CPU canvas worker did not become ready');
    const at=performance.now();engine.request(job);const result=await Promise.race([done,sleep(4000).then(()=>{throw Error('Adaptive worker did not finish/fall back');})]);
    result.elapsedMs=performance.now()-at;result.heartbeatCallbacks=heartbeat;
    check(result.hasFrame,'No optical frame returned');check(result.status.mode==='worker','GPU failure escaped the CPU worker fallback');check(result.status.syncFrames===0,'GPU request rasterised on the UI thread');
    if(forcedStall){check(result.status.reason==='gpu-render-timeout-cpu-worker','Expected deadline did not fire');check(result.status.graphics.state==='cpu','CPU recovery was not reported');check(heartbeat>=10,'UI callbacks were blocked during GPU recovery');}
    return result;
   }finally{clearInterval(ticker);engine.stop();}
  };
  const normal=await run(false);return {normal,controlledStall:normal.workerCanvasAvailable===false?{skipped:true,reason:'This desktop engine has no worker canvas; existing main-thread fallback verified.'}:await run(true),physicalPhone:false};
 },fixture);
 assert.equal(errors.length,0,errors.join('\n'));
 const report={passed:true,observedAt:new Date().toISOString(),environment:process.env.NVWA_GPU_ENGINE==='webkit'?'Desktop Playwright WebKit':'Windows desktop Edge',browser:browser.version(),pageErrors:errors,...result};
 if(output)await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{clearTimeout(watchdog);await browser?.close();await new Promise(r=>server.close(r));}
