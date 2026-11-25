const bridgeKey = Symbol.for('nvwa.liquidGlass.chatPerformance');
const extensionBridge = { version: 2 };

function getBridge() {
    const bridge = globalThis[bridgeKey];
    return bridge?.version === 2 ? bridge : undefined;
}

export function getHostPerformanceCapabilities() {
    const bridge = getBridge();
    const compatible = globalThis[bridgeKey] == null || !!bridge;
    return {
        depthScan: !!bridge && bridge !== extensionBridge,
        messageTags: compatible && globalThis[Symbol.for('nvwa.liquidGlass.messageTags')] === 2,
        keyboard: compatible && globalThis[Symbol.for('nvwa.liquidGlass.keyboard')] === 2,
    };
}

export function getMessageDepth(chat, messageId) {
    const id = Number(messageId);
    if (!Number.isInteger(id) || id < 0 || id >= chat.length || !(id in chat) || chat[id].is_system) {
        return undefined;
    }

    // Native depth is the number of non-system messages strictly after this floor.
    let depth = 0;
    for (let later = id + 1; later < chat.length; later++) {
        if (later in chat && !chat[later].is_system) {
            depth++;
        }
    }
    return depth;
}

export function filterBulkMessageRows(container, messageIds) {
    if (!Array.isArray(messageIds) || messageIds.length < 32) {
        return undefined;
    }
    const requestedIds = new Set();
    for (const id of messageIds) {
        if (!Number.isSafeInteger(id)) return undefined;
        requestedIds.add(String(id));
    }
    return [...(container?.children ?? [])].filter(row => row.classList.contains('mes')
        && requestedIds.has(row.getAttribute('mesid')));
}

export function syncHostPerformance(depthScan, keyboard) {
    const capabilities = getHostPerformanceCapabilities();
    const useTags = depthScan && capabilities.messageTags;
    const useKeyboard = keyboard && capabilities.keyboard;
    let bridge = getBridge();
    // These two host modules can use the extension's bridge when the depth hook is absent.
    if (!bridge && (useTags || useKeyboard)) bridge = globalThis[bridgeKey] ??= extensionBridge;
    if (!bridge) return;
    bridge.getMessageDepth = depthScan && capabilities.depthScan ? getMessageDepth : undefined;
    bridge.filterBulkMessageRows = useTags ? filterBulkMessageRows : undefined;
    bridge.cardLayout = useKeyboard;
}

export function disableHostPerformance() {
    syncHostPerformance(false, false);
}
