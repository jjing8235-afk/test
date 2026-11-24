import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const index=await fs.readFile(new URL('../../index.js',import.meta.url),'utf8');
const paint=index.slice(index.indexOf('function paint(el, geo) {'),index.indexOf('// .ilg-phys：'));
function run({webView=true,android=webView,kind='panel',width=344,height=500,visible=true,engine='physical',web=false,refract=true,wallpaper=true,css=false,noBlur=false,oversize=false}={}){
 const calls={physical:0,legacy:0,removed:0,reflections:0,webRelease:0,webPaint:0,wallpaperPaint:0,wallpaperRelease:0};const style={backdropFilter:'url(#old)',webkitBackdropFilter:'url(#old)'};const el={isConnected:true,classList:{toggle(){},contains(){return false;}},matches:()=>false,style};const it={kind,id:'probe',filter:{remove(){calls.removed++}},physical:{}};
 const c={el,it,document:{body:{classList:{contains:()=>noBlur}}},items:new Map([[el,it]]),HOST_MENU_SEL:'#options',S:{engine,refract,saturate:1.1,brightness:1.02},devicePixelRatio:3,androidWebView:webView,androidHost:android,isIOS:false,lightScope:{visibility(){}},visibleItems:new Set([el]),mountTrayHeading(){},messageSurface:()=>el,controlSurface:()=>false,controlReadable:()=>false,composerGlassSurface:()=>false,cssGlassActive:()=>css,webStyleEnabled:()=>web&&!css,iosWallpaperRequested:()=>false,webGlass:{release(){calls.webRelease++},paint(el,item,options){calls.webPaint++;if(options.refract)options.sourcePlane?.('url(#probe-web)');}},iosWallpaper:{release(){}},lensWallpaper:{paint(){calls.wallpaperPaint++;return wallpaper;},release(){calls.wallpaperRelease++;},follow(){}},reflections:{release(){calls.reflections++},paint(){}},surfaceBlur:()=>it.followMaterial?.25:10,canRefract:()=>true,iosMaterialActive:()=>false,largeWebViewMessage:({kind})=>kind==='mes'&&oversize,refractAllowed:()=>refract,setPhys(){},buildPhysical(){calls.physical++},buildFilter(){calls.legacy++},inputGlass:()=>false};
 c.foldedMenuSurface=()=>false;
 const context=vm.createContext(c);vm.runInContext(paint,context);const render=(w,h)=>{context.geo={w,h,r:22};vm.runInContext('paint(el,geo)',context);};render(visible?width:0,visible?height:0);return{calls,it,style,render,c};
}
for(const engine of ['physical','legacy'])for(const web of[false,true]){const r=run({engine,web});assert.equal(r.it.renderPath,'blur');assert.equal(r.it.fallbackReason,'webview-panel');assert(!r.style.backdropFilter.includes('url('));assert.equal(r.calls.physical+r.calls.legacy+r.calls.webPaint,0);assert.equal(r.calls.removed,1);r.render(0,0);assert.equal(r.it.renderPath,'hidden');assert.equal(r.style.backdropFilter,'');assert.equal(r.it.filter,null);assert.equal(r.it.physical,null);assert.equal(r.c.visibleItems.size,0);for(let i=0;i<12;i++){r.render(344,500);r.render(0,0);}assert.equal(r.calls.physical+r.calls.legacy+r.calls.webPaint,0);}
for(const kind of['panel','clearPanel']){const native=run({webView:false,android:true,kind,wallpaper:false});assert.equal(native.it.renderPath,'blur');assert(!native.it.filter);}
for(const kind of['mes','bar'])assert.equal(run({kind}).it.renderPath,'physical');for(const kind of['panel','clearPanel']){const r=run({kind,webView:false});assert.equal(r.it.renderPath,'physical');r.render(0,0);assert.equal(r.it.filter,null);assert.equal(r.style.backdropFilter,'');assert(r.calls.reflections>0);}
// Both explicitly adapted NVWA panels use clearPanel after the Popup boundary check.
const adaptedOptions={kind:'clearPanel'};
for(const engine of ['physical','legacy']) {
 const r=run({...adaptedOptions,engine});assert.equal(r.it.renderPath,engine+'-wallpaper');assert.equal(r.style.backdropFilter,'none');assert.equal(r.calls[engine],1);
 r.render(0,0);assert.equal(r.calls.wallpaperRelease,1);assert.equal(r.it.filter,null);
}
for(const options of [{wallpaper:false},{oversize:true},{refract:false}]){
 const r=run({...adaptedOptions,...options});assert.equal(r.it.renderPath,'blur');assert.match(r.style.backdropFilter,/^blur\(0.25px\)/);assert.equal(r.calls.physical+r.calls.legacy,0);
}
const webAdapted=run({...adaptedOptions,web:true});assert.equal(webAdapted.it.renderPath,'web-wallpaper');assert.equal(webAdapted.calls.wallpaperPaint,1);assert.equal(webAdapted.calls.physical+webAdapted.calls.legacy,0);
const cssAdapted=run({...adaptedOptions,css:true});assert.equal(cssAdapted.it.renderPath,'css');assert.match(cssAdapted.style.backdropFilter,/^blur\(0.75px\)/);assert.equal(cssAdapted.calls.wallpaperPaint,0);
const plainAdapted=run({...adaptedOptions,web:true,noBlur:true});assert.equal(plainAdapted.it.renderPath,'no-blur');assert.equal(plainAdapted.style.backdropFilter,'none');assert.equal(plainAdapted.calls.wallpaperPaint+plainAdapted.calls.webPaint,0);
console.log(JSON.stringify({passed:true,androidPanelModes:4,repeatedCloseOpenCycles:48,adaptedPanelModeCoverage:true,hiddenFilterReleased:true,desktopRefractionPreserved:true,messageAndInputRefractionPreserved:true,scope:'Actual paint function and state transitions, not a physical GPU flicker measurement'}));
