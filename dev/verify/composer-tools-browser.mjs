import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const tt=process.env.NVWA_TT_POPUP_SOURCE;assert(tt,'NVWA_TT_POPUP_SOURCE must point to the pinned real TT popup-menu.js');
const popup=await fs.readFile(tt,'utf8');assert(popup.includes("trigger.addEventListener('click'"));
const html=`<!doctype html><html class="ilg ilg-icons ilg-qrfold"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/icons.css"><style>#third-party i::before{content:"native-bookmark";font-family:serif;color:rgb(190,60,105)}.widget{background:rgb(35,52,63);padding:17px}.custom-brand{background:rgb(32,52,68);border:1px solid rgb(170,95,130);color:rgb(235,217,240)}</style></head><body><div id="form_sheld"><form id="send_form"><div id="nonQRFormItems"><div id="leftSendForm"><div id="options_button" tabindex="0" role="button">+</div><div id="extensionsMenuButton" tabindex="0">tools</div><div id="ilg-qr-toggle" tabindex="0">quick</div></div><textarea id="send_textarea"></textarea></div><div id="qr--bar" style="display:none"><button type="button" class="qr--button">Quick action</button></div></form></div><div id="options" style="display:none"><div class="options-content"><a id="option_continue"><i></i>Continue</a></div></div><div id="extensionsMenu" style="display:none"><div class="extension_container"><div id="third-party" class="list-group-item custom-brand"><i class="fa-book-bookmark"></i><span>伯宝书</span></div></div></div><button id="outside">Outside</button><script src="/jquery.js"></script><script type="module">import {initPopupMenu} from '/tt-popup.js';import {createComposerTools} from '/composer-tools.js';window.__calls=0;const qr=document.getElementById('qr--bar');document.getElementById('ilg-qr-toggle').addEventListener('click',()=>{const open=!document.documentElement.classList.contains('ilg-qr-open');document.documentElement.classList.toggle('ilg-qr-open',open);qr.style.display=open?'flex':'none';});for(const [button,panel] of [['options_button','options'],['extensionsMenuButton','extensionsMenu']])initPopupMenu(document.getElementById(button),document.getElementById(panel),{onOpen(){},closesOnClick:target=>panel==='options'?!!target.closest('a[id]'):!target.closest('#sd_gen,#roll_dice')});document.querySelector('#third-party').addEventListener('click',()=>__calls++);window.__ui=createComposerTools({root:document.documentElement});__ui.setEnabled(true);window.__ready=true;</script></body></html>`;
const server=http.createServer(async(req,res)=>{try{if(['/style.css','/icons.css','/settings-panel.css','/composer-icons.css'].includes(req.url)){res.setHeader('content-type','text/css');res.end(await fs.readFile(path.join(root,req.url.slice(1))));return;}if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);return;}const data=req.url==='/tt-popup.js'?popup:req.url==='/composer-tools.js'?await fs.readFile(path.join(root,'composer-tools.js'),'utf8'):req.url==='/jquery.js'?await fs.readFile(process.env.NVWA_JQUERY_SOURCE||'D:/SillyTavern/public/lib/jquery-3.5.1.min.js','utf8'):null;if(data!==null){res.setHeader('content-type','text/javascript');res.end(data);return;}res.writeHead(404);res.end();}catch(e){res.writeHead(500);res.end(String(e));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{const module=process.env.NVWA_PLAYWRIGHT_MODULE||'playwright',tools=await import(path.isAbsolute(module)?pathToFileURL(module).href:module),engine=process.env.NVWA_BROWSER||'chromium';browser=await tools[engine].launch({headless:true,...(engine==='chromium'&&process.env.NVWA_EDGE_EXECUTABLE?{executablePath:process.env.NVWA_EDGE_EXECUTABLE}:{})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>__ready);const checks=[];const check=(name,passed)=>{assert(passed,name);checks.push(name);};await page.locator('#options_button').click();await page.waitForTimeout(50);
check('TT native addEventListener menu opens from unified launcher',await page.locator('#options').isVisible());
check('Three panes share one visible plus launcher',await page.locator('#options .ilg-composer-tabs button').count()===3&&!await page.locator('#ilg-qr-toggle').isVisible()&&!await page.locator('#extensionsMenuButton').isVisible());
await page.locator('#options .options-content').evaluate(el=>el.insertAdjacentHTML('afterbegin','<a id="option_toggle_fullscreen"><i></i><span>Fullscreen</span></a><a id="option_toggle_AN"><i></i><span>Author note</span></a><a id="option_toggle_CFG"><i></i><span>CFG scale</span></a><a id="option_toggle_logprobs"><i></i><span>Token probabilities</span></a>'));
check('Inserted utilities form a three-column grid below tabs; Continue keeps a full row',await page.locator('#options .options-content').evaluate(el=>{
    const tabs=el.querySelector('.ilg-composer-tabs').getBoundingClientRect();
    const tiles=[...el.querySelectorAll(':scope > a:not(#option_continue)')];
    const rects=tiles.map(tile=>tile.getBoundingClientRect());
    const primary=el.querySelector('#option_continue');
    return tiles.every(tile=>getComputedStyle(tile).flexDirection==='column') && rects.every(r=>r.top>=tabs.bottom) && rects[0].top===rects[2].top && rects[3].top>rects[0].top && primary.offsetWidth>2*rects[0].width && getComputedStyle(primary).flexDirection==='row';
}));
check('Fullscreen has an outline mask rather than a solid square',await page.locator('#option_toggle_fullscreen > i').evaluate(el=>getComputedStyle(el,'::before').maskImage.includes('data:image/svg+xml')));
const tabTravel=await page.evaluate(()=>{
    const track=()=>[...document.querySelectorAll('.ilg-composer-tabs')].find(el=>el.offsetWidth>0);
    const center=(bar,el)=>{const rail=bar.getBoundingClientRect(),r=el.getBoundingClientRect();return (r.left+r.width/2-rail.left)/rail.width;};
    const select=(bar,pane)=>bar.querySelector(`[data-pane="${pane}"]`).click();
    const state=(time)=>{
        const bar=track(),lens=bar?.querySelector('.ilg-composer-tab-lens');
        const animation=lens?.getAnimations()[0];
        if(!animation)return null;
        animation.pause();animation.currentTime=time;
        return {bar,lens,animation,x:center(bar,lens),selected:center(bar,bar.querySelector('[aria-selected="true"]'))};
    };
    const chat=track(),chatLens=chat.querySelector('.ilg-composer-tab-lens');
    if(!chatLens)return null;
    const start=center(chat,chatLens);
    select(chat,'quick');
    const quick0=state(0),quick90=state(90);
    if(!quick0||!quick90)return null;
    select(quick90.bar,'tools');
    const tools0=state(0),tools150=state(150);
    if(!tools0||!tools150)return null;
    tools150.animation.finish();
    const settled=center(tools150.bar,tools150.lens);
    select(tools150.bar,'chat');
    track().querySelector('.ilg-composer-tab-lens').getAnimations()[0]?.finish();
    return {start,quick0:quick0.x,quick90:quick90.x,quickTarget:quick90.selected,tools0:tools0.x,tools150:tools150.x,toolsTarget:tools150.selected,settled,lenses:track().querySelectorAll('.ilg-composer-tab-lens[aria-hidden="true"]').length};
});
check('One visual lens glides between panes and retains its current position on rapid reversal',tabTravel&&tabTravel.lenses===1&&Math.abs(tabTravel.start-tabTravel.quick0)<.02&&tabTravel.quick90>tabTravel.quick0+.1&&tabTravel.quick90<tabTravel.quickTarget&&Math.abs(tabTravel.quick90-tabTravel.tools0)<.02&&tabTravel.tools150<tabTravel.tools0&&Math.abs(tabTravel.settled-tabTravel.toolsTarget)<.01);
await page.emulateMedia({reducedMotion:'reduce'});
await page.locator('.ilg-composer-tabs:visible [data-pane="quick"]').click();
check('Reduced motion places the lens on the selected tab without animating',await page.locator('#qr--bar .ilg-composer-tabs').evaluate(bar=>{
    const lens=bar.querySelector('.ilg-composer-tab-lens'),selected=bar.querySelector('[aria-selected="true"]');
    return lens.getAnimations().length===0&&Math.abs(lens.getBoundingClientRect().left-selected.getBoundingClientRect().left)<1;
}));
await page.locator('.ilg-composer-tabs:visible [data-pane="chat"]').evaluate(el=>el.click());
await page.emulateMedia({reducedMotion:'no-preference'});
await page.locator('.ilg-composer-tabs:visible [data-pane="tools"]').click();
check('TT native panel capture keeps tab switching working',await page.locator('#extensionsMenu').isVisible());
check('TT inline flex is adapted to the owned row grid',await page.locator('#extensionsMenu').evaluate(e=>getComputedStyle(e).display==='grid'));
check('Plugin custom colours and border survive layout',await page.locator('#third-party').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(32, 52, 68)'&&getComputedStyle(e).borderTopColor==='rgb(170, 95, 130)'&&getComputedStyle(e).color==='rgb(235, 217, 240)'));
check('Third-party bookmark pictogram remains native',await page.locator('#third-party i').evaluate(e=>getComputedStyle(e,'::before').content==='"native-bookmark"'&&getComputedStyle(e,'::before').maskImage==='none'));
await page.evaluate(()=>{const host=document.getElementById('extensionsMenu');const group=document.createElement('div');group.className='extension_container';group.innerHTML='<div id="text-only" class="list-group-item">只有文字的第三方入口</div><div id="long-entry" class="list-group-item">这是名称非常长的第三方扩展启动入口需要自然换行</div>';host.append(group);const custom=document.createElement('div');custom.className='extension_container widget';custom.innerHTML='<div class="list-group-item" id="widget"><input value="KEEP_WIDGET"></div>';host.append(custom);window.__pluginNode=document.getElementById('text-only');});
await page.waitForFunction(()=>document.getElementById('text-only').classList.contains('ilg-tool-row'));
check('Late text-only entry gets layout without invented icons',await page.locator('#text-only').evaluate(e=>e===__pluginNode&&!e.querySelector('i,svg,img')));
check('Long labels own a full row',await page.locator('#long-entry').evaluate(e=>e.classList.contains('ilg-tool-wide')));
check('Custom plugin widgets retain their container',await page.locator('#widget').evaluate(e=>!e.classList.contains('ilg-tool-row')&&!e.parentElement.classList.contains('ilg-tool-group')&&e.querySelector('input').value==='KEEP_WIDGET'));
await page.evaluate(()=>{const dialog=document.createElement('section');dialog.id='plugin-dialog';dialog.setAttribute('role','dialog');dialog.innerHTML='<input id="plugin-dialog-input">';dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){window.__dialogEsc=(window.__dialogEsc||0)+1;e.preventDefault();e.stopPropagation();}});document.body.append(dialog);dialog.querySelector('input').focus();});await page.keyboard.press('Escape');check('Plugin dialog owns Escape while a menu remains open',await page.evaluate(()=>__dialogEsc===1&&document.getElementById('extensionsMenu').style.display!=='none'));await page.evaluate(()=>document.getElementById('plugin-dialog').remove());
await page.locator('.ilg-composer-tabs:visible [data-pane="quick"]').click();
check('Quick replies open through the same launcher',await page.locator('#qr--bar').isVisible()&&!await page.locator('#extensionsMenu').isVisible());
await page.setViewportSize({width:320,height:480});
const quickFixture=await page.addStyleTag({content:'body{margin:0}#form_sheld{position:fixed;bottom:0;left:8px;width:304px;height:58px}#send_form{position:relative}#qr--bar{justify-content:center}.qr--button-label{white-space:nowrap}#chat{height:200px;overflow:auto}'});
await page.evaluate(()=>{
    const chat=document.createElement('div');chat.id='chat';chat.innerHTML='<div style="height:900px"></div>';document.body.prepend(chat);chat.scrollTop=150;
    const quick=document.getElementById('qr--bar');
    for(let group=0;group<3;group++){
        const set=document.createElement('div');set.className='qr--buttons ilg-overflow-fixture';quick.append(set);
        for(let item=0;item<10;item++){
            const button=document.createElement('button');button.type='button';button.className='qr--button';
            const label=document.createElement('span');label.className='qr--button-label';label.textContent='Shortcut '+group+'-'+item;button.append(label);set.append(button);
            if(item===9&&group===2){button.id='shortcut-last';label.textContent+=' | LongUnbrokenShortcutLabel'.repeat(5);button.addEventListener('click',()=>window.__lastShortcut=true);}
        }
    }
    const author=document.createElement('button');author.type='button';author.id='authored-shortcut';author.className='ilg-overflow-fixture qr--button';author.dataset.nvwaStyle='author';author.style.cssText='background:rgb(30,50,70);color:rgb(240,220,195)';author.textContent='Authored shortcut';quick.append(author);
    quick.scrollTop=0;
});
const quick=page.locator('#qr--bar');
const tabs=page.locator('#qr--bar > .ilg-composer-tabs');
check('Tall quick pane starts at its tabs without horizontal clipping',await quick.evaluate(el=>{
    const pane=el.getBoundingClientRect(),tabs=el.querySelector('.ilg-composer-tabs').getBoundingClientRect();
    return el.scrollHeight>el.clientHeight&&el.scrollWidth<=el.clientWidth&&tabs.top>=pane.top&&pane.top>=0;
}));
const tabsTop=(await tabs.boundingBox()).y;
await quick.hover({position:{x:70,y:120}});
await page.mouse.wheel(0,2400);
await page.waitForFunction(()=>{const el=document.getElementById('qr--bar');return el.scrollHeight-el.clientHeight-el.scrollTop<=2;});
check('Quick tabs stay pinned when scrolling to the last group',Math.abs((await tabs.boundingBox()).y-tabsTop)<2);
const lastShortcut=page.locator('#shortcut-last');
await lastShortcut.focus();await page.keyboard.press('Enter');
check('Last shortcut is fully visible and keeps its keyboard action',await lastShortcut.evaluate(el=>{
    const row=el.getBoundingClientRect(),pane=el.closest('#qr--bar').getBoundingClientRect(),tab=el.closest('#qr--bar').querySelector('.ilg-composer-tabs').getBoundingClientRect();
    return window.__lastShortcut&&row.top>=tab.bottom&&row.bottom<=pane.bottom&&el.scrollWidth<=el.clientWidth;
}));
await page.mouse.wheel(0,400);
await page.waitForTimeout(80);
check('Quick scroll stays off the chat and leaves authored shortcuts styled',await page.evaluate(()=>document.getElementById('chat').scrollTop===150&&getComputedStyle(document.getElementById('authored-shortcut')).backgroundColor==='rgb(30, 50, 70)'));
await page.evaluate(()=>{document.querySelectorAll('.ilg-overflow-fixture,#chat').forEach(el=>el.remove());});
await quickFixture.evaluate(el=>el.remove());
await page.setViewportSize({width:1280,height:720});
await page.locator('#options_button').click();check('Plus closes the remembered quick pane',await page.locator('#qr--bar').isHidden());
await page.locator('#options_button').click();check('Plus reopens the remembered quick pane',await page.locator('#qr--bar').isVisible());
await page.locator('.ilg-composer-tabs:visible [data-pane="chat"]').focus();await page.keyboard.press('Home');check('Home returns to chat pane',await page.locator('#options').isVisible());
await page.locator('.ilg-composer-tabs:visible [data-pane="tools"]').click();await page.locator('#third-party').click();check('Original third-party action fires once',await page.evaluate(()=>__calls===1));
await page.evaluate(()=>{__ui.setEnabled(false);window.jQuery=undefined;window.$=undefined;__ui.setEnabled(true);});await page.locator('#options_button').click();check('TT native launcher works without jQuery',await page.locator('#extensionsMenu').isVisible());
await page.keyboard.press('Escape');check('Escape returns focus to plus',await page.locator('#options_button').evaluate(e=>document.activeElement===e));
await page.evaluate(()=>__ui.setEnabled(false));check('Disable removes owned tabs and plugin layout classes',await page.locator('.ilg-composer-tabs,.ilg-tool-row,.ilg-tool-group,.ilg-composer-open').count()===0);check('No browser errors',errors.length===0);
const result={passed:true,engine,checks,ttSource:tt,scope:'Actual pinned TT menu controller in an isolated browser, not a physical TT device'};if(process.env.NVWA_RESULT_FILE)await fs.writeFile(process.env.NVWA_RESULT_FILE,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}finally{await browser?.close();await new Promise(r=>server.close(r));}
