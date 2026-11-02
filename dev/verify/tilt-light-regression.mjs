import assert from 'node:assert/strict';
import { createTiltLight, tiltOffset } from '../../glass-light.js';

const passed = [];
function environment({ permission, secure = true, supported = true, saved = true } = {}) {
    const view = new EventTarget(), doc = new EventTarget(), media = new EventTarget(), screen = new EventTarget();
    let hostReduced = false, bodyCallback;
    view.MutationObserver = class { constructor(fn) { bodyCallback = fn; } observe() {} disconnect() { bodyCallback = null; } };
    let active = saved, frames = new Map(), timers = new Map(), seq = 0, sensorListeners = 0, requests = 0, updates = 0;
    const notices = [];
    doc.hidden = false; doc.body = { classList: { contains: () => hostReduced } };
    media.matches = false; view.matchMedia = () => media; view.screen = { orientation: screen }; screen.angle = 0;
    view.isSecureContext = secure;
    if (supported) view.DeviceOrientationEvent = permission ? { requestPermission() { requests++; return permission(); } } : {};
    view.requestAnimationFrame = fn => { frames.set(++seq, fn); return seq; };
    view.cancelAnimationFrame = id => frames.delete(id);
    view.setTimeout = fn => { timers.set(++seq, fn); return seq; }; view.clearTimeout = id => timers.delete(id);
    const add = view.addEventListener.bind(view), remove = view.removeEventListener.bind(view);
    view.addEventListener = (type, ...args) => { if (type === 'deviceorientation') sensorListeners++; add(type, ...args); };
    view.removeEventListener = (type, ...args) => { if (type === 'deviceorientation') sensorListeners--; remove(type, ...args); };
    const light = createTiltLight({ active: () => active, changed: () => updates++, status: (...s) => notices.push(s), view, doc });
    return { view, doc, media, screen, light, notices,
        get requests() { return requests; }, get listeners() { return sensorListeners; }, get updates() { return updates; },
        get scheduled() { return frames.size + timers.size; }, setHostReduced(v) { hostReduced = v; bodyCallback?.(); }, setActive(v) { active = v; light.sync(); },
        event(beta, gamma) { const e = new Event('deviceorientation'); e.beta = beta; e.gamma = gamma; view.dispatchEvent(e); },
        settle() { for (let time = 16; frames.size && time < 10000; time += 16) { const batch = [...frames.values()]; frames.clear(); batch.forEach(f => f(time)); } assert.equal(frames.size, 0); },
        timeout() { const batch = [...timers.values()]; timers.clear(); batch.forEach(f => f()); },
    };
}
const neutral = { beta: 45, gamma: 0 };
assert.equal(tiltOffset(45, 0, neutral), 0);
assert(tiltOffset(45, 20, neutral) > 0); assert(tiltOffset(45, -20, neutral) < 0);
assert(Math.abs(tiltOffset(45, 20, neutral, 90) + 9) < 1e-9);
assert(Math.abs(tiltOffset(-179, 0, { beta: 179, gamma: 0 })) < 2);
assert(Math.abs(tiltOffset(140, 90, neutral)) <= 42);
passed.push('Neutral pose, opposite tilt, landscape rotation, wraparound and bounded travel');

const off = environment({ saved: false }); off.light.sync(); assert.equal(off.listeners, 0); off.light.dispose();
const a = environment(); a.light.sync(); a.light.sync(); assert.equal(a.listeners, 1); assert.equal(a.light.offset(), null);
a.event(null, 0); a.event(45, NaN); assert.equal(a.light.offset(), null);
a.timeout(); assert(a.notices.at(-1)[0].includes('未收到'));
a.event(45, 0); assert.equal(a.light.offset(), 0); a.event(45, 20);
assert.equal(a.light.offset(), 0, 'Never jump immediately to target'); a.settle(); assert(Math.abs(a.light.offset() - 21) < 0.1);
const settled = a.updates; a.settle(); assert.equal(a.updates, settled, 'No perpetual animation');
a.screen.angle = 90; a.screen.dispatchEvent(new Event('change')); assert.equal(a.light.offset(), null); a.event(45, 20); assert.equal(a.light.offset(), 0);
a.event(45, 30); a.doc.hidden = true; a.doc.dispatchEvent(new Event('visibilitychange'));
assert.equal(a.listeners, 0); assert.equal(a.scheduled, 0); assert.equal(a.light.offset(), null);
a.doc.hidden = false; a.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(a.listeners, 1);
a.media.matches = true; a.media.dispatchEvent(new Event('change')); assert.equal(a.listeners, 0);
a.media.matches = false; a.media.dispatchEvent(new Event('change')); assert.equal(a.listeners, 1);
a.setHostReduced(true); assert.equal(a.listeners, 0); a.setHostReduced(false); assert.equal(a.listeners, 1);
a.view.dispatchEvent(new Event('pagehide')); assert.equal(a.listeners, 0); a.view.dispatchEvent(new Event('pageshow')); assert.equal(a.listeners, 1);
a.setActive(false); assert.equal(a.listeners, 0); assert.equal(a.scheduled, 0); a.light.dispose(); a.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(a.listeners, 0);
passed.push('Opt-in, invalid readings, no-data fallback, smoothing, screen rebase, background/reduced-motion/off cleanup');

const p = environment({ permission: async () => 'granted' }); p.light.sync(); assert.equal(p.requests, 0); assert.equal(p.listeners, 0);
await p.light.enable(); assert.equal(p.requests, 1); assert.equal(p.listeners, 1); p.setActive(false); p.setActive(true); assert.equal(p.requests, 1); assert.equal(p.listeners, 1); p.light.dispose();
for (const permission of [async () => 'denied', async () => { throw Error('blocked'); }]) {
    const denied = environment({ permission }); await denied.light.enable(); assert.equal(denied.listeners, 0); assert.equal(denied.light.offset(), null); assert.equal(denied.notices.at(-1)[1], true); denied.light.dispose();
}
let resolvePermission; const pending = environment({ permission: () => new Promise(r => { resolvePermission = r; }) });
const permissionWork = pending.light.enable(); pending.setActive(false); resolvePermission('granted'); await permissionWork; assert.equal(pending.listeners, 0); pending.light.dispose();
for (const options of [{ secure: false }, { supported: false }]) {
    const unavailable = environment(options); await unavailable.light.enable(); assert.equal(unavailable.requests, 0); assert.equal(unavailable.listeners, 0); assert.equal(unavailable.light.offset(), null); unavailable.light.dispose();
}
passed.push('No permission prompt on load; user gesture grant/denial/error, async disable and unavailable-environment fallbacks');
console.log(JSON.stringify({ passed }, null, 2));
