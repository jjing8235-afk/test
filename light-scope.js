// Pose math and cadence stay in glass-lighting.js. Only actual glass surfaces
// receive changing inherited variables; message bodies never inherit them.
export function createLightScope(root) {
    const targets = new Map();
    let point = null, active = false;
    function clear(el, state) {
        if (!state.applied) return;
        state.applied = false; state.x = state.y = null;
        el.classList.remove('ilg-pose-surface');
        el.style.removeProperty('--ilg-tilt-x'); el.style.removeProperty('--ilg-tilt-y');
    }
    function apply(el, state) {
        if (!point || !state.visible || !el.isConnected) { clear(el, state); return; }
        if (!state.applied) { el.classList.add('ilg-pose-surface'); state.applied = true; }
        if (state.x !== point.x) { el.style.setProperty('--ilg-tilt-x', point.x); state.x = point.x; }
        if (state.y !== point.y) { el.style.setProperty('--ilg-tilt-y', point.y); state.y = point.y; }
    }
    return {
        update(next) {
            point = next;
            if (active !== !!point) { active = !!point; root.classList.toggle('ilg-tilt-light', active); }
            for (const [el, state] of targets) apply(el, state);
        },
        visibility(el, visible) {
            let state = targets.get(el);
            if (!state) { state = {visible:!!visible, applied:false, x:null, y:null}; targets.set(el, state); }
            else state.visible = !!visible;
            apply(el, state);
        },
        release(el) { const state = targets.get(el); if (state) { clear(el, state); targets.delete(el); } },
        destroy() { this.update(null); targets.clear(); },
        status: () => ({tracked:targets.size, active, applied:[...targets.values()].filter(s => s.applied).length}),
    };
}
