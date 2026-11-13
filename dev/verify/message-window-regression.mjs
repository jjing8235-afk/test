import assert from 'node:assert/strict';
import {messageWindowGeometry,createMessageGlassWindow} from '../../message-glass-window.js';
for(const viewport of [240,640,759,900])for(const h of [100,640,9200,24000])for(let top=viewport;top>-h;top-=Math.max(1,h/91)){
 const g=messageWindowGeometry({w:360,h,r:24,viewportHeight:viewport,top,viewportTop:0});
 if(!g.window){assert.equal(g.h,h);continue;}
 assert(g.h<=viewport+512);assert(g.window.offset>=0&&g.window.offset+g.h<=h);const visibleTop=Math.max(0,top),visibleBottom=Math.min(viewport,top+h);
 if(visibleBottom>visibleTop){assert(top+g.window.offset<=visibleTop);assert(top+g.window.offset+g.h>=visibleBottom);}
}
class Target{events=new Map();addEventListener(t,f){if(!this.events.has(t))this.events.set(t,new Set());this.events.get(t).add(f);}removeEventListener(t,f){this.events.get(t)?.delete(f);}emit(t){for(const f of this.events.get(t)||[])f();}get listeners(){return [...this.events.values()].reduce((n,s)=>n+s.size,0);}}
let top=-2000,id=0,reads=0;const tasks=new Map(),win=new Target(),doc=new Target(),chat=new Target();doc.hidden=false;chat.clientHeight=640;chat.getBoundingClientRect=()=>({top:0,height:640});
win.innerHeight=640;win.requestAnimationFrame=f=>{tasks.set(++id,f);return id;};win.cancelAnimationFrame=i=>tasks.delete(i);
const tick=()=>{const list=[...tasks.values()];tasks.clear();for(const fn of list)fn();};
const el={isConnected:true,classList:{set:new Set(),add(c){this.set.add(c);},remove(c){this.set.delete(c);}},getBoundingClientRect(){reads++;return{top,height:9200};}};
const layer={style:{height:'',transform:'',removeProperty(k){this[k]='';}}};
let resizes=0;const controller=createMessageGlassWindow({chat,mobile:true,win,doc,onResize:()=>resizes++});controller.setEnabled(true);
const g=controller.plan(el,{w:360,h:9200,r:24},true);controller.apply(el,layer,g,true);assert.equal(controller.status().tracked,1);assert(el.classList.set.has('ilg-message-window'));
const first=layer.style.transform;top-=500;chat.emit('scroll');chat.emit('scroll');assert.equal(tasks.size,1);tick();assert.notEqual(layer.style.transform,first);assert.equal(resizes,0,'Scrolling must not rebuild the filter');
controller.visibility(el,false);reads=0;chat.emit('scroll');tick();assert.equal(reads,0,'Offscreen messages must not be measured on each scroll');
controller.visibility(el,true);doc.hidden=true;doc.emit('visibilitychange');assert.equal(tasks.size,0);doc.hidden=false;doc.emit('visibilitychange');tick();
const nextLayer={style:{height:'',transform:'',removeProperty(k){this[k]='';}}};controller.apply(el,nextLayer,g,true);assert.equal(layer.style.height,'');assert.equal(layer.style.transform,'');assert.equal(controller.status().active,1);reads=0;chat.emit('scroll');tick();assert.equal(reads,1,'Replaced layers must leave no stale active entry');
chat.clientHeight=400;win.emit('resize');assert.equal(resizes,1);controller.release(el);assert.equal(nextLayer.style.height,'');assert.equal(nextLayer.style.transform,'');assert.equal(controller.status().tracked,0);controller.destroy();assert.equal(tasks.size,0);assert.equal(win.listeners+doc.listeners+chat.listeners,0);
console.log(JSON.stringify({passed:true,checks:['viewport-bounded geometry','continuous visible coverage','native message height retained','coalesced motion','offscreen geometry skipped','no filter rebuild on scroll','resize invalidation','layer replacement releases old state','visibility and disable cleanup']}));
