// Per-worker selection, bounded calibration and CPU fallback. No host APIs are patched.
import { rasterBall } from './ball-raster.js';
import { createBallGPU } from './ball-gpu.js';
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
export function compareBallRasters(cpu,gpu) {
 if(JSON.stringify(cpu.frame)!==JSON.stringify(gpu.frame)||cpu.images.length!==gpu.images.length)return Infinity;
 let maximum=0;
 for(let n=0;n<cpu.images.length;n++){
  const a=cpu.images[n],b=gpu.images[n];if(a.w!==b.w||a.h!==b.h||a.data.length!==b.data.length)return Infinity;
  for(let i=0;i<a.data.length;i++){maximum=Math.max(maximum,Math.abs(a.data[i]-b.data[i]));if(maximum>1)return maximum;}
 }
 return maximum;
}
export function createAdaptiveBallRaster({cpu=rasterBall,gpuFactory=createBallGPU,clock=()=>performance.now()}={}) {
 let gpu=null,state='untried',reason='',cpuRate=0,slow=0;
 const stats={gpuFrames:0,cpuFrames:0,calibrations:0,failures:0,warmupMs:0,cpuProbeMs:0,gpuProbeMs:0,maxChannelDelta:null,requestedPreference:'high-performance',reportedPreference:null};
 const eligible=job=>!!job.tt&&job.cw*job.ch>=8192&&job.cw*job.ch<=262144;
 function disable(why,failed=false){try{gpu?.dispose();}catch{}gpu=null;state='cpu';reason=why;if(failed)stats.failures++;}
 function fallback(job){stats.cpuFrames++;return cpu(job);}
 function render(job){
  if(!eligible(job)||state==='cpu')return fallback(job);
  if(state==='untried'){
   const started=clock();
   try{
    gpu=gpuFactory();stats.reportedPreference=gpu.contextPreference||null;
    // Warm both implementations before timing; compilation and cache setup are separate costs.
    cpu(job);cpu(job);gpu.raster(job);
    stats.warmupMs=Math.max(0,clock()-started);stats.calibrations++;
    const cpuTimes=[],gpuTimes=[];let reference,candidate;
    for(let i=0;i<3;i++){
     // Alternate order to avoid systematically giving the second path a warm CPU.
     const runCPU=()=>{const at=clock();reference=cpu(job);cpuTimes.push(clock()-at);};
     const runGPU=()=>{const at=clock();candidate=gpu.raster(job);gpuTimes.push(clock()-at);};
     if(i%2){runGPU();runCPU();}else{runCPU();runGPU();}
    }
    stats.cpuProbeMs=median(cpuTimes);stats.gpuProbeMs=median(gpuTimes);stats.maxChannelDelta=compareBallRasters(reference,candidate);
    if(stats.maxChannelDelta>1){disable('pixel-mismatch',true);stats.cpuFrames++;return reference;}
    if(stats.cpuProbeMs-stats.gpuProbeMs<.4||stats.gpuProbeMs>stats.cpuProbeMs*.85){disable('no-measured-gain');stats.cpuFrames++;return reference;}
    cpuRate=stats.cpuProbeMs/(job.cw*job.ch);state='gpu';reason='measured-faster';stats.gpuFrames++;return candidate;
   }catch{disable('gpu-unavailable-or-failed',true);return fallback(job);}
  }
  try{
   const started=clock(),result=gpu.raster(job),duration=clock()-started;
   slow=duration>cpuRate*job.cw*job.ch*.95+.2?slow+1:0;
   if(slow>=3){disable('readback-slower');return fallback(job);}
   stats.gpuFrames++;return result;
  }catch{disable('gpu-render-failed',true);return fallback(job);}
 }
 return{render,status:()=>({state,reason,...stats}),dispose(){disable('disposed');}};
}
