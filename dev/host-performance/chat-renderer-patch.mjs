function hasLineInFunction(source, signature, code) {
    const start = source.indexOf(`\n${signature}`);
    const end = source.indexOf('\n}', start + 1);
    return start >= 0 && end > start && source.split(code).length === 2
        && source.slice(start, end).includes(code);
}

const nativeDepth = `        const usableMessages = chat.map((x, index) => ({ message: x, index: index })).filter(x => !x.message.is_system);
        const indexOf = usableMessages.findIndex(x => x.index === Number(messageId));
        const depth = messageId >= 0 && indexOf !== -1 ? (usableMessages.length - indexOf - 1) : undefined;`;

export function patchChatRenderer(source) {
    const normalized = source.replaceAll('\r\n', '\n');
    if (!hasLineInFunction(normalized, 'export function messageFormatting(', nativeDepth)) {
        throw new Error('Message depth calculation has a different source shape');
    }

    const replacement = `        let depth;
        if (nvwaPerformanceChatCore.getMessageDepth) {
            depth = nvwaPerformanceChatCore.getMessageDepth(chat, messageId);
        } else {
${nativeDepth.replaceAll(/^        /gm, '            ').replace('const depth =', 'depth =')}
        }`;
    const bridge = `\nconst nvwaPerformanceChatCore = { version: 2, getMessageDepth: undefined, filterBulkMessageRows: undefined, cardLayout: false };\nglobalThis[Symbol.for('nvwa.liquidGlass.chatPerformance')] = nvwaPerformanceChatCore;\n`;
    return normalized.replace(nativeDepth, replacement) + bridge;
}

const nativeTagsLookup = `        const messagesFilter = buildMessagesFilter(mesIds);
        const messages = $('#chat').children(messagesFilter);`;

export function patchMessageTags(source) {
    const normalized = source.replaceAll('\r\n', '\n');
    const nativeSelector = 'return mesIdsArray.map(id => `.mes[mesid="${id}"]`).join(\',\');';
    if (!hasLineInFunction(normalized, 'export function applyCharacterTagsToMessageDivs(', nativeTagsLookup)
        || !hasLineInFunction(normalized, 'function buildMessagesFilter(mesIds)', nativeSelector)) {
        throw new Error('Message tag lookup has a different source shape');
    }
    const replacement = `        const bridge = globalThis[Symbol.for('nvwa.liquidGlass.chatPerformance')];
        const matchedRows = bridge?.filterBulkMessageRows?.(document.getElementById('chat'), mesIds);
        const messages = matchedRows ? $(matchedRows) : $('#chat').children(buildMessagesFilter(mesIds));`;
    return normalized.replace(nativeTagsLookup, replacement) + `
globalThis[Symbol.for('nvwa.liquidGlass.messageTags')] = 2;
`;
}
