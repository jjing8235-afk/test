// Shared surface lighting. Distance/normal sampling follows the actual rounded
// contour, so long capsules do not inherit a conic gradient's uniform white frame.
const cache = new Map();
let pixels = 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Returns straight RGBA reflection colour and alpha in out. The centre has no coating.
export function reflectionPixel(depth, nx, ny, out) {
    if (depth < 0 || depth > 7) { out[3] = 0; return out; }
    const facing = -nx * .573576 - ny * .819152;
    const key = Math.pow(Math.max(0, facing), 7);
    const bounce = Math.pow(Math.max(0, -facing), 10);
    const crest = Math.exp(-(((depth - .55) / .43) ** 2));
    const shoulder = Math.exp(-(((depth - 1.65) / 1.1) ** 2));
    const returnBand = Math.exp(-(((depth - 2.5) / .9) ** 2));
    const shine = crest * (.025 + .72 * key + .2 * bounce) + shoulder * (.11 * key + .025 * bounce);
    const cool = returnBand * bounce * .07;
    const shade = Math.exp(-(((depth - 1.45) / .65) ** 2)) * (.025 + .045 * Math.max(0, -facing));
    const total = shine + cool + shade;
    out[0] = total ? (shine * 252 + cool * 216 + shade * 12) / total : 0;
    out[1] = total ? (shine * 254 + cool * 238 + shade * 24) / total : 0;
    out[2] = total ? (shine * 255 + cool * 255 + shade * 38) / total : 0;
    out[3] = clamp(total, 0, .86) * 255;
    return out;
}
function roundedReflection(width, height, radius) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    const r = clamp(radius, 0, Math.min(w, h) / 2);
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1), 1536 / w, 768 / h);
    const key = [w, h, r, scale].join(':');
    if (cache.has(key)) { const item = cache.get(key); cache.delete(key); cache.set(key, item); return item.url; }
    const cw = Math.max(2, Math.round(w * scale)), ch = Math.max(2, Math.round(h * scale));
    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    const image = ctx.createImageData(cw, ch), data = image.data, out = [0, 0, 0, 0];
    for (let y = 0, p = 0; y < ch; y++) for (let x = 0; x < cw; x++, p += 4) {
        const px = (x + .5) * w / cw - w / 2, py = (y + .5) * h / ch - h / 2;
        const qx = Math.abs(px) - w / 2 + r, qy = Math.abs(py) - h / 2 + r;
        const ex = Math.max(qx, 0), ey = Math.max(qy, 0), length = Math.hypot(ex, ey);
        const depth = r - length - Math.min(Math.max(qx, qy), 0);
        if (depth < 0 || depth > 7) continue;
        const nx = length ? Math.sign(px) * ex / length : qx > qy ? Math.sign(px) : 0;
        const ny = length ? Math.sign(py) * ey / length : qy >= qx ? Math.sign(py) : 0;
        reflectionPixel(depth, nx, ny, out);
        for (let c = 0; c < 4; c++) data[p + c] = out[c];
    }
    ctx.putImageData(image, 0, 0);
    const url = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0;
    while (cache.size && (cache.size >= 24 || pixels + cw * ch > 2097152)) {
        const first = cache.keys().next().value; pixels -= cache.get(first).pixels; cache.delete(first);
    }
    cache.set(key, {url, pixels: cw * ch}); pixels += cw * ch;
    return url;
}
export function createGlassReflections() {
    const known = new Set(), motion = matchMedia('(prefers-reduced-motion: reduce)');
    let enabled = false, active = null;
    const reduced = () => motion.matches || document.body.classList.contains('reduced-motion');
    function reset() { active?.el.classList.remove('ilg-reflection-pressed'); active = null; }
    function release(el) {
        if (active?.el === el) reset();
        known.delete(el); el.classList.remove('ilg-reflection', 'ilg-reflection-pressed');
        for (const key of ['--ilg-reflection-map', '--ilg-reflection-x', '--ilg-reflection-y']) el.style.removeProperty(key);
    }
    function paint(el, width, height, radius) {
        try {
            const url = roundedReflection(width, height, radius);
            if (!url) { release(el); return; }
            const image = `url("${url}")`;
            if (el.style.getPropertyValue('--ilg-reflection-map') !== image) el.style.setProperty('--ilg-reflection-map', image);
            el.classList.add('ilg-reflection'); known.add(el);
        } catch { release(el); /* Keep the CSS contour when canvas is restricted. */ }
    }
    function press(event) {
        if (!enabled || reduced() || document.body.classList.contains('no-blur') || active) return;
        if (event.type === 'pointerdown' && event.button > 0) return;
        if (event.type === 'keydown' && (event.repeat || !['Enter', ' '].includes(event.key))) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest('[disabled], [aria-disabled="true"], textarea, input, select, [contenteditable="true"]')) return;
        for (const el of known) {
            if (!el.matches('.ilg-control-surface, #ilg-ball') || !el.isConnected || el.hidden || !el.offsetWidth) continue;
            if (!el.contains(target) && !el.icons?.some(icon => icon.contains(target))) continue;
            const r = el.getBoundingClientRect(), pointer = event.type === 'pointerdown';
            el.style.setProperty('--ilg-reflection-x', `${pointer ? clamp(event.clientX - r.left, 0, r.width) : r.width / 2}px`);
            el.style.setProperty('--ilg-reflection-y', `${pointer ? clamp(event.clientY - r.top, 0, r.height) : r.height / 2}px`);
            el.classList.add('ilg-reflection-pressed'); active = {el, id:pointer ? event.pointerId : event.key}; return;
        }
    }
    function up(event) { if (active && active.id === (event.type.startsWith('pointer') ? event.pointerId : event.key)) reset(); }
    function visibility() { if (document.hidden) reset(); }
    function out(event) { if (!event.relatedTarget) reset(); }
    const events = [['pointerdown', press], ['pointerup', up], ['pointercancel', up], ['pointerout', out], ['keydown', press], ['keyup', up], ['visibilitychange', visibility]];
    function setEnabled(on) {
        if (enabled === on) return;
        enabled = on;
        for (const [name, listener] of events) document[on ? 'addEventListener' : 'removeEventListener'](name, listener, {passive:true});
        window[on ? 'addEventListener' : 'removeEventListener']('blur', reset);
        if (!on) { reset(); [...known].forEach(release); cache.clear(); pixels = 0; }
    }
    motion.addEventListener('change', reset);
    return {paint, release, setEnabled};
}
