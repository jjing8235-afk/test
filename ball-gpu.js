// Material formulas follow ball-raster.js; upstream Web optics retain LICENSE-liquid-glass.txt.
// Bounded WebGL2 raster. Only NVWA-owned optical maps use this context.
import { lut, physicalFilter } from './glass2.js';
import { sampleWebDisplacement, sampleWebMap } from './liquid-glass-web.js';

const vertex = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}';
const fragment = `#version 300 es
precision highp float;
precision highp int;
uniform vec4 ball, rect, web;
uniform vec2 stepSize, pixelSize, physical;
uniform float rectRadius;
uniform bool fusedShape, webMaterial;
uniform int passIndex;
uniform sampler2D lookup;
out vec4 color;
float roundedRect(vec2 p){vec2 halfSize=(rect.zw-rect.xy)*.5;vec2 q=abs(p-rect.xy-halfSize)-halfSize+rectRadius;return min(max(q.x,q.y),0.)+length(max(q,0.))-rectRadius;}
float ballDistance(vec2 p){return length(p-ball.xy)-ball.z;}
float field(vec2 p){float a=ballDistance(p);if(!fusedShape)return a;float b=roundedRect(p);float h=max(ball.w-abs(a-b),0.)/ball.w;return min(a,b)-h*h*ball.w*.25;}
float seam(float d){float t=clamp(d*.25,0.,1.);return t*t*(3.-2.*t);}
vec2 normalAt(vec2 p){vec2 d=vec2((field(p+vec2(stepSize.x,0.))-field(p-vec2(stepSize.x,0.)))/stepSize.x,(field(p+vec2(0.,stepSize.y))-field(p-vec2(0.,stepSize.y)))/stepSize.y);float n=length(d);return d/(n>0.?n:1.);}
float tableAt(float f,int maximum){int i=int(f);return mix(texelFetch(lookup,ivec2(i,0),0).r,texelFetch(lookup,ivec2(min(i+1,maximum),0),0).r,f-float(i));}
vec4 reflection(float depth,vec2 n){
 if(depth<0.||depth>7.)return vec4(0.);
 float facing=-n.x*.573576-n.y*.819152;
 float key=pow(max(0.,facing),7.),bounce=pow(max(0.,-facing),10.);
 float a=(depth-.55)/.43,b=(depth-1.65)/1.1;float crest=exp(-a*a),shoulder=exp(-b*b);
 float c=(depth-2.5)/.9;float returnBand=exp(-c*c);
 float shine=crest*(.025+.72*key+.2*bounce)+shoulder*(.11*key+.025*bounce);
 float cool=returnBand*bounce*.07;
 float e=(depth-1.45)/.65;float shade=exp(-e*e)*(.025+.045*max(0.,-facing));
 float total=shine+cool+shade;
 vec3 rgb=total>0.?(shine*vec3(252.,254.,255.)+cool*vec3(216.,238.,255.)+shade*vec3(12.,24.,38.))/total:vec3(0.);
 return vec4(rgb/255.,clamp(total,0.,.86));
}
vec2 webDisplacement(vec2 p){vec2 i=p/(2.*web.x)-.5;vec2 q=abs(i)-vec2(.3,.2)+web.z;float d=min(max(q.x,q.y),0.)+length(max(q,0.))-web.z;float t=clamp((d-.15/web.y-.8)/(-.8),0.,1.);t=t*t*(3.-2.*t);t=t*t*(3.-2.*t);return(i*t+.5)*(2.*web.x)-p;}
void main(){
 vec2 p=gl_FragCoord.xy*pixelSize;
 if(passIndex==0){float a=clamp(.5-field(p),0.,1.)*(fusedShape?seam(roundedRect(p)+1.):1.);color=vec4(1.,1.,1.,a);return;}
 if(passIndex==1){p-=18.;color=vec4(0.,0.,0.,1.-clamp(.5-field(p),0.,1.));return;}
 float d=field(p),depth=-d;
 if(passIndex==2){color=reflection(depth,normalAt(p));return;}
 vec2 offset=vec2(0.);
 if(!webMaterial){
   if(depth>0.&&depth<physical.x){float displacement=tableAt(depth/physical.x*256.,256);float sk=fusedShape?seam(roundedRect(p)):1.;offset=-normalAt(p)*displacement*sk;}
   color=vec4((vec2(128.)+offset/physical.y*127.)/255.,128./255.,1.);return;
 }
 if(d<.5){
   float s=ball.z/web.x;float weight=fusedShape?1.-clamp((ballDistance(p)-d)/3.,0.,1.):1.;
   vec2 original=(p-ball.xy)/s+web.x;
   if(weight>0.&&all(greaterThanEqual(original,vec2(0.)))&&all(lessThanEqual(original,vec2(2.*web.x))))offset=webDisplacement(original)*s*weight;
   if(weight<1.){float f=clamp(-d/s/web.x,0.,1.)*64.;offset-=normalAt(p)*tableAt(f,64)*s*(1.-weight);}
   if(fusedShape)offset*=seam(roundedRect(p));
 }
 color=vec4(clamp(offset/web.w+.5,0.,1.),0.,1.);
}`;

const materialCache=new Map();
function materialFor(m){
 const key=m.kind==='phys'?[m.kind,m.R0,m.o.profile,m.o.bezel,m.o.thickness,m.o.ior,m.o.magnify].join('|'):[m.kind,m.R0,m.preset,m.recipe.edge,m.recipe.rad].join('|');if(materialCache.has(key))return materialCache.get(key);
 let result;
 if(m.kind==='phys'){
  const o=m.o,bez=Math.max(2,Math.min(o.bezel,2*m.R0*(o.profile==='lens'?.4:.3)));
  const table=lut(o.profile,bez,o.thickness*bez/o.bezel,o.ior,o.profile==='lens'?o.magnify:0).d;
  let max=.001;for(const v of table)max=Math.max(max,Math.abs(v));result={table,bez,max};
 }else{
  const table=new Float32Array(65),n=2*m.R0;
  for(let q=0;q<=64;q++){const depth=q/64*m.R0;table[q]=(Math.abs(sampleWebDisplacement(n-depth,m.R0,n,n,m.recipe)[0])+Math.abs(sampleWebDisplacement(m.R0,n-depth,n,n,m.recipe)[1]))/2;}
  result={table,half:sampleWebMap(n,n,m.preset).half};
 }
 if(materialCache.size>=12)materialCache.delete(materialCache.keys().next().value);materialCache.set(key,result);return result;
}
export function createBallGPU({canvasFactory=()=>new OffscreenCanvas(2,2)}={}){
 const canvas=canvasFactory();
 const gl=canvas.getContext('webgl2',{powerPreference:'high-performance',failIfMajorPerformanceCaveat:true,alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:false});
 if(!gl)throw Error('webgl2-unavailable');
 let program=null,framebuffer=null,lookup=null,disposed=false,targetPixels=0;const shaders=[],targets=new Map();
 const dispose=()=>{if(disposed)return;disposed=true;for(const target of targets.values())gl.deleteTexture(target.texture);targets.clear();if(lookup)gl.deleteTexture(lookup);if(framebuffer)gl.deleteFramebuffer(framebuffer);if(program)gl.deleteProgram(program);for(const shader of shaders)gl.deleteShader(shader);gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=canvas.height=0;};
 try{
  const compile=(type,source)=>{const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('shader-compile:'+gl.getShaderInfoLog(s));return s;};
  program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('shader-link');gl.useProgram(program);
  for(const flag of [gl.BLEND,gl.DITHER,gl.DEPTH_TEST,gl.STENCIL_TEST,gl.CULL_FACE,gl.SCISSOR_TEST])gl.disable(flag);
  framebuffer=gl.createFramebuffer();lookup=gl.createTexture();
  const locations={};for(const name of ['ball','rect','web','stepSize','pixelSize','physical','rectRadius','fusedShape','webMaterial','passIndex','lookup'])locations[name]=gl.getUniformLocation(program,name);
  gl.uniform1i(locations.lookup,1);
  const texture=(value,unit)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,value);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);};
  let uploadedMaterial=null;
  function raster(job){
   if(disposed||gl.isContextLost())throw Error('context-lost');
   const {m,W,H,R,K,ox,oy,tt,cw,ch,sx,sy,shadow}=job;
   if(cw*ch>262144||cw>1024||ch>1024||cw<2||ch<2||!Number.isFinite(cw*ch))throw Error('shape-budget');
   const material=materialFor(m);gl.useProgram(program);
   gl.uniform4f(locations.ball,ox,oy,R,K);gl.uniform4f(locations.rect,tt?.l||0,tt?.t||0,tt?.r||0,tt?.b||0);gl.uniform1f(locations.rectRadius,tt?.rad||0);gl.uniform1i(locations.fusedShape,!!tt);gl.uniform1i(locations.webMaterial,m.kind==='web');gl.uniform2f(locations.stepSize,sx,sy);
   if(m.kind==='phys')gl.uniform2f(locations.physical,material.bez,material.max);else gl.uniform4f(locations.web,m.R0,m.recipe.edge,m.recipe.rad,material.half);
   if(material!==uploadedMaterial){texture(lookup,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,material.table.length,1,0,gl.RED,gl.FLOAT,material.table);uploadedMaterial=material;}
   const images=[];
   function draw(w,h,pass,px,py){
    const key=w+'x'+h;let target=targets.get(key);
    if(target){targets.delete(key);targets.set(key,target);texture(target.texture,0);}
    else{
     while(targets.size&&(targets.size>=3||targetPixels+w*h>786432)){const oldest=targets.keys().next().value,entry=targets.get(oldest);gl.deleteTexture(entry.texture);targetPixels-=entry.pixels;targets.delete(oldest);}
     target={texture:gl.createTexture(),pixels:w*h};texture(target.texture,0);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);targets.set(key,target);targetPixels+=w*h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('framebuffer-incomplete');
    gl.viewport(0,0,w,h);gl.uniform1i(locations.passIndex,pass);gl.uniform2f(locations.pixelSize,px,py);gl.drawArrays(gl.TRIANGLES,0,3);
    const data=new Uint8ClampedArray(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);images.push({w,h,data});return '__ILG_BITMAP_'+(images.length-1)+'__';
   }
   const mw=Math.max(2,Math.round(W)),mh=Math.max(2,Math.round(H));const cover=draw(mw,mh,0,W/mw,H/mh);
   const sw=Math.max(2,Math.round(W+36)),sh=Math.max(2,Math.round(H+36));const inv=shadow?draw(sw,sh,1,(W+36)/sw,(H+36)/sh):'';
   const reflection=draw(cw,ch,2,sx,sy),url=draw(cw,ch,3,sx,sy);
   if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error('gpu-render-failed');
   const html=m.kind==='phys'?physicalFilter({full:{d:url},scale:material.max*255/127},m.o,W,H,m.angle):'<feImage href="'+url+'" x="0" y="0" width="'+W+'" height="'+H+'" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="'+(material.half*m.recipe.ref).toFixed(3)+'" xChannelSelector="R" yChannelSelector="G"/>';
   const frame={cover,inv,reflection,html,pixels:mw*mh+(shadow?sw*sh:0)+2*cw*ch,chars:cover.length+inv.length+reflection.length+html.length};return {frame,images};
  }
  return {raster,dispose,contextPreference:gl.getContextAttributes()?.powerPreference||'unknown'};
 }catch(error){dispose();throw error;}
}
