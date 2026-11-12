import assert from 'node:assert/strict';
import {createGlassPerformance} from '../../glass-performance.js';
const saved={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,performance:globalThis.performance};let now=0,serial=0;const timers=new Map(),workers=[],shown=[];
globalThis.performance={now:()=>now};globalThis.setTimeout=(fn,delay)=>{const id=++serial;timers.set(id,{at:now+delay,fn});return id;};globalThis.clearTimeout=id=>timers.delete(id);
const tick=ms=>{const end=now+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);now=next[1].at;next[1].fn();}now=end;};
const factory=()=>{const w={sent:[],postMessage(m){this.sent.push(m);},emit(data){this.onmessage?.({data});},terminate(){this.closed=true;}};workers.push(w);return w;};
try{
 const engine=createGlassPerformance({graphics:true,workerFactory:factory,computeSync:job=>({key:job.key}),onResult:(job,frame)=>shown.push(frame.key)});
 engine.prepare();workers[0].emit({type:'ready',ok:true});engine.request({key:'old',low:true});engine.request({key:'latest',low:true});
 tick(450);assert.equal(workers.length,2,'A stalled GPU worker must be replaced by a CPU worker');assert(workers[0].closed);assert.equal(engine.status().mode,'starting');assert.equal(engine.status().syncFrames,0,'GPU timeout must not move raster work onto the UI thread');
 const cpu=workers[1];cpu.emit({type:'ready',ok:true});assert.equal(cpu.sent[0].graphics,'cpu');assert.equal(cpu.sent[0].job.key,'latest');cpu.emit({type:'result',id:cpu.sent[0].id,frame:{key:'latest'},graphics:{state:'untried'}});assert.deepEqual(shown,['latest']);assert.equal(engine.status().mode,'worker');assert.equal(engine.status().graphics.state,'cpu');
 engine.request({key:'next',low:true});tick(1500);assert.equal(workers.length,2,'CPU timeout must not enter a restart loop');assert.equal(engine.status().mode,'sync');assert.equal(shown.at(-1),'next');engine.stop();assert.equal(timers.size,0);
 console.log(JSON.stringify({passed:true,checks:['450ms GPU deadline','latest job retained','CPU worker fallback','no main-thread raster on GPU timeout','bounded restart','CPU last-resort fallback']}));
}finally{Object.assign(globalThis,saved);}
