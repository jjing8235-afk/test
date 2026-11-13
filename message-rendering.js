// Conservative unicode-range check; no font metric changes are skipped on unknown metadata.
export function fontLoadMayChangeText(faces, texts) {
    const list = Array.from(faces || []);
    if (!list.length) return true;
    const ranges = [];
    for (const face of list) {
        if (typeof face.unicodeRange !== 'string' || !face.unicodeRange.trim()) return true;
        for (const token of face.unicodeRange.split(',')) {
            const match = /^\s*U\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(token);
            if (!match || (match[2] && match[1].includes('?'))) return true;
            const lo = parseInt(match[1].replace(/\?/g, '0'), 16);
            const hi = parseInt(match[2] || match[1].replace(/\?/g, 'f'), 16);
            if (lo > hi || hi > 0x10ffff) return true;
            ranges.push([lo, hi]);
        }
    }
    // Standard list markers and generated quotation marks also affect plain prose.
    const characters = new Set('0123456789.()•◦▪“”‘’«»');
    for (const text of texts) for (const character of text || '') characters.add(character);
    for (const character of characters) {
        const point = character.codePointAt(0);
        if (ranges.some(([lo, hi]) => point >= lo && point <= hi)) return true;
    }
    return false;
}

// Keep safe prose under stable browser-managed containment. Entering/leaving the
// viewport must not toggle layout containment or force message remeasurement.
const MARK = 'ilg-render-away', SIZE = '--ilg-message-height';
const TAGS = new Set('P BR Q EM I B STRONG S DEL U A UL OL LI BLOCKQUOTE H1 H2 H3 H4 H5 H6 HR CODE PRE SPAN'.split(' '));
const OWN_CLASSES = new Set(['ilg-prose', 'ilg-indentable']);
export function createMessageRendering(chat, { onReset = () => {} } = {}) {
    const doc = chat.ownerDocument, root = doc.documentElement, win = doc.defaultView;
    const supported = !!win.CSS?.supports?.('content-visibility', 'auto') && !!win.CSS?.supports?.('contain-intrinsic-block-size', 'auto 1px');
    const states = new Map(), widthResets = new Set();
    let widthFrame = 0;
    function cancelWidthReset(el) {
        widthResets.delete(el);
        if (!widthResets.size && widthFrame) { win.cancelAnimationFrame(widthFrame); widthFrame = 0; }
    }
    function deferWidthReset(el) {
        widthResets.add(el);
        if (widthFrame) return;
        widthFrame = win.requestAnimationFrame(() => {
            widthFrame = 0;
            const pending = [...widthResets]; widthResets.clear();
            for (const element of pending) { const state = states.get(element); if (state) reset(element, state); }
        });
    }
    let environment = '';
    const excluded = el => el.matches('.last_mes, .smallSysMes, .ilg-content-overlay, .ilg-card-renderer, [is_system="true"]');
    function plain(el) {
        const text = el.querySelector('.mes_text');
        if (!text || text.style.length || el.querySelector('iframe, video, audio, canvas, object, embed, script, style, [popover], .edit_textarea, details[open]')) return false;
        for (const node of text.querySelectorAll('*')) {
            if (!TAGS.has(node.tagName) || node.hasAttribute('style') || node.hasAttribute('id') || node.hasAttribute('role')
                || [...node.classList].some(c => !OWN_CLASSES.has(c)) || [...node.attributes].some(a => /^on/i.test(a.name))) return false;
        }
        return true;
    }
    function clear(el, state) {
        if (!state.managed) return;
        state.managed = false; el.classList.remove(MARK); el.style.removeProperty(SIZE);
    }
    function apply(el, state) {
        if (state.height === null || excluded(el) || !el.isConnected) { clear(el, state); return; }
        if (state.plain === null) state.plain = plain(el);
        if (!state.plain) { clear(el, state); return; }
        if (!state.managed) {
            el.style.setProperty(SIZE, state.height + 'px'); el.classList.add(MARK); state.managed = true;
        }
    }
    function reset(el, state) {
        cancelWidthReset(el);
        clear(el, state); state.height = null; state.plain = null;
        if (el.isConnected) onReset(el);
    }
    function invalidateAll() { for (const [el, state] of states) reset(el, state); }
    function environmentKey() {
        const vars = ['--mainFontSize', '--mainFontFamily', '--fontScale', '--ilg-prose-leading-user', '--ilg-prose-inset'];
        return [root.dataset.ilgReadingStyle, ...['ilg-avline', 'ilg-indent', 'ilg-justify', 'ilg-font', 'ilg-prose-inset-on'].map(c => root.classList.contains(c)),
            ...vars.map(k => root.style.getPropertyValue(k)), chat.style.getPropertyValue('--ilg-chat-font-size'),
            doc.body.style.fontFamily, doc.body.style.fontSize, doc.body.style.lineHeight, doc.body.style.letterSpacing, doc.body.style.wordSpacing, doc.body.classList.contains('documentstyle'), doc.body.classList.contains('waifuMode')].join('|');
    }
    const changed = () => { const key = environmentKey(); if (key !== environment) { environment = key; invalidateAll(); } };
    const observer = new win.MutationObserver(changed);
    // A menu can load an unrelated CJK font subset. Only a subset containing
    // message characters can invalidate measured message heights. Missing or
    // malformed range metadata always takes the conservative invalidation path.
    const fontsChanged = event => {
        if (fontLoadMayChangeText(event?.fontfaces, [...states.keys()].map(el => el.textContent))) invalidateAll();
    };
    function listen(on) {
        if (on) {
            environment = environmentKey();
            observer.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-ilg-reading-style'] });
            observer.observe(chat, { attributes: true, attributeFilter: ['class', 'style'] });
            observer.observe(doc.body, { attributes: true, attributeFilter: ['class', 'style'] });
            doc.fonts?.addEventListener('loadingdone', fontsChanged);
        } else { observer.disconnect(); doc.fonts?.removeEventListener('loadingdone', fontsChanged); }
    }
    return {
        track(el) {
            if (!supported || states.has(el)) return;
            if (!states.size) listen(true);
            states.set(el, { near: null, height: null, width: null, plain: null, managed: false });
        },
        resize(el, contentHeight, contentWidth) {
            const state = states.get(el); if (!state) return;
            if (state.managed && state.width !== null && Number.isFinite(contentWidth) && Math.abs(contentWidth - state.width) > .25) {
                // Releasing size containment inside ResizeObserver can trigger a
                // resize feedback warning in WebKit. Batch width resets next frame.
                state.width = contentWidth; deferWidthReset(el); return;
            }
            if (widthResets.has(el)) return;
            if (Number.isFinite(contentWidth)) state.width = contentWidth;
            if (excluded(el)) {
                clear(el, state);
                if (Number.isFinite(contentHeight) && contentHeight > 0) state.height = contentHeight;
                return;
            }
            // A near message has real content geometry; distant skipped boxes may
            // report only the intrinsic placeholder. Never cache that as a new size.
            if ((!state.managed || state.near === true) && Number.isFinite(contentHeight) && contentHeight > 0) {
                if (state.managed && Math.abs(contentHeight - state.height) > .25) el.style.setProperty(SIZE, contentHeight + 'px');
                state.height = contentHeight;
            }
            apply(el, state);
        },
        visibility(el, near) { const state = states.get(el); if (state) { state.near = near; apply(el, state); } },
        invalidate(el, remeasure = false) {
            const state = states.get(el); if (!state) return;
            state.plain = null;
            if (state.managed || remeasure) reset(el, state);
        },
        release(el) { const state = states.get(el); if (!state) return; cancelWidthReset(el); clear(el, state); states.delete(el); if (!states.size) listen(false); },
        invalidateAll,
        // Distant is our visibility estimate, not a count of browser-skipped paint.
        status: () => ({ supported, tracked: states.size, managed: [...states.values()].filter(s => s.managed).length, distant: [...states.values()].filter(s => s.managed && s.near === false).length }),
    };
}
