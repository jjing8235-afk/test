import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const parse = source.slice(source.indexOf('const parseRgba ='), source.indexOf('// Computed display metadata only:'));
const block = source.match(/function blockBg\(el, cs = getComputedStyle\(el\)\) \{[\s\S]*?\n\}/)[0];
const card = source.slice(source.indexOf('const cardColors ='), source.indexOf('function queueCards('));
function node(tag, { color = 'rgba(0, 0, 0, 0)', image = 'none', pseudo = false, previous = '',
    position = 'static', top = 0, height = 590, text = '', prose = false } = {}) {
    const classes = new Set(previous ? ['ilg-solid'] : []);
    if (prose) classes.add('ilg-type-prose');
    const values = new Map(previous ? [['--ilg-card-solid', previous]] : []);
    const el = {
        tag, color, image, pseudo, position, textContent: text, children: [],
        style: { backgroundColor: color, backgroundImage: image, background: '',
            getPropertyValue: name => values.get(name) || '',
            setProperty: (name, value) => values.set(name, value),
            removeProperty: name => values.delete(name),
        },
        classList: { contains: value => classes.has(value), toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); } },
        matches: selector => selector.split(',').some(part => part.trim() === tag),
        querySelector: selector => el.children.map(child => child.matches(selector) ? child : child.querySelector(selector)).find(Boolean),
        getClientRects: () => [{}], getBoundingClientRect: () => ({ width: 313, height, left: 0, right: 313, top, bottom: top + height }),
    };
    Object.defineProperty(el, 'contentDocument', { get() { throw Error('Card frame internals must remain untouched'); } });
    return el;
}
function computed(el, pseudo) {
    if (pseudo) return { content: el.pseudo && pseudo === '::before' ? '""' : 'none', display: 'block',
        backgroundColor: el.pseudo && pseudo === '::before' ? 'rgba(74, 43, 94, 0.8)' : 'rgba(0, 0, 0, 0)', backgroundImage: 'none' };
    const stored = el.style.getPropertyValue('--ilg-card-solid');
    const backing = el.classList.contains('ilg-solid') && stored;
    return { backgroundColor: backing ? (stored === 'var(--ilg-card-fallback)' ? 'rgb(18, 20, 30)' : stored) : el.color,
        backgroundImage: el.image, position: el.position, display: 'block', visibility: 'visible' };
}
const S = { cardSolid: true };
const message = node('div');
const api = vm.runInNewContext(parse + '\n' + block + '\n' + card + '\n({applyCardMarkers})', {
    S, root: { classList: { contains: () => false } }, getComputedStyle: computed, paint() {}, flickerCapture: null,
    MutationObserver: class { observe() {} disconnect() {} }, chatEl: { querySelectorAll: () => [] },
});
const test = children => api.applyCardMarkers([{ children, closest: () => message }]);
const frame = node('iframe');
const oldFrame = node('iframe', { previous: 'var(--ilg-card-fallback)' });
const image = node('div', { image: 'url("opaque-resource")' });
const oldImage = node('div', { image: 'url("opaque-resource")', previous: 'var(--ilg-card-fallback)' });
const gradient = node('section', { image: 'linear-gradient(rgb(74, 43, 94), rgba(74, 43, 94, 0))' });
const pseudo = node('section', { pseudo: true });
const opaque = node('section', { color: 'rgb(74, 43, 94)' });
const all = [frame, oldFrame, image, oldImage, gradient, pseudo, opaque];
// The removed option must never replace an authored background, even in an old saved configuration.
const colorBefore = all.map(el => ({color:el.style.backgroundColor,image:el.style.backgroundImage}));
for (const savedValue of [true,false,true]) {
    S.cardSolid = savedValue;
    test(all);
    for (const [i,el] of all.entries()) {
        assert.equal(el.classList.contains('ilg-solid'),false);
        assert.equal(el.style.getPropertyValue('--ilg-card-solid'),'');
        assert.equal(el.style.backgroundColor,colorBefore[i].color);
        assert.equal(el.style.backgroundImage,colorBefore[i].image);
    }
    assert(gradient.classList.contains('ilg-card-surface') && pseudo.classList.contains('ilg-card-surface'),'Authored panels retain compatibility markers');
}
// The new compatibility path must distinguish mixed prose/status messages from
// self-rendered panels and out-of-flow content. Reuse the same row to test rollback.
const paragraph = node('p', { text: 'Native message', prose: true });
const status = node('details', { color: 'rgb(36, 57, 77)' });
const bounded = node('div', { position: 'relative', top: 50, height: 60 });
const positionedFrame = node('iframe', { position: 'absolute', top: 52, height: 54 });
bounded.children.push(positionedFrame);
positionedFrame.offsetParent = bounded;
const spilledFrame = node('iframe', { position: 'absolute', top: 49, height: 65 });
spilledFrame.offsetParent = bounded;
const isInline = () => message.classList.contains('ilg-inline-card');
test([paragraph, status]);
assert.equal(isInline(), true, 'Native prose with an in-flow status panel uses the inline shell');
status.position = 'fixed';
test([paragraph, status]);
assert.equal(isInline(), false);
assert.equal(message.classList.contains('ilg-content-overlay'), true);
status.position = 'static';
test([status]);
assert.equal(isInline(), false, 'A self-rendered panel does not opt into the inline shell');
test([paragraph, bounded]);
assert.equal(isInline(), true, 'A message-local wrapper reserves room for its iframe');
test([paragraph, positionedFrame]);
assert.equal(isInline(), false, 'An absolute iframe without an in-flow ancestor is not inline');
bounded.children.push(spilledFrame);
test([paragraph, bounded]);
assert.equal(isInline(), false, 'An overflowing frame keeps the authored renderer path');
test([paragraph]);
assert.equal(isInline(), false);
assert.equal(message.classList.contains('ilg-card-renderer'), false);
const wrap = node('section');
const innerWrap = node('div');
const styledParagraph = node('p', { text: 'Wrapped story with author styling' });
wrap.children.push(innerWrap);
innerWrap.children.push(styledParagraph);
test([wrap, status]);
assert.equal(isInline(), true, 'A status panel can sit beside wrapped prose without typography markers');
assert.equal(styledParagraph.classList.contains('ilg-type-prose'), false);
status.children.push(wrap);
test([status]);
assert.equal(isInline(), false, 'Prose inside the authored panel must not classify it as an inline status');
const clearDetails = node('details');
clearDetails.children.push(wrap, node('button'));
test([clearDetails]);
assert.equal(isInline(), false, 'Text inside transparent details is still panel content');
const decoratedStory = node('p', { text: 'A self-rendered block', image: 'linear-gradient(black, white)' });
test([decoratedStory, status]);
assert.equal(isInline(), false, 'A decorated paragraph does not establish ordinary story content');
const migration=source.match(/if \(Object.hasOwn\(S, 'cardSolid'\)\) \{[^]*?\}/)[0];
const old={cardSolid:true,chatBackground:'transparent',mesTint:.12};let saves=0;
vm.runInNewContext(migration,{S:old,ctx:{saveSettingsDebounced(){saves++}}});
assert.equal(Object.hasOwn(old,'cardSolid'),false);assert.equal(old.chatBackground,'transparent');assert.equal(old.mesTint,.12);assert.equal(saves,1);
vm.runInNewContext(migration,{S:old,ctx:{saveSettingsDebounced(){saves++}}});assert.equal(saves,1);
console.log(JSON.stringify({passed:true,checks:['Authored gradients, pseudo backgrounds and opaque colors remain unchanged','Transparent iframes and image surfaces keep authored transparency','Old generated backing markers are removed','Retired saved option is removed once without changing other appearance settings','Card compatibility markers remain and frame internals are never accessed','Inline status classification preserves standalone cards and out-of-flow protections']},null,2));
