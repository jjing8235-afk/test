import { createHash } from 'node:crypto';

const supportedHash = '606762e1e36805a12429708defcafac7287a3df78393813bf460c53524a27403';
const nativeDepth = `        const usableMessages = chat.map((x, index) => ({ message: x, index: index })).filter(x => !x.message.is_system);
        const indexOf = usableMessages.findIndex(x => x.index === Number(messageId));
        const depth = messageId >= 0 && indexOf !== -1 ? (usableMessages.length - indexOf - 1) : undefined;`;

export function patchChatRenderer(source) {
    const normalized = source.replaceAll('\r\n', '\n');
    const sha = createHash('sha256').update(normalized).digest('hex');
    if (sha !== supportedHash || normalized.split(nativeDepth).length !== 2) {
        throw new Error(`Unsupported SillyTavern script.js (SHA-256: ${sha})`);
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

const supportedTagsHash = 'db5206a1cff693719fd9734101e8e152be851c9066872d97623b04563f3b7fc6';
const nativeTagsLookup = `        const messagesFilter = buildMessagesFilter(mesIds);
        const messages = $('#chat').children(messagesFilter);`;

export function patchMessageTags(source) {
    const normalized = source.replaceAll('\r\n', '\n');
    const sha = createHash('sha256').update(normalized).digest('hex');
    if (sha !== supportedTagsHash || normalized.split(nativeTagsLookup).length !== 2) {
        throw new Error(`Unsupported SillyTavern tags.js (SHA-256: ${sha})`);
    }
    const replacement = `        const bridge = globalThis[Symbol.for('nvwa.liquidGlass.chatPerformance')];
        const matchedRows = bridge?.filterBulkMessageRows?.(document.getElementById('chat'), mesIds);
        const messages = matchedRows ? $(matchedRows) : $('#chat').children(buildMessagesFilter(mesIds));`;
    return normalized.replace(nativeTagsLookup, replacement) + `
globalThis[Symbol.for('nvwa.liquidGlass.messageTags')] = 2;
`;
}
