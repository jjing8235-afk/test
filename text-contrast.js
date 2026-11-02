// Readability changes only foreground color. No wrapper, fill, image or message mutation.
export function chooseTextTone(samples, previous = null, home = false) {
    const values = samples.filter(v => typeof v === 'number' && Number.isFinite(v));
    if (!values.length) return null;
    values.sort((a,b) => a-b);
    const median = values[Math.floor(values.length / 2)];
    // The home mark keeps its original light identity across textured midtones.
    // Switch to dark only on a consistently pale patch, not a median roof color.
    if (home) {
        const low = values[Math.floor((values.length - 1) * .2)];
        if (previous === 'dark' && low >= .60 && median >= .68) return 'dark';
        if (previous === 'light' && (low <= .68 || median <= .78)) return 'light';
        return low > .64 && median > .72 ? 'dark' : 'light';
    }
    // Hysteresis avoids flicker while a line crosses textured wallpaper.
    if (previous === 'dark' && median >= .40) return 'dark';
    if (previous === 'light' && median <= .50) return 'light';
    return median > .45 ? 'dark' : 'light';
}

export function createTextContrast({ view = window, doc = document, enabled, chatEnabled = enabled, sample }) {
    const classes = ['ilg-text-dark','ilg-text-light'];
    const tracked = new Set();
    const visible = new Set(), observed = new Set();
    const intersections = view.IntersectionObserver ? new view.IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target); else { visible.delete(entry.target); clear(entry.target); }
        }
        schedule();
    }) : null;
    let candidates = [], dirty = true, timer = 0, raf = 0, disposed = false;
    const chat = doc.getElementById('chat');
    function clear(node) {
        classes.forEach(c => node.classList.remove(c)); tracked.delete(node);
    }
    function allowed(node) {
        const message = node.closest('.mes');
        if (!message) return !!node.closest('#ilg-home');
        return chatEnabled() && !message.matches('.smallSysMes')
            && !node.closest('.ilg-card-surface,iframe')
            && !node.hasAttribute('style')
            && !node.querySelector('iframe, .ilg-card-surface, [style], input, button, canvas, svg');
    }
    function update() {
        raf = 0;
        if (disposed) return;
        if (!enabled() || doc.hidden) { tracked.forEach(clear); return; }
        if (dirty) {
            candidates = [...doc.querySelectorAll('#chat .mes .mes_text > p, #chat .mes .mes_text > ul, #chat .mes .mes_text > ol, #chat .mes .mes_text > blockquote, #ilg-home .ilg-home-title, #ilg-home .ilg-home-sub, #ilg-home .ilg-home-logo')];
            const next = new Set(candidates);
            for (const node of observed) if (!next.has(node)) { intersections?.unobserve(node); visible.delete(node); observed.delete(node); }
            for (const node of candidates) if (!observed.has(node)) { observed.add(node); intersections?.observe(node); }
            dirty = false;
        }
        const updates = [];
        for (const node of intersections ? visible : candidates) {
            if (!node.isConnected || !allowed(node)) { if (tracked.has(node)) updates.push([node,null]); continue; }
            const r = node.getBoundingClientRect();
            if (!r.width || !r.height || r.bottom < 0 || r.top > view.innerHeight || r.right < 0 || r.left > view.innerWidth) continue;
            const left = Math.max(0,r.left), right = Math.min(view.innerWidth,r.right);
            const top = Math.max(0,r.top), bottom = Math.min(view.innerHeight,r.bottom);
            const values=[];
            for (const y of [.25,.75]) for (const x of [.15,.5,.85]) values.push(sample(left+(right-left)*x,top+(bottom-top)*y));
            const previous=node.classList.contains('ilg-text-dark')?'dark':node.classList.contains('ilg-text-light')?'light':null;
            updates.push([node,chooseTextTone(values,previous,!node.closest('.mes'))]);
        }
        // Read all geometries before changing any styles.
        for (const [node,tone] of updates) {
            if (!tone) { clear(node); continue; }
            node.classList.toggle('ilg-text-dark',tone==='dark');
            node.classList.toggle('ilg-text-light',tone==='light');
            tracked.add(node);
        }
        tracked.forEach(node => { if (!node.isConnected || !allowed(node)) clear(node); });
    }
    function schedule(recollect = false) {
        if (disposed) return;
        dirty ||= recollect;
        tracked.forEach(node => { if (!node.isConnected || !allowed(node)) clear(node); });
        if (!enabled() || doc.hidden) {
            view.clearTimeout(timer); timer = 0;
            if (raf) view.cancelAnimationFrame(raf); raf=0;
            tracked.forEach(clear); return;
        }
        if (!timer && !raf) timer=view.setTimeout(()=>{timer=0;raf=view.requestAnimationFrame(update)},120);
    }
    const scroll=()=>schedule(), resize=()=>schedule(), visibility=()=>schedule(true);
    const observer=new view.MutationObserver(()=>schedule(true));
    if(chat)observer.observe(chat,{childList:true,subtree:true,characterData:true});
    const home=doc.getElementById('ilg-home');
    if(home)observer.observe(home,{childList:true,subtree:true,characterData:true});
    chat?.addEventListener('scroll',scroll,{passive:true});
    view.addEventListener('resize',resize);doc.addEventListener('visibilitychange',visibility);
    return { schedule, dispose(){disposed=true;observer.disconnect();intersections?.disconnect();visible.clear();observed.clear();view.clearTimeout(timer);if(raf)view.cancelAnimationFrame(raf);tracked.forEach(clear);chat?.removeEventListener('scroll',scroll);view.removeEventListener('resize',resize);doc.removeEventListener('visibilitychange',visibility);} };
}
