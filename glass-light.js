// Optional device-orientation light. Sensor readings stay in memory and never leave this module.
export function tiltOffset(beta, gamma, origin, screenAngle = 0) {
    const clamp = v => Math.max(-30, Math.min(30, v));
    const wrap = v => ((v + 540) % 360) - 180;
    const x = clamp(wrap(gamma - origin.gamma)), y = clamp(wrap(beta - origin.beta));
    const a = screenAngle * Math.PI / 180;
    return Math.max(-42, Math.min(42, (x * Math.cos(a) + y * Math.sin(a)) * 1.05 + (y * Math.cos(a) - x * Math.sin(a)) * 0.45));
}

export function createTiltLight({ active, changed, status, view = window, doc = document }) {
    let listening = false, granted = false, pending = false, disposed = false, suspended = false;
    let origin = null, current = 0, target = 0, raf = 0, timer = 0, lastTime = 0;
    const media = view.matchMedia('(prefers-reduced-motion: reduce)');
    let bodyReduced = doc.body.classList.contains('reduced-motion');
    const bodyObserver = view.MutationObserver ? new view.MutationObserver(() => {
        const next = doc.body.classList.contains('reduced-motion');
        if (next !== bodyReduced) { bodyReduced = next; sync(); }
    }) : null;
    bodyObserver?.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    const reduced = () => media.matches || doc.body.classList.contains('reduced-motion');
    const allowed = () => !disposed && !suspended && active() && !doc.hidden && !reduced();
    const supported = () => view.isSecureContext && typeof view.DeviceOrientationEvent !== 'undefined';
    const requestRequired = () => typeof view.DeviceOrientationEvent?.requestPermission === 'function';
    const notify = (message, retry = false) => status(message, retry);
    function stop() {
        const hadLight = listening || origin !== null || raf !== 0;
        if (listening) view.removeEventListener('deviceorientation', orientation);
        listening = false;
        view.clearTimeout(timer); timer = 0;
        if (raf) view.cancelAnimationFrame(raf);
        raf = 0; origin = null; current = target = 0; lastTime = 0;
        if (hadLight) changed();
    }
    function frame(time) {
        raf = 0;
        if (!allowed() || !listening) { sync(); return; }
        const dt = lastTime ? Math.min(64, time - lastTime) : 16;
        lastTime = time;
        current += (target - current) * (1 - Math.exp(-dt / 100));
        if (Math.abs(target - current) < 0.1) current = target;
        changed();
        if (current !== target) raf = view.requestAnimationFrame(frame);
    }
    function orientation(event) {
        if (!allowed()) { sync(); return; }
        if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
        if (!origin) {
            origin = { beta: event.beta, gamma: event.gamma };
            view.clearTimeout(timer); timer = 0;
            notify('姿态跟光已启用，轻倾手机即可改变光线。');
        }
        target = tiltOffset(event.beta, event.gamma, origin, view.screen?.orientation?.angle ?? view.orientation ?? 0);
        if (!raf && Math.abs(target - current) >= 0.1) { lastTime = 0; raf = view.requestAnimationFrame(frame); }
    }
    function sync() {
        if (disposed) return;
        if (!allowed()) {
            stop();
            notify(!active() ? '开启后以当前握姿为基准；只改变光线，不改变玻璃折射。' : reduced() ? '减少动态效果已开启，暂用固定光源。' : '页面在后台，姿态跟光已暂停。');
            return;
        }
        if (!supported()) { stop(); notify('当前页面未提供姿态感应；请用支持感应的 HTTPS 页面，暂用固定光源。'); return; }
        if (requestRequired() && !granted) { stop(); notify('轻点授权后启用姿态跟光；不授权时继续使用固定光源。', true); return; }
        if (listening) return;
        listening = true;
        view.addEventListener('deviceorientation', orientation, { passive: true });
        notify('请轻倾手机，等待姿态感应。');
        timer = view.setTimeout(() => { timer = 0; if (listening && !origin) notify('未收到姿态数据，暂用固定光源；可检查浏览器感应权限。'); }, 4000);
    }
    async function enable() {
        if (disposed || pending) return;
        if (!active() || !supported() || reduced()) { sync(); return; }
        if (requestRequired() && !granted) {
            pending = true;
            try {
                // Call directly within the user's checkbox/button event; never request on page load.
                granted = await view.DeviceOrientationEvent.requestPermission() === 'granted';
                if (disposed) return;
                if (!granted) { stop(); notify('未授予姿态权限，继续使用固定光源；可再次授权。', true); return; }
            } catch {
                if (!disposed) { stop(); notify('无法取得姿态权限，继续使用固定光源；请在浏览器中检查。', true); }
                return;
            } finally { pending = false; }
        }
        sync();
    }
    function rebase() { origin = null; current = target = 0; changed(); }
    function hide() { suspended = true; sync(); }
    function show() { suspended = false; sync(); }
    doc.addEventListener('visibilitychange', sync);
    view.addEventListener('pagehide', hide);
    view.addEventListener('pageshow', show);
    view.screen?.orientation?.addEventListener('change', rebase);
    view.addEventListener('orientationchange', rebase);
    media.addEventListener('change', sync);
    return {
        offset: () => listening && origin && allowed() ? current : null,
        sync, enable,
        dispose() {
            disposed = true; bodyObserver?.disconnect(); stop();
            doc.removeEventListener('visibilitychange', sync);
            view.removeEventListener('pagehide', hide); view.removeEventListener('pageshow', show);
            view.screen?.orientation?.removeEventListener('change', rebase);
            view.removeEventListener('orientationchange', rebase);
            media.removeEventListener('change', sync);
        },
    };
}
