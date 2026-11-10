// Track local host state without body-wide relational selectors. No settings or chat writes.
export function createHostInteractionState({ holder, form, home, qrToggle }) {
    let enabled = false;
    function syncHome() {
        home.classList.toggle('ilg-home-covered', !!holder.querySelector(':scope > .drawer > .drawer-content.openDrawer'));
    }
    function syncQr() {
        qrToggle.classList.toggle('ilg-qr-empty', !form.querySelector('#qr--bar .qr--button'));
    }
    // Only these two local trees can change the represented states. Chat streaming,
    // message SVG updates and unrelated panels never trigger a query here.
    const homeObserver = new MutationObserver(mutations => {
        if (mutations.some(m => m.target === holder || m.target.parentElement === holder
            || m.target.parentElement?.parentElement === holder)) syncHome();
    });
    const qrObserver = new MutationObserver(syncQr);
    function setEnabled(value) {
        const next = value === true;
        if (next === enabled) return;
        enabled = next;
        if (enabled) {
            syncHome(); syncQr();
            homeObserver.observe(holder, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
            qrObserver.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id'] });
        } else {
            homeObserver.disconnect(); qrObserver.disconnect();
            home.classList.remove('ilg-home-covered'); qrToggle.classList.remove('ilg-qr-empty');
        }
    }
    return { setEnabled, destroy: () => setEnabled(false) };
}
