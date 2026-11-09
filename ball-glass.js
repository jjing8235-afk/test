// 悬浮小球的“一整块”液态玻璃：小球和挨着的那块玻璃（顶栏岛 / 输入框）用平滑并集（smooth-min）合成一个形状，
// 再按这个形状重新算折射贴图。颈部和小球是同一块玻璃，折射圈顺着颈部弯过去，不再是“补一块”。
// 只在能做 SVG 背景折射的浏览器里用（index.js 的 ballSdfOn）；其他环境退回旧的颈部补片。
// 两套材质都支持：原版走 glass2.js 的截面查表（和普通玻璃同一张表），Web 走上游片段。
// 没挨着别的玻璃时，算出来就是原来那颗球，所以靠近、融合、分开都不会突然跳一下。
import { lut, LUT_N, physicalFilter } from './glass2.js';
import { reflectionPixel } from './glass-reflections.js';
import { sampleWebDisplacement, webMapHalf, FILTER_TAIL } from './liquid-glass-web.js';

const NS = 'http://www.w3.org/2000/svg';
const PAD = 3, SHADE = 18, WEB_STEPS = 64, SEAM = 4;
// 接缝：融合玻璃离那块玻璃的边越近越淡、折射越弱，贴边处归零，不会在接缝上折出一条彩线
const seamK = d => { const t = clamp(d / SEAM, 0, 1); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// 多项式 smooth-min：两个距离差在 k 以内时往下“鼓”，两块形状之间就长出颈部；离得比 k/2 远就是普通并集
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function rrSdf(x, y, t) {
    const hw = (t.r - t.l) / 2, hh = (t.b - t.t) / 2;
    const qx = Math.abs(x - t.l - hw) - hw + t.rad, qy = Math.abs(y - t.t - hh) - hh + t.rad;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - t.rad;
}
const physMax = new WeakMap(), webTables = new Map();
// Web 材质：沿原生小球的横轴、竖轴取“离边多深 → 偏多少”，颈部那段用这张表（球本身仍用原生片段）
function webTable(recipe, preset, R0) {
    const key = preset + '|' + R0;
    if (webTables.has(key)) { const value = webTables.get(key); webTables.delete(key); webTables.set(key, value); return value; }
    const n0 = 2 * R0, tab = new Float32Array(WEB_STEPS + 1);
    for (let q = 0; q <= WEB_STEPS; q++) {
        const dep = q / WEB_STEPS * R0;
        const a = sampleWebDisplacement(n0 - dep, R0, n0, n0, recipe)[0], b = sampleWebDisplacement(R0, n0 - dep, n0, n0, recipe)[1];
        tab[q] = (Math.abs(a) + Math.abs(b)) / 2;
    }
    if (webTables.size >= 12) webTables.delete(webTables.keys().next().value);
    webTables.set(key, tab);
    return tab;
}

export function createBallGlass() {
    const glass = document.createElement('div'), shade = document.createElement('div');
    const blurBox = document.createElement('div'), shape = document.createElement('div');
    glass.id = 'ilg-ball-glass'; shade.id = 'ilg-ball-glass-shade';
    for (const el of [glass, shade]) { el.setAttribute('aria-hidden', 'true'); el.style.display = 'none'; }
    blurBox.append(shape); shade.append(blurBox);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    // 两个滤镜轮流用：每次重画换一个 id，backdrop-filter 的 url 变了，浏览器一定重新取样
    const filters = [0, 1].map(i => {
        const f = document.createElementNS(NS, 'filter');
        f.id = 'ilg-ball-glass-f' + i;
        for (const [k, v] of Object.entries({ filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB', x: 0, y: 0 })) f.setAttribute(k, v);
        svg.append(f);
        return f;
    });
    const canvas = document.createElement('canvas');
    let flip = 0, lastKey = '', litTarget = null, cachedPixels = 0, cachedChars = 0;
    const frames = new Map();
    function remember(key, value) {
        if (value.pixels > 524288 || value.chars > 2097152) return;
        while (frames.size && (frames.size >= 32 || cachedPixels + value.pixels > 524288 || cachedChars + value.chars > 2097152)) {
            const first = frames.keys().next().value, old = frames.get(first);
            cachedPixels -= old.pixels; cachedChars -= old.chars; frames.delete(first);
        }
        frames.set(key, value); cachedPixels += value.pixels; cachedChars += value.chars;
    }
    function clearReflection() {
        if (litTarget) for (const key of ['--ilg-fuse-light-x', '--ilg-fuse-light-y', '--ilg-fuse-light-r']) litTarget.style.removeProperty(key);
        litTarget = null;
    }
    const png = (w, h, fill) => {
        canvas.width = w; canvas.height = h;
        const c = canvas.getContext('2d'), img = c.createImageData(w, h);
        fill(img.data);
        c.putImageData(img, 0, 0);
        return canvas.toDataURL('image/png');
    };
    const setMask = (el, url) => { el.style.maskImage = el.style.webkitMaskImage = `url("${url}")`; };
    function mount() { if (!glass.isConnected) document.body.append(svg, shade, glass); }
    function hide() { glass.style.display = shade.style.display = 'none'; clearReflection(); }
    function remove() { hide(); glass.remove(); shade.remove(); svg.remove(); canvas.width = canvas.height = 0; lastKey = ''; frames.clear(); cachedPixels = cachedChars = 0; }
    // b：小球 { cx, cy, R }（屏幕坐标，R 含拖动 / 按下时的缩放）；t：要融合的那块玻璃
    // { l, t, r, b, rad, sx, sy, nx, ny }（外框、圆角、离球最近的点和朝外法线）或 null；
    // m：材质（index.js 的 ballMaterial）；K：融合半径；low：拖动 / 过渡中用有界预览，结束后恢复设备分辨率
    function paint(b, t, m, K, low) {
        mount();
        if (litTarget !== t?.el) clearReflection();
        if (t?.el) {
            litTarget = t.el;
            // Fade the target rim at the neck so the joined glass has one continuous contour.
            const reach = Math.sqrt(Math.max(0, (b.R + K / 2) ** 2 - (b.cx - t.sx) ** 2 - (b.cy - t.sy) ** 2));
            litTarget.style.setProperty('--ilg-fuse-light-x', (t.sx - t.l) + 'px');
            litTarget.style.setProperty('--ilg-fuse-light-y', (t.sy - t.t) + 'px');
            litTarget.style.setProperty('--ilg-fuse-light-r', Math.max(1, reach) + 'px');
        }
        const R = b.R;
        let x0 = b.cx - R, y0 = b.cy - R, x1 = b.cx + R, y1 = b.cy + R;
        if (t) {
            // 颈部的脚会沿着那块玻璃的边铺开一段，窗口要把它罩进来
            const tx = -t.ny, ty = t.nx, span = R + K, dip = 24;
            // 再往那块玻璃里面多罩 dip 像素：脚上的折射会往里取样，罩不到就取到空像素，接缝上冒彩点
            for (const [px, py] of [[t.sx + tx * span, t.sy + ty * span], [t.sx - tx * span, t.sy - ty * span],
                [t.sx + tx * span - t.nx * dip, t.sy + ty * span - t.ny * dip], [t.sx - tx * span - t.nx * dip, t.sy - ty * span - t.ny * dip]]) {
                x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
            }
        }
        const L = Math.floor(x0) - PAD, T = Math.floor(y0) - PAD, W = Math.ceil(x1) + PAD - L, H = Math.ceil(y1) + PAD - T;
        const ox = b.cx - L, oy = b.cy - T;
        const tt = t && { l: t.l - L, t: t.t - T, r: t.r - L, b: t.b - T, rad: t.rad };
        // Across a long straight edge, the far ends cannot affect the local SDF.
        // Canonical bounds let translated copies reuse one texture, including the padded shadow.
        if (tt) {
            const margin = SHADE + 2, hh = (tt.b - tt.t) / 2, hw = (tt.r - tt.l) / 2;
            if (tt.l <= -margin - hh && tt.r >= W + margin + hh) { tt.l = -margin - hh; tt.r = W + margin + hh; }
            else if (tt.t <= -margin - hw && tt.b >= H + margin + hw) { tt.t = -margin - hw; tt.b = H + margin + hw; }
        }
        const ballD = (x, y) => Math.hypot(x - ox, y - oy) - R;
        const fused = tt ? (x, y) => smin(ballD(x, y), rrSdf(x, y, tt), K) : ballD;
        // Dynamic fusion uses a bounded preview; release restores the full device resolution.
        // Masks retain their original CSS-pixel density; settled optical maps use device resolution.
        const k = low ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const cw = Math.max(2, Math.round(W * k)), ch = Math.max(2, Math.round(H * k)), sx = W / cw, sy = H / ch;
        const shadow = !document.body.classList.contains('noShadows');
        const key = [m.key, shadow ? 1 : 0, W, H, cw, ch, ox.toFixed(1), oy.toFixed(1), R.toFixed(2), K, low ? 1 : 0,
            tt ? [tt.l, tt.t, tt.r, tt.b, tt.rad].map(v => v.toFixed(1)).join(',') : ''].join('|');
        if (key !== lastKey) {
            let frame = frames.get(key);
            if (frame) { frames.delete(key); frames.set(key, frame); }
            else {
                // 覆盖范围：融合形状里、但不在那块玻璃里面（那块玻璃自己画自己，叠两层会发灰）
                const mk = Math.min(1, k), mw = Math.max(2, Math.round(W * mk)), mh = Math.max(2, Math.round(H * mk));
                const cover = png(mw, mh, D => {
                    for (let y = 0, p = 0; y < mh; y++) for (let x = 0; x < mw; x++, p += 4) {
                        const px = (x + .5) * W / mw, py = (y + .5) * H / mh;
                        const a = clamp(.5 - fused(px, py), 0, 1) * (tt ? seamK(rrSdf(px, py, tt) + 1) : 1);
                        D[p] = D[p + 1] = D[p + 2] = 255; D[p + 3] = a * 255;
                    }
                });
                // 影子：整个融合形状（含那块玻璃）以外才画，玻璃里面不能透出影子
                const SW = W + 2 * SHADE, SH = H + 2 * SHADE;
                const sw = Math.max(2, Math.round(SW * mk)), sh = Math.max(2, Math.round(SH * mk));
                const inv = shadow ? png(sw, sh, D => {
                    for (let y = 0, p = 3; y < sh; y++) for (let x = 0; x < sw; x++, p += 4) D[p] = (1 - clamp(.5 - fused((x + .5) * SW / sw - SHADE, (y + .5) * SH / sh - SHADE), 0, 1)) * 255;
                }) : '';
                // 折射贴图：距离场多算一圈边，法线用相邻格子差分
                const gw = cw + 2;
                const G = new Float32Array(gw * (ch + 2));
                for (let j = -1; j <= ch; j++) for (let i = -1; i <= cw; i++) G[(j + 1) * gw + i + 1] = fused((i + .5) * sx, (j + .5) * sy);
                const g = (i, j) => G[(j + 1) * gw + i + 1];
                const grad = (i, j) => { const gx = (g(i + 1, j) - g(i - 1, j)) / sx, gy = (g(i, j + 1) - g(i, j - 1)) / sy, l = Math.hypot(gx, gy) || 1; return [gx / l, gy / l]; };
                // The same SDF normal lights the ball and its neck; no circular outline is pasted over a fusion.
                const reflection = png(cw, ch, D => {
                    const sample = [0, 0, 0, 0];
                    for (let j = 0, p = 0; j < ch; j++) for (let i = 0; i < cw; i++, p += 4) {
                        const depth = -g(i, j);
                        if (depth < 0 || depth > 7) continue;
                        const [nx, ny] = grad(i, j);
                        reflectionPixel(depth, nx, ny, sample);
                        for (let c = 0; c < 4; c++) D[p + c] = sample[c];
                    }
                });
                let html;
                if (m.kind === 'phys') {
                    const o = m.o, lens = o.profile === 'lens', n0 = 2 * m.R0;
                    const bez = Math.max(2, Math.min(o.bezel, n0 * (lens ? .4 : .3)));
                    const Lt = lut(o.profile, bez, o.thickness * bez / o.bezel, o.ior, lens ? o.magnify : 0);
                    let maxO = physMax.get(Lt);
                    if (maxO === undefined) { maxO = .001; for (const v of Lt.d) maxO = Math.max(maxO, Math.abs(v)); physMax.set(Lt, maxO); }
                    const url = png(cw, ch, D => {
                        for (let j = 0, p = 0; j < ch; j++) for (let i = 0; i < cw; i++, p += 4) {
                            const depth = -g(i, j);
                            let dx = 0, dy = 0;
                            if (depth > 0 && depth < bez) {
                                const [nx, ny] = grad(i, j), f = depth / bez * LUT_N, f0 = f | 0, f1 = Math.min(f0 + 1, LUT_N);
                                const dd = Lt.d[f0] + (Lt.d[f1] - Lt.d[f0]) * (f - f0);
                                const sk = tt ? seamK(rrSdf((i + .5) * sx, (j + .5) * sy, tt)) : 1;
                                dx = -nx * dd * sk; dy = -ny * dd * sk;
                            }
                            D[p] = 128 + dx / maxO * 127; D[p + 1] = 128 + dy / maxO * 127; D[p + 2] = 128; D[p + 3] = 255;
                        }
                    });
                    html = physicalFilter({ full: { d: url }, scale: maxO * 255 / 127 }, o, W, H, m.angle);
                } else {
                    // Web：球本身照搬原生片段（和单独那颗球一模一样），只在颈部那段换成按深度查表
                    const n0 = 2 * m.R0, s0 = R / m.R0, tab = webTable(m.recipe, m.preset, m.R0), half = webMapHalf(n0, n0, m.preset);
                    const url = png(cw, ch, D => {
                        for (let j = 0, p = 0; j < ch; j++) for (let i = 0; i < cw; i++, p += 4) {
                            const x = (i + .5) * sx, y = (j + .5) * sy, d = g(i, j);
                            let dx = 0, dy = 0;
                            if (d < .5) {
                                const wN = tt ? 1 - clamp((ballD(x, y) - d) / 3, 0, 1) : 1;
                                const nX = (x - ox) / s0 + m.R0, nY = (y - oy) / s0 + m.R0;
                                if (wN > 0 && nX >= 0 && nY >= 0 && nX <= n0 && nY <= n0) {
                                    const v = sampleWebDisplacement(nX, nY, n0, n0, m.recipe);
                                    dx = v[0] * s0 * wN; dy = v[1] * s0 * wN;
                                }
                                if (wN < 1) {
                                    const q = clamp(-d / s0 / m.R0, 0, 1) * WEB_STEPS, q0 = q | 0, q1 = Math.min(q0 + 1, WEB_STEPS);
                                    const mag = (tab[q0] + (tab[q1] - tab[q0]) * (q - q0)) * s0, [nx, ny] = grad(i, j);
                                    dx -= nx * mag * (1 - wN); dy -= ny * mag * (1 - wN);
                                }
                                if (tt) { const sk = seamK(rrSdf(x, y, tt)); dx *= sk; dy *= sk; }
                            }
                            D[p] = clamp(dx / half + .5, 0, 1) * 255; D[p + 1] = clamp(dy / half + .5, 0, 1) * 255; D[p + 2] = 0; D[p + 3] = 255;
                        }
                    });
                    html = `<feImage href="${url}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="m"/>` +
                        `<feDisplacementMap in="SourceGraphic" in2="m" scale="${(half * m.recipe.ref).toFixed(3)}" xChannelSelector="R" yChannelSelector="G"/>`;
                }
                frame = { cover, inv, reflection, html, pixels: mw * mh + (shadow ? sw * sh : 0) + 2 * cw * ch, chars: cover.length + inv.length + reflection.length + html.length };
                remember(key, frame);
            }
            const { cover, inv, reflection, html } = frame;
            glass.style.backgroundImage = 'url("' + reflection + '")';
            glass.style.setProperty('--ilg-reflection-map', 'url("' + reflection + '")');
            glass.style.backgroundSize = '100% 100%';
            const f = filters[flip ^= 1];
            f.setAttribute('width', W); f.setAttribute('height', H);
            f.innerHTML = html;
            setMask(glass, cover); setMask(shape, cover);
            if (shadow) setMask(shade, inv);
            else shade.style.maskImage = shade.style.webkitMaskImage = '';
            const bd = `url(#${f.id})` + (m.kind === 'web' ? ` blur(${m.recipe.blur}px) ${FILTER_TAIL}` : '');
            glass.style.backdropFilter = bd; glass.style.webkitBackdropFilter = bd;
            glass.dataset.kind = shade.dataset.kind = m.kind;
            if (m.kind === 'web') glass.style.setProperty('--ilg-web-tint', m.recipe.tint);
            lastKey = key;
        }
        Object.assign(glass.style, { display: '', left: `${L}px`, top: `${T}px`, width: `${W}px`, height: `${H}px` });
        Object.assign(shade.style, { display: shadow ? '' : 'none', left: `${L - SHADE}px`, top: `${T - SHADE}px`, width: `${W + 2 * SHADE}px`, height: `${H + 2 * SHADE}px` });
        Object.assign(shape.style, { left: `${SHADE}px`, top: `${SHADE}px`, width: `${W}px`, height: `${H}px` });
    }
    return { paint, hide, remove };
}
