// Small, local-only wallpaper samples; never persist image bytes, URLs or pixel statistics.
export function analyzeWallpaper(data, width, height, naturalWidth = width, naturalHeight = height) {
    const values = new Float32Array(width * height), sorted = [];
    let sum = 0, count = 0;
    for (let i = 0; i < values.length; i++) {
        const j = i * 4;
        if (data[j + 3] < 128) { values[i] = -1; continue; }
        const value = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255;
        values[i] = value; sorted.push(value); sum += value; count++;
    }
    if (!count) return null;
    sorted.sort((a, b) => a - b);
    return { values, width, height, naturalWidth, naturalHeight, luminance: sum / count, bright: sorted[Math.floor((count - 1) * 0.85)] };
}

export function wallpaperHighlightGain(sample) {
    if (!sample) return 0.78;
    const energy = Math.max(sample.luminance, sample.bright * 0.85);
    return Math.max(0.45, 1 - Math.max(0, Math.min(1, (energy - 0.22) / 0.68)) * 0.55);
}

export function wallpaperLuminanceAt(sample, x, y, viewportWidth, viewportHeight, fitting = 'cover', placement = {}) {
    if (!sample || viewportWidth <= 0 || viewportHeight <= 0) return null;
    const iw = sample.naturalWidth, ih = sample.naturalHeight;
    const width = placement.width || viewportWidth, height = placement.height || viewportHeight;
    x -= placement.left || 0; y -= placement.top || 0;
    function offset(position = '50%', free) {
        if (position === 'left' || position === 'top') return 0;
        if (position === 'right' || position === 'bottom') return free;
        if (position === 'center') return free / 2;
        const simple = /^(-?[\d.]+)(%|px)?$/.exec(position);
        if (simple) return simple[2] === '%' ? free * Number(simple[1]) / 100 : Number(simple[1]);
        const calc = /^calc\(\s*(-?[\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)$/.exec(position);
        if (calc) return free * Number(calc[1]) / 100 + (calc[2] === '-' ? -1 : 1) * Number(calc[3]);
        return free / 2;
    }
    let sx, sy;
    if (fitting === '100% 100%' || fitting === 'stretch') {
        sx = x / width; sy = y / height;
    } else {
        const scale = fitting === 'auto' || fitting === 'center' ? 1 : fitting === 'contain'
            ? Math.min(width / iw, height / ih) : Math.max(width / iw, height / ih);
        const w = iw * scale, h = ih * scale;
        sx = (x - offset(placement.positionX, width - w)) / w; sy = (y - offset(placement.positionY, height - h)) / h;
    }
    if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return null;
    const col = Math.min(sample.width - 1, Math.floor(sx * sample.width));
    const row = Math.min(sample.height - 1, Math.floor(sy * sample.height));
    const value = sample.values[row * sample.width + col];
    return value < 0 ? null : value;
}

export function createWallpaperSampler(view = window) {
    const cache = new Map();
    return url => {
        if (!url) return Promise.resolve(null);
        if (cache.has(url)) return cache.get(url);
        const pending = new Promise(resolve => {
            const image = new view.Image();
            let complete = false;
            const timer = view.setTimeout(() => finish(null), 5000);
            function finish(value) {
                if (complete) return;
                complete = true; view.clearTimeout(timer); image.onload = image.onerror = null;
                resolve(value);
            }
            image.onload = () => {
                try {
                    const canvas = view.document.createElement('canvas'); canvas.width = canvas.height = 48;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(image, 0, 0, 48, 48);
                    finish(analyzeWallpaper(ctx.getImageData(0, 0, 48, 48).data, 48, 48, image.naturalWidth, image.naturalHeight));
                } catch { finish(null); }
            };
            image.onerror = () => finish(null);
            // Do not request cross-origin credentials or relax the canvas boundary.
            image.src = url;
        });
        if (cache.size >= 4) cache.delete(cache.keys().next().value);
        cache.set(url, pending);
        pending.then(value => { if (value === null && cache.get(url) === pending) cache.delete(url); });
        return pending;
    };
}
