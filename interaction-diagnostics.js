// Explicit, short-lived local capture. No text, keys, URLs, frame content or storage.
export function createInteractionDiagnostics({snapshot=()=>({}),onFinish=()=>{},durationMs=15000,win=window,doc=document}={}) {
    const limit=Math.max(1000,Math.min(15000,Number(durationMs)||15000));
    let active=null,last=null,raf=0,timer=0,observer=null;
    const now=()=>win.performance.now();
    const cleanup=()=>{if(raf)win.cancelAnimationFrame(raf);raf=0;win.clearTimeout(timer);timer=0;observer?.disconnect();observer=null;for(const [target,name,fn]of listeners)target?.removeEventListener(name,fn,true);};
    const safeSnapshot=()=>{try{return snapshot();}catch{return{unavailable:true};}};
    const percentile=(hist,n,p)=>{if(!n)return null;let sum=0;for(let i=0;i<hist.length;i++){sum+=hist[i];if(sum>=Math.ceil(n*p))return i===255?'255+':i;}return null;};
    function finish(reason='manual'){
        if(!active)return last;
        const data=active;active=null;cleanup();
        const duration=Math.max(0,now()-data.started);
        last={format:'nvwa-interaction-1',reason,durationMs:Math.round(duration),
            frameIntervals:{samples:data.frames,meanMs:data.frames?+(data.sum/data.frames).toFixed(2):null,p50Ms:percentile(data.hist,data.frames,.5),p95Ms:percentile(data.hist,data.frames,.95),maxMs:+data.max.toFixed(2),over34ms:data.over34,over50ms:data.over50,over100ms:data.over100},
            events:{...data.events},viewportRange:data.viewportRange,longTasks:{supported:data.longTaskSupport,count:data.longCount,maxMs:+data.longMax.toFixed(2)},start:data.start,end:safeSnapshot(),
            interpretation:'requestAnimationFrame intervals during this capture; not touch latency, GPU frames or INP'};
        onFinish(last);return last;
    }
    const count=key=>{if(active)active.events[key]++;};
    const viewport=()=>{if(!active)return;for(const[key,value]of Object.entries({width:win.innerWidth,height:win.innerHeight,visualHeight:win.visualViewport?.height,visualOffsetTop:win.visualViewport?.offsetTop,visualScale:win.visualViewport?.scale})){if(!Number.isFinite(value))continue;const range=active.viewportRange[key];if(range){range.min=Math.min(range.min,value);range.max=Math.max(range.max,value);}else active.viewportRange[key]={min:value,max:value};}};
    const focused=e=>{if(e.target?.id==='send_textarea')count('composerFocuses');viewport();};
    const blurred=e=>{if(e.target?.id==='send_textarea')count('composerBlurs');viewport();};
    function frame(t){if(!active)return;if(active.previous!==null){const gap=t-active.previous;if(gap>=0&&Number.isFinite(gap)){active.frames++;active.sum+=gap;active.max=Math.max(active.max,gap);active.hist[Math.min(255,Math.round(gap))]++;if(gap>34)active.over34++;if(gap>50)active.over50++;if(gap>100)active.over100++;}}active.previous=t;raf=win.requestAnimationFrame(frame);}
    const pointerDown=e=>{if(!active)return;if(e.target?.closest?.('#ilg-ball')){active.dragId=e.pointerId;count('ballDrags');}};
    const pointerMove=e=>{if(active?.dragId!==null&&active?.dragId===e.pointerId)count('ballMoves');};
    const pointerUp=e=>{if(active?.dragId===e.pointerId)active.dragId=null;};
    const scroll=e=>{if(e.target?.id==='chat')count('chatScrolls');};
    const input=e=>{if(e.target?.id==='send_textarea')count('composerInputs');};
    const visibility=()=>{if(doc.hidden)finish('hidden');};
    const listeners=[[doc,'pointerdown',pointerDown],[doc,'pointermove',pointerMove],[doc,'pointerup',pointerUp],[doc,'pointercancel',pointerUp],[doc,'scroll',scroll],[doc,'input',input],[doc,'visibilitychange',visibility],[doc,'focusin',focused],[doc,'focusout',blurred],
        [win,'resize',()=>{count('windowResizes');viewport();}],[win,'orientationchange',()=>{count('orientationChanges');viewport();}],[win.visualViewport,'resize',()=>{count('visualResizes');viewport();}],[win.visualViewport,'scroll',()=>{count('visualScrolls');viewport();}]];
    return{
        start(){if(active)return false;if(doc.hidden)return false;last=null;active={started:now(),previous:null,frames:0,sum:0,max:0,hist:new Uint32Array(256),over34:0,over50:0,over100:0,dragId:null,longTaskSupport:false,longCount:0,longMax:0,viewportRange:{},
            events:{composerFocuses:0,composerBlurs:0,ballDrags:0,ballMoves:0,chatScrolls:0,composerInputs:0,windowResizes:0,orientationChanges:0,visualResizes:0,visualScrolls:0},start:safeSnapshot()};
            viewport();for(const[target,name,fn]of listeners)target?.addEventListener(name,fn,{capture:true,passive:true});
            try{if(win.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){observer=new win.PerformanceObserver(list=>{if(active)for(const e of list.getEntries()){active.longCount++;active.longMax=Math.max(active.longMax,e.duration);}});observer.observe({type:'longtask',buffered:false});active.longTaskSupport=true;}}catch{observer?.disconnect();observer=null;}
            raf=win.requestAnimationFrame(frame);timer=win.setTimeout(()=>finish('timeout'),limit);return true;},
        stop:finish,report:()=>active?{recording:true,elapsedMs:Math.round(now()-active.started)}:last,status:()=>({recording:!!active,hasResult:!!last,durationMs:limit}),destroy(){if(active){active=null;cleanup();}last=null;}
    };
}
