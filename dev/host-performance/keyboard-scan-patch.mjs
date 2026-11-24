import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const supportedHash = 'bf641135033099f3b98efdc22bc6f3b4995500400fd52f9dd630bf2906a1ec7c';

export function patchKeyboardScan(source) {
    source = source.replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(source).digest('hex'), supportedHash, 'Unsupported SillyTavern keyboard.js');
    function replace(before, after) {
        assert.equal(source.split(before).length, 2, 'Unexpected keyboard.js source');
        source = source.replace(before, () => after);
    }
    replace("export const INTERACTABLE_CONTROL_CLASS = 'interactable';", `const defaultSelectorCount = interactableSelectors.length;
const defaultSelectorList = interactableSelectors.join(', ');
const keyboardLayoutBridge = Symbol.for('nvwa.liquidGlass.chatPerformance');

export const INTERACTABLE_CONTROL_CLASS = 'interactable';`);
    replace('    // Check if this control matches any of the selectors', `    // Registration order is retained: built-in selectors were always checked first.
    if (globalThis[keyboardLayoutBridge]?.cardLayout === true && control instanceof Element) {
        if (control.matches(defaultSelectorList)) return true;
        for (let i = defaultSelectorCount; i < interactableSelectors.length; i++) {
            if (control.matches(interactableSelectors[i])) return true;
        }
        return false;
    }
    // Check if this control matches any of the selectors`);
    replace('    // Query each selector individually and combine all to a big array to return', `    if (globalThis[keyboardLayoutBridge]?.cardLayout === true && element instanceof Element
        && interactableSelectors.length === defaultSelectorCount && element.closest('#chat > .mes')) {
        if (!element.firstElementChild) return [];
        const controls = [...element.querySelectorAll(defaultSelectorList)];
        // Disabled controls remember tabindex, so visiting a duplicate is observable.
        // Custom elements may also observe the order of attribute changes.
        if (controls.every(control => !control.closest('.disabled, .not_focusable')
            && !control.localName.includes('-') && !control.hasAttribute('is'))) return controls;
    }
    // Query each selector individually and combine all to a big array to return`);
    return source + `
globalThis[Symbol.for('nvwa.liquidGlass.keyboard')] = 2;
`;
}
