import assert from 'node:assert/strict';

export function patchKeyboardScan(source) {
    source = source.replaceAll('\r\n', '\n');
    const nativeMatchers = [
        'const interactableSelectors = [',
        `export function isKeyboardInteractable(control) {
    // Check if this control matches any of the selectors
    return interactableSelectors.some(selector => control.matches(selector));
}`,
        `function getAllInteractables(element) {
    // Query each selector individually and combine all to a big array to return
    return [].concat(...interactableSelectors.map(selector => Array.from(element.querySelectorAll(\`\${selector}\`))));
}`,
        "export const NOT_FOCUSABLE_CONTROL_CLASS = 'not_focusable';",
        "export const DISABLED_CONTROL_CLASS = 'disabled';",
    ];
    assert(nativeMatchers.every(anchor => source.split(anchor).length === 2), 'Keyboard selector scan has a different source shape');
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
