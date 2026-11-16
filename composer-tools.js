// One visible composer launcher, two native menus. Host nodes and actions stay in place.
export function createComposerTools({root}) {
    const doc = root.ownerDocument, bars = new Map();
    let enabled = false, pane = 'chat', routing = false, plus = null, wand = null;
    let saved = [], focusFrame = 0;
    const observer = new MutationObserver(syncExpanded);
    const menu = kind => doc.getElementById(kind === 'chat' ? 'options' : 'extensionsMenu');
    const content = kind => kind === 'chat' ? doc.querySelector('#options .options-content') : menu(kind);
    const visible = kind => {const el=menu(kind);return !!el && el.style.display !== 'none' && !el.hidden;};
    function finishAnimations() {
        const jq = doc.defaultView.jQuery;
        if (typeof jq === 'function') for (const kind of ['chat','tools']) jq(menu(kind)).stop(true,true);
    }
    function nativeClick(kind) {
        const button = kind === 'chat' ? plus : wand;
        if (!button) return;
        routing = true;
        try { doc.defaultView.jQuery(button).triggerHandler('click'); } finally { routing = false; }
    }
    function syncExpanded() {
        if (!enabled || !plus) return;
        const expanded = String(visible('chat') || visible('tools'));
        if (plus.getAttribute('aria-expanded') !== expanded) plus.setAttribute('aria-expanded',expanded);
    }
    function select(kind, {toggle=false, focus=false}={}) {
        if (!enabled) return;
        finishAnimations();
        if (toggle && visible(kind)) {nativeClick(kind);finishAnimations();syncExpanded();return;}
        const other=kind==='chat'?'tools':'chat';
        const switching=visible(other);
        if (switching) {nativeClick(other);finishAnimations();}
        pane=kind;
        // Core chat-menu dismissal relies on focus, including programmatic activation.
        plus.focus({preventScroll:true});
        if (!visible(kind)) nativeClick(kind);
        finishAnimations();
        for (const [el,bar] of bars) updateBar(el,bar);
        syncExpanded();
        if (focus) {
            cancelAnimationFrame(focusFrame);
            focusFrame=requestAnimationFrame(()=>{focusFrame=0;bars.get(content(kind))?.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});});
        }
    }
    function launcherClick(event) {
        if (routing || !enabled) return;
        event.preventDefault();event.stopImmediatePropagation();
        select(pane,{toggle:true});
    }
    function toolsClick(event) {
        if (!enabled || routing) return;
        event.preventDefault();event.stopImmediatePropagation();select('tools',{toggle:true});
    }
    function keydown(event) {
        if (event.key!=='Escape' || !enabled || (!visible('chat')&&!visible('tools'))) return;
        event.preventDefault();event.stopPropagation();finishAnimations();
        for(const kind of ['chat','tools'])if(visible(kind))nativeClick(kind);finishAnimations();
        plus.focus({preventScroll:true});syncExpanded();
    }
    function updateBar(el,bar) {
        const active=el.id==='extensionsMenu'?'tools':'chat';
        for(const button of bar.children){const selected=button.dataset.pane===active;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    }
    function decorate(el) {
        if (!enabled || !el.matches('#options .options-content, #extensionsMenu')) return;
        let bar=bars.get(el);
        if(!bar){
            bar=doc.createElement('div');bar.className='ilg-composer-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','输入工具');
            for(const [kind,label]of[['chat','聊天操作'],['tools','扩展工具']]){
                const button=doc.createElement('button');button.type='button';button.dataset.pane=kind;button.textContent=label;button.setAttribute('role','tab');button.id='ilg-composer-tab-'+(el.id==='extensionsMenu'?'tools':'chat')+'-'+kind;button.setAttribute('aria-controls',kind==='chat'?'options':'extensionsMenu');
                button.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();select(kind,{focus:true});});bar.append(button);
            }
            bar.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const active=el.id==='extensionsMenu'?'tools':'chat';select(event.key==='Home'?'chat':event.key==='End'?'tools':active==='chat'?'tools':'chat',{focus:true});});
            bars.set(el,bar);
        }
        updateBar(el,bar);if(bar.parentElement!==el)el.prepend(bar);
    }
    function release(el) {bars.get(el)?.remove();bars.delete(el);}
    function ownAttribute(el,name,value) {saved.push({el,name,before:el.getAttribute(name),value});el.setAttribute(name,value);}
    function setEnabled(value) {
        if(value===enabled)return;
        if(!value){
            observer.disconnect();cancelAnimationFrame(focusFrame);focusFrame=0;
            plus?.removeEventListener('click',launcherClick,true);wand?.removeEventListener('click',toolsClick,true);doc.removeEventListener('keydown',keydown);
            finishAnimations();for(const kind of ['chat','tools'])if(visible(kind))nativeClick(kind);finishAnimations();
            enabled=false;root.classList.remove('ilg-merged-tools');
            for(const el of [...bars.keys()])release(el);
            for(const item of saved)if(item.el.getAttribute(item.name)===item.value || item.name==='aria-expanded'){if(item.before===null)item.el.removeAttribute(item.name);else item.el.setAttribute(item.name,item.before);}saved=[];plus=null;wand=null;return;
        }
        plus=doc.getElementById('options_button');wand=doc.getElementById('extensionsMenuButton');
        if(!plus||!wand||!menu('chat')||!menu('tools')||typeof doc.defaultView.jQuery?.fn?.triggerHandler!=='function')return;
        enabled=true;root.classList.add('ilg-merged-tools');
        ownAttribute(plus,'title','聊天与扩展工具');ownAttribute(plus,'aria-label','聊天与扩展工具');ownAttribute(plus,'aria-haspopup','true');ownAttribute(plus,'aria-expanded','false');
        ownAttribute(wand,'aria-hidden','true');ownAttribute(wand,'tabindex','-1');
        plus.addEventListener('click',launcherClick,true);wand.addEventListener('click',toolsClick,true);doc.addEventListener('keydown',keydown);
        for(const kind of ['chat','tools']){ownAttribute(menu(kind),'role','tabpanel');ownAttribute(menu(kind),'aria-labelledby','ilg-composer-tab-'+kind+'-'+kind);observer.observe(menu(kind),{attributes:true,attributeFilter:['style','hidden']});const el=content(kind);if(el)decorate(el);}syncExpanded();
    }
    return {setEnabled,decorate,release};
}
