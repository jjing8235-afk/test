const actionRow = 'html.ilg.ilg-bubble-double.ilg-avline body.bubblechat:not(.waifuMode, .no-blur, .expandMessageActions) #chat > .mes.ilg-glass:not(.smallSysMes, [is_system="true"], [data-nvwa-style="author"], .ilg-card-renderer:not(.ilg-inline-card), .ilg-content-overlay)';

export function createMessageActions(chat) {
    const doc = chat.ownerDocument;
    const view = doc.defaultView;
    let opened = null;
    function close() {
        if (!opened) return;
        const { hint, menu } = opened;
        opened = null;
        menu.classList.remove('ilg-action-open');
        hint.setAttribute('aria-expanded', 'false');
    }
    chat.addEventListener('click', event => {
        const hint = event.target.closest?.('.extraMesButtonsHint');
        if (!hint || event.defaultPrevented) return;
        const bar = hint.parentElement;
        const row = bar?.closest('.mes');
        if (row?.parentElement !== chat || !row.matches(actionRow) || !bar.matches('.mes_block > .ch_name > .mes_buttons')
            || !view.CSS.supports('display', 'contents') || view.matchMedia('(forced-colors: active)').matches) return;
        const menu = bar.querySelector(':scope > .extraMesButtons');
        if (!menu || menu.classList.contains('visible')) return;
        // The host delegates its two sequential fades at document level.
        event.stopPropagation();
        const wasOpen = opened?.menu === menu;
        close();
        if (wasOpen) return;
        opened = { hint, menu, row };
        menu.classList.add('ilg-action-menu', 'ilg-action-open');
        hint.setAttribute('aria-expanded', 'true');
    });
    doc.addEventListener('click', event => {
        if (opened && !opened.hint.contains(event.target) && !opened.menu.contains(event.target)) close();
    }, true);
    doc.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !opened) return;
        const { hint, menu } = opened;
        const returnFocus = menu.contains(doc.activeElement);
        const ownsKey = returnFocus || doc.activeElement === hint;
        close();
        if (ownsKey) { event.preventDefault(); event.stopPropagation(); }
        if (returnFocus) hint.focus({ preventScroll: true });
    }, true);
    function sync() {
        if (opened && (!opened.row.isConnected || !opened.row.matches(actionRow))) close();
    }
    return { close, sync };
}
