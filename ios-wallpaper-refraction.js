// iOS wallpaper refraction: refract only the host wallpaper with an ordinary foreground filter.
// This never captures messages or the page framebuffer, and never claims full backdrop refraction.
export function wallpaperPlacement({width,height,imageWidth,imageHeight,size='cover',position='50% 50%'}) {
    if(![width,height,imageWidth,imageHeight].every(x=>Number.isFinite(x)&&x>0))return null;
    let w=imageWidth,h=imageHeight;
    const length=(v,extent)=>v.endsWith('%')?parseFloat(v)*extent/100:v.endsWith('px')?parseFloat(v):v==='0'?0:null;
    if(size==='cover'||size==='contain'){const scale=Math[size==='cover'?'max':'min'](width/w,height/h);w*=scale;h*=scale;}
    else{const parts=size.trim().split(/\s+/);if(parts.length===1)parts.push('auto');if(parts.length!==2)return null;
        const a=parts[0]==='auto'?null:length(parts[0],width),b=parts[1]==='auto'?null:length(parts[1],height);
        if(parts[0]!=='auto'&&a===null||parts[1]!=='auto'&&b===null)return null;
        if(a!==null&&b!==null){w=a;h=b;}else if(a!==null){h=h*a/w;w=a;}else if(b!==null){w=w*b/h;h=b;}
    }
    const parts=position.trim().split(/\s+/);if(parts.length!==2)return null;
    const offset=(v,free)=>({left:0,top:0,center:free/2,right:free,bottom:free})[v]??length(v,free);
    const x=offset(parts[0],width-w),y=offset(parts[1],height-h);
    return [w,h,x,y].every(Number.isFinite)?{width:w,height:h,x,y}:null;
}
export function createIOSWallpaperRefraction({background,onReady=()=>{},win=window,doc=document,
    hostClass='ilg-ios-wallpaper-host',planeClass='ilg-ios-wallpaper-plane',rimClass='',bleed=0,inheritSourceFilter=false,layoutPlane=null,disposeRim=null,followingMotion=null}={}) {
    const entries=new Map();let enabled=false,source=null,raf=0,listening=false,reason='disabled';
    const events=[[win,'resize'],[win.visualViewport,'resize'],[win.visualViewport,'scroll'],[doc,'scroll']];
    const listen=on=>{if(on===listening)return;listening=on;for(const [target,type]of events)target?.[on?'addEventListener':'removeEventListener'](type,schedule,{capture:true,passive:true});};
    function releaseRim(item){if(item.rim){disposeRim?.(item.rim);item.rim.remove();item.rim=null;}}
    function release(el){const item=entries.get(el);if(!item)return;item.plane.remove();releaseRim(item);entries.delete(el);el.classList.remove(hostClass);if(!entries.size){listen(false);if(raf)win.cancelAnimationFrame(raf);raf=0;}}
    function queuePaint(){if(enabled)onReady();}
    function getSource(){
        const el=background?.();if(!el){reason='no-wallpaper';return null;}
        const css=win.getComputedStyle(el),match=/^url\(["']?(.*?)["']?\)$/.exec(css.backgroundImage);
        if(!match){reason='unsupported-wallpaper';return null;}
        const url=match[1];
        if(source?.url!==url){if(source){source.image.onload=source.image.onerror=null;}const image=new win.Image();source={url,image,loaded:false,failed:false};const current=source;
            image.onload=()=>{if(source!==current)return;current.loaded=image.naturalWidth>0&&image.naturalHeight>0;reason=current.loaded?'ready':'image-unavailable';queuePaint();};
            image.onerror=()=>{if(source!==current)return;current.failed=true;reason='image-unavailable';queuePaint();};image.src=url;
        }
        if(!source.loaded){reason=source.failed?'image-unavailable':'loading-wallpaper';return null;}
        return {el,css,...source};
    }
    function measureWallpaper(src) {
        const rect = src.el.getBoundingClientRect();
        const { backgroundImage, backgroundSize, backgroundPosition, backgroundRepeat, filter } = src.css;
        const placement = wallpaperPlacement({width: rect.width, height: rect.height,
            imageWidth: src.image.naturalWidth, imageHeight: src.image.naturalHeight, size: backgroundSize, position: backgroundPosition});
        if (!placement) return null;
        return {
            x: rect.left + placement.x, y: rect.top + placement.y,
            image: backgroundImage, size: `${placement.width}px ${placement.height}px`, repeat: backgroundRepeat,
            filter: inheritSourceFilter && filter !== 'none' ? `${filter} ` : '',
        };
    }
    function update(el, item, wallpaper, host) {
        if (!(host?.width > 0 && host.height > 0)) { release(el); return false; }
        if (!wallpaper) { reason = 'unsupported-background-layout'; release(el); return false; }
        const rimFilter = layoutPlane?.(item.plane, el, host, bleed, item.rim, item.rimGeometry) || '';
        const position = `${wallpaper.x - host.left + bleed}px ${wallpaper.y - host.top + bleed}px`;
        const key = [wallpaper.image, wallpaper.size, wallpaper.repeat, wallpaper.filter, item.filter, rimFilter].join('|');
        if (item.key !== key) {
            item.key = key;
            const draw = (plane, filter) => {
                plane.style.backgroundImage = wallpaper.image;
                plane.style.backgroundSize = wallpaper.size;
                plane.style.backgroundRepeat = wallpaper.repeat;
                plane.style.filter = wallpaper.filter + filter;
            };
            draw(item.plane, item.filter);
            if (item.rim) draw(item.rim, rimFilter);
        }
        if (item.position !== position) {
            item.position = position;
            item.plane.style.backgroundPosition = position;
            if (item.rim) item.rim.style.backgroundPosition = position;
        }
        if (item.rim && item.rim.hidden !== !rimFilter) item.rim.hidden = !rimFilter;
        reason = 'ready';
        return true;
    }
    function schedule() {
        if (!enabled || raf || !entries.size) return;
        raf = win.requestAnimationFrame(() => {
            raf = 0;
            const src = getSource();
            if (!src) {
                for (const el of entries.keys()) release(el);
                queuePaint();
                return;
            }
            // One wallpaper layout per frame. Measure crops before updating their styles.
            const wallpaper = measureWallpaper(src);
            const surfaces = Array.from(entries, ([el, item]) => ({el, item, host: el.isConnected ? el.getBoundingClientRect() : null}));
            for (const {el, item, host} of surfaces) update(el, item, wallpaper, host);
            if (followingMotion && [...entries.keys()].some(followingMotion)) schedule();
        });
    }
    return {
        setEnabled(on){enabled=on===true;if(!enabled){for(const el of [...entries.keys()])release(el);if(source){source.image.onload=source.image.onerror=null;}source=null;reason='disabled';}},
        paint(el,filter,rimGeometry=null){if(!enabled)return false;const src=getSource();if(!src){release(el);return false;}
            let item=entries.get(el);
            if(!item){
                if(entries.size>=8){reason='surface-budget';return false;}
                const plane=doc.createElement('div');plane.className=planeClass;plane.setAttribute('aria-hidden','true');
                if(bleed)plane.style.inset=`-${bleed}px`;
                el.prepend(plane);el.classList.add(hostClass);item={plane,filter};entries.set(el,item);
            }
            if(rimClass&&rimGeometry&&!item.rim){
                const rim=doc.createElement('div');rim.className=rimClass;rim.setAttribute('aria-hidden','true');
                rim.style.inset=`-${bleed}px`;
                rim.style.setProperty('--ilg-wallpaper-bleed',`${bleed}px`);
                item.plane.after(rim);item.rim=rim;item.key=null;item.position=null;
            }else if(!rimGeometry)releaseRim(item);
            item.filter=filter;item.rimGeometry=rimGeometry;
            const host = el.isConnected ? el.getBoundingClientRect() : null;
            const ok = update(el, item, measureWallpaper(src), host);
            if(ok)listen(true);return ok;
        },release,follow:schedule,refresh(){if(enabled){if(entries.size)schedule();else queuePaint();}},status:()=>({enabled,mode:'wallpaper-only',reason,surfaces:entries.size,imageLoaded:source?.loaded===true,fullBackdropRefraction:false,phonePixelsConfirmed:false}),
        destroy(){this.setEnabled(false);}
    };
}
