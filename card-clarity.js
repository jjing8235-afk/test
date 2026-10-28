// Automatic runtime-only text clarity for accessible message frames. No card source, navigation or settings writes.
const TEXT_CSS = 'html body, html body *, html body *::before, html body *::after { text-shadow: none !important; }';

export function createCardTextClarity(chat) {
    let enabled = false, observer = null, pending = 0;
    const frames = new Map();
    const schedule = () => {
        if (enabled && !pending) pending = requestAnimationFrame(refresh);
    };
    function detachDocument(entry) {
        entry.observer?.disconnect();
        entry.observer = null;
        entry.style?.remove();
        entry.style = null;
        entry.document = null;
    }
    function dispose(frame, entry) {
        frame.removeEventListener('load', entry.onLoad);
        detachDocument(entry);
        frames.delete(frame);
    }
    function refresh() {
        pending = 0;
        if (!enabled) return;
        const seen = new Set();
        const visit = frame => {
            if (seen.has(frame)) return;
            seen.add(frame);
            let entry = frames.get(frame);
            if (!entry) {
                entry = { document: null, style: null, observer: null, onLoad: null };
                entry.onLoad = () => { detachDocument(entry); schedule(); };
                frame.addEventListener('load', entry.onLoad);
                frames.set(frame, entry);
            }
            // Avoid probing known opaque/cross-origin frames; some WebKit builds report even a caught probe.
            const sandbox = frame.getAttribute('sandbox');
            let accessible = sandbox === null || frame.sandbox.contains('allow-same-origin');
            if (accessible && !frame.hasAttribute('srcdoc')) {
                try {
                    const source = new URL(frame.getAttribute('src') || 'about:blank', frame.ownerDocument.baseURI);
                    accessible = source.href === 'about:blank' || source.origin === (frame.ownerDocument.defaultView?.origin || frame.ownerDocument.location.origin);
                } catch { accessible = false; }
            }
            if (!accessible) { detachDocument(entry); return; }
            let doc;
            try { doc = frame.contentDocument; } catch { /* Origin isolation remains intact. */ }
            if (!doc?.documentElement) { detachDocument(entry); return; }
            if (entry.document !== doc) {
                detachDocument(entry);
                entry.document = doc;
                entry.observer = new MutationObserver(mutations => {
                    if (mutations.some(m => [...m.addedNodes, ...m.removedNodes].some(n =>
                        n.nodeType === 1 && (n === entry.style || n.contains(entry.style) || n.matches('iframe') || n.querySelector('iframe'))
                    ))) schedule();
                });
                entry.observer.observe(doc, { childList: true, subtree: true });
            }
            if (!entry.style?.isConnected) {
                const style = doc.createElement('style');
                style.dataset.ilgCardClarity = '1';
                style.textContent = TEXT_CSS;
                entry.style = style;
                (doc.head || doc.documentElement).append(style);
            }
            doc.querySelectorAll('iframe').forEach(visit);
        };
        chat.querySelectorAll('.mes_text iframe').forEach(visit);
        for (const [frame, entry] of frames) if (!seen.has(frame)) dispose(frame, entry);
    }
    function setEnabled(value) {
        const next = value === true;
        if (next === enabled) return;
        enabled = next;
        if (enabled) {
            observer = new MutationObserver(schedule);
            observer.observe(chat, { childList: true, subtree: true });
            refresh();
        } else {
            observer?.disconnect();
            observer = null;
            if (pending) cancelAnimationFrame(pending);
            pending = 0;
            for (const [frame, entry] of frames) dispose(frame, entry);
        }
    }
    return { setEnabled, destroy: () => setEnabled(false) };
}
