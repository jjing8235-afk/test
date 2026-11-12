// Coordinates only NVWA-owned work. Host timers, events, settings and card content stay native.
export function createInteractionPerformance({root,chat,paintBatch,onIdle=()=>{},mobile=false,maxBudgetMs=6,win=window,doc=document}={}) {
    const pending=new Map();let enabled=false,scrolling=false,menu=false,touching=false,raf=0,timer=0,scrollUntil=0,menuUntil=0,inputUntil=0,average=2;
    const capacity=Math.max(2,Math.min(6,Number(maxBudgetMs)||6));
    let frameInterval=1000/60,lastFrame=0,budgetMs=Math.min(4,capacity);
    const counts={scrollBursts:0,menuBursts:0,batches:0,painted:0,coalesced:0,maxBatchMs:0};
    const now=()=>win.performance.now();
    const busy=()=>enabled&&(scrolling||menu||now()<inputUntil);
    const cancelFrame=()=>{if(raf)win.cancelAnimationFrame(raf);raf=0;};
    function syncClasses(){root.classList.toggle('ilg-scroll-active',enabled&&scrolling);root.classList.toggle('ilg-menu-active',enabled&&menu);}
    function schedule(){if(enabled&&!doc.hidden&&!busy()&&pending.size&&!raf)raf=win.requestAnimationFrame(flush);}
    function flush(timestamp){
        raf=0;if(!enabled||doc.hidden||busy()||!pending.size)return;
        const at=Number.isFinite(timestamp)?timestamp:now(),gap=at-lastFrame;
        if(lastFrame&&gap>250){frameInterval=1000/60;lastFrame=0;}
        if(lastFrame&&gap>=4&&gap<=20)frameInterval=Math.min(frameInterval,gap);
        budgetMs=Math.min(capacity,lastFrame?Math.max(1.5,frameInterval*.4):4);lastFrame=at;
        const batch=[],limit=Math.max(1,Math.min(6,Math.floor(budgetMs/average)));
        for(const key of pending.keys()){pending.delete(key);batch.push(key);if(batch.length>=limit)break;}
        const start=now();
        try { paintBatch(batch); }
        finally {
            const elapsed=now()-start;
            average=Math.max(.1,average*.5+elapsed/batch.length*.5);counts.batches++;counts.painted+=batch.length;counts.maxBatchMs=Math.max(counts.maxBatchMs,elapsed);schedule();
        }
    }
    function arm(){
        if(timer)win.clearTimeout(timer);timer=0;if(!enabled||doc.hidden)return;
        const deadline=Math.max(touching?0:scrollUntil,menuUntil,inputUntil);
        if(deadline>now())timer=win.setTimeout(settle,Math.max(1,deadline-now()));else if(!touching)settle();
    }
    function settle(){
        timer=0;if(!enabled||doc.hidden)return;
        const t=now(),wasBusy=scrolling||menu||inputUntil>0;
        scrolling=touching||t<scrollUntil;menu=t<menuUntil;if(t>=inputUntil)inputUntil=0;
        syncClasses();if(busy()){arm();return;}
        scrollUntil=menuUntil=0;if(wasBusy)onIdle();schedule();
    }
    function scroll(event){
        if(!enabled||!mobile||doc.hidden)return;
        if(event?.type==='touchmove'&&event.touches?.length)touching=true;
        if(!scrolling)counts.scrollBursts++;scrolling=true;scrollUntil=now()+180;cancelFrame();syncClasses();arm();
    }
    function touchEnd(event){
        if(!touching||event.touches?.length)return;touching=false;if(enabled&&scrolling)scrollUntil=now()+180;arm();
    }
    function click(event){
        if(!enabled||!mobile||doc.hidden||!event.target?.closest?.('#options_button,#extensionsMenuButton'))return;
        if(!menu)counts.menuBursts++;menu=true;menuUntil=now()+280;cancelFrame();syncClasses();arm();
    }
    function input(event){
        if(!enabled||doc.hidden||event.target?.id!=='send_textarea')return;
        inputUntil=now()+100;cancelFrame();arm();
    }
    function suspend(){cancelFrame();if(timer)win.clearTimeout(timer);timer=0;scrolling=menu=touching=false;scrollUntil=menuUntil=inputUntil=0;syncClasses();}
    function visibility(){if(doc.hidden)suspend();else schedule();}
    function listen(on){const method=on?'addEventListener':'removeEventListener';
        for(const type of ['scroll','touchmove'])chat?.[method](type,scroll,{passive:true});
        for(const type of ['touchend','touchcancel'])doc[method](type,touchEnd,{capture:true,passive:true});
        doc[method]('click',click,true);doc[method]('input',input,true);doc[method]('visibilitychange',visibility);
        win[method]('pagehide',suspend);win[method]('pageshow',visibility);
    }
    return {
        setEnabled(on){on=on===true;if(on===enabled)return;enabled=on;listen(on);if(!on){suspend();pending.clear();}else schedule();},
        enqueue(list){if(!enabled)return;for(const key of list){if(pending.has(key))counts.coalesced++;pending.set(key,true);}schedule();},
        cancel(key){pending.delete(key);if(!pending.size)cancelFrame();},
        clear(){pending.clear();cancelFrame();},busy,
        status:()=>({enabled,mobile,scrolling,menuTransition:menu,pending:pending.size,frameScheduled:!!raf,budgetMs,capacityMs:capacity,...counts,nativePerformance:'not-integrated'}),
        destroy(){this.setEnabled(false);}
    };
}
