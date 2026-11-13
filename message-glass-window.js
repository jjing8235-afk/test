// Bound only NVWA's backdrop plane. Authored content, message height and scroll state stay native.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function messageWindowGeometry({w,h,r,viewportHeight,viewportTop=0,top=0}) {
    const viewport=Math.max(1,Math.ceil(viewportHeight)),overscan=Math.max(96,Math.min(256,Math.ceil(viewport/3)));
    const height=Math.min(h,viewport+overscan*2);
    if(h<=height||!w||!h)return {w,h,r};
    const offset=clamp(Math.floor((viewportTop-top-overscan)/64)*64,0,h-height);
    return {w,h:height,r,messageHeight:h,window:{offset,height,overscan,sourceHeight:h}};
}
export function createMessageGlassWindow({chat,mobile=false,onResize=()=>{},win=window,doc=document}={}) {
    const states=new Map(),active=new Set();let enabled=false,raf=0;
    const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(resize):null;
    const counts={updates:0,moves:0};
    function reset(el,state){el.classList.remove('ilg-message-window');state?.layer.style.removeProperty('height');state?.layer.style.removeProperty('transform');}
    function cancel(){if(raf)win.cancelAnimationFrame(raf);raf=0;}
    function move(state,offset){if(state.offset===offset)return;state.offset=offset;state.layer.style.transform='translateY('+offset+'px)';counts.moves++;}
    function update(){
        raf=0;if(!enabled||doc.hidden||!states.size)return;
        const view=chat.getBoundingClientRect(),jobs=[];
        // Finish all geometry reads before changing a backdrop layer.
        for(const state of active){const el=state.el;if(!el.isConnected)continue;const rect=el.getBoundingClientRect();const geometry=messageWindowGeometry({w:state.width,h:state.sourceHeight,r:state.radius,viewportHeight:chat.clientHeight||view.height,viewportTop:view.top,top:rect.top});jobs.push({el,state,geometry});}
        const resized=[];
        for(const {el,state,geometry}of jobs){if(!geometry.window||geometry.h!==state.height){resized.push(el);continue;}move(state,geometry.window.offset);}
        counts.updates++;if(resized.length)onResize(resized);
    }
    function schedule(){if(enabled&&!doc.hidden&&states.size&&!raf)raf=win.requestAnimationFrame(update);}
    function visibility(){if(doc.hidden)cancel();else schedule();}
    function resize(){if(enabled&&states.size)onResize([...states.keys()]);}
    function listen(on){const method=on?'addEventListener':'removeEventListener';chat?.[method]('scroll',schedule,{passive:true});win[method]('resize',resize);doc[method]('visibilitychange',visibility);win[method]('pagehide',cancel);win[method]('pageshow',schedule);}
    return {
        plan(el,geometry,visible){
            if(!enabled||!mobile||!chat||!geometry.w||!geometry.h)return geometry;
            const height=chat.clientHeight||win.innerHeight||1;
            if(geometry.h<=height+Math.max(96,Math.min(256,Math.ceil(height/3)))*2)return geometry;
            const view=visible?chat.getBoundingClientRect():{top:0},rect=visible?el.getBoundingClientRect():{top:0};
            return messageWindowGeometry({...geometry,viewportHeight:height,viewportTop:view.top,top:rect.top});
        },
        apply(el,layer,geometry,visible){
            const window=geometry.window;
            if(!window){this.release(el);return;}
            el.classList.add('ilg-message-window');
            let state=states.get(el);
            if(state?.layer!==layer){if(state){active.delete(state);reset(el,state);}state={el,layer,offset:null};states.set(el,state);el.classList.add('ilg-message-window');}
            if(state.height!==window.height){layer.style.height=window.height+'px';state.height=window.height;}
            Object.assign(state,{width:geometry.w,radius:geometry.r,sourceHeight:window.sourceHeight});if(visible)active.add(state);else active.delete(state);move(state,window.offset);
        },
        visibility(el,visible){const state=states.get(el);if(state){if(visible){active.add(state);schedule();}else active.delete(state);}},
        release(el){const state=states.get(el);if(!state)return;reset(el,state);active.delete(state);states.delete(el);if(!states.size)cancel();},
        setEnabled(on){on=on===true&&mobile;if(enabled===on)return;enabled=on;listen(on);if(on)observer?.observe(chat);else observer?.disconnect();if(!on){cancel();for(const [el,state]of states)reset(el,state);states.clear();active.clear();}},
        status:()=>({enabled,tracked:states.size,active:active.size,maxBackdropHeight:Math.max(0,...[...states.values()].map(s=>s.height)),...counts}),
        destroy(){this.setEnabled(false);}
    };
}
