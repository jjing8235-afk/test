import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url);
const source = fs.readFileSync(new URL('index.js', root),'utf8').replace(/\r\n/g,'\n');
const cap = source.slice(source.indexOf('const ua = navigator.userAgent;'),source.indexOf('// 每类表面的模糊来源'));
const passed=[];
const android='Mozilla/5.0 (Linux; Android 17; Fixture Build/TEST; wv) AppleWebKit/537.36 Version/4.0 Chrome/155.0.8059.43 Mobile Safari/537.36';
function env(o={}) {
 const S={enabled:true,refract:true,androidWebViewRefract:false,refractMes:true,engine:'physical',tone:'dark',...o.settings};
 const sandbox={S,navigator:{userAgent:o.ua||android,platform:o.platform||'Linux armv8l',maxTouchPoints:o.touch??5},window:o.chrome?{chrome:{}}:{},CSS:{supports:(_p,value)=>{if(o.throws)throw Error('unsupported');return value.startsWith('url')?o.url!==false:o.blur!==false}}};
 return {S,sandbox,...vm.runInNewContext(cap+';({canRefract,compatibilityHint,canFull,androidWebViewEligible})',sandbox)};
}
const cases=[
 ['User WebView remains fallback by default',{},false,true],
 ['User WebView enables only after opt-in',{settings:{androidWebViewRefract:true}},true,true],
 ['String value is not treated as opt-in',{settings:{androidWebViewRefract:'true'}},false,true],
 ['Missing standard blur blocks opt-in',{blur:false,settings:{androidWebViewRefract:true}},false,false],
 ['Missing SVG URL syntax blocks opt-in',{url:false,settings:{androidWebViewRefract:true}},false,false],
 ['CSS exceptions fail closed',{throws:true,settings:{androidWebViewRefract:true}},false,false],
 ['iPhone remains fallback',{ua:'iPhone AppleWebKit/605.1.15',chrome:true,settings:{androidWebViewRefract:true}},false,false],
 ['iPad desktop identity remains fallback',{ua:'Macintosh AppleWebKit',platform:'MacIntel',chrome:true,settings:{androidWebViewRefract:true}},false,false],
 ['Firefox remains fallback',{ua:'Android wv Firefox/130.0',chrome:true,settings:{androidWebViewRefract:true}},false,false],
 ['Ordinary Android browser is not opted in',{ua:'Android Chrome/155.0.0.0',settings:{androidWebViewRefract:true}},false,false],
 ['Desktop with chrome keeps original path',{ua:'Windows NT Chrome/155.0',platform:'Win32',touch:0,chrome:true},true,false],
 ['Desktop without chrome is not force enabled',{ua:'Windows NT Chrome/155.0',platform:'Win32',touch:0,settings:{androidWebViewRefract:true}},false,false],
 ['Original chrome path is not disabled by compatibility-off',{chrome:true},true,true],
];
for(const[name,input,allowed,eligible]of cases){const e=env(input);assert.equal(e.canRefract(),allowed,name);assert.equal(e.androidWebViewEligible,eligible,name);passed.push(name)}
const defaults=vm.runInNewContext('('+source.match(/const DEFAULTS = (\{[\s\S]*?\n\});/)[1]+')',{PRESETS:{depth:['',{}],natural:['',{}]}});
assert.equal(defaults.androidWebViewRefract,false);
for(const saved of [{},{androidWebViewRefract:true},{androidWebViewRefract:false}]){const merged=Object.assign({},defaults,{...saved,unknown:'preserve',cssBackup:'backup'});assert.equal(merged.androidWebViewRefract,saved.androidWebViewRefract??false);assert.equal(merged.unknown,'preserve');assert.equal(merged.cssBackup,'backup')}
passed.push('Default and saved opt-in preserve unrelated settings and backups');
const reset=source.match(/const reset = \(\) => \{([\s\S]*?)\n    \};/)[1];
const settings={androidWebViewRefract:true,unknown:'preserve',v:9,cssBackup:'backup'};
vm.runInNewContext(reset,{S:settings,DEFAULTS:defaults,clearAll(){},applyRoot(){},sync(){},ctx:{saveSettingsDebounced(){}}});
assert.equal(settings.androidWebViewRefract,false);assert.equal(settings.cssBackup,'backup');assert.equal(settings.unknown,'preserve');
passed.push('Reset returns compatibility to off while preserving unknown values and backups');
const refract=source.match(/function refractAllowed\(it\) \{([\s\S]*?)\n\}/)[1];
for(const[changes,kind,visible,noBlur,allowed]of [[{},'bar',true,false,true],[{enabled:false},'bar',true,false,false],[{refract:false},'bar',true,false,false],[{},'bar',true,true,false],[{refractMes:false},'mes',true,false,false],[{},'mes',false,false,false],[{},'mes',true,false,true]]){
 const e=env({settings:{androidWebViewRefract:true,...changes}});
 assert.equal(vm.runInNewContext('(function(it){'+refract+'})(it)',{S:e.S,canRefract:e.canRefract,it:{kind,visible},document:{body:{classList:{contains:()=>noBlur}}}}),allowed);
}
passed.push('Enabled, no-blur, message preference and message visibility still gate refraction');
const status=source.match(/function statusText\(\) \{([\s\S]*?)\n\}/)[1];
for(const opt of [false,true]){const e=env({settings:{androidWebViewRefract:opt}});const text=vm.runInNewContext(cap+'\n(function(){'+status+'})()', {...e.sandbox,lightBg:false,document:{body:{classList:{contains:n=>n==='bubblechat'}}}});assert(text.includes(opt?'已请求折射':'未启用兼容折射'));assert(!text.includes('完整折射已开启'))}
passed.push('Status distinguishes requested compatibility from claimed rendering success');
const toggle=source.match(/TOGGLES\.forEach\(\(\[k\]\) => document.getElementById\(`ilg-opt-\$\{k\}`\).addEventListener\('change', e => \{([\s\S]*?)\n    \}\)\);/)[1];
for(const eligible of [false,true]){const S={androidWebViewRefract:false,enabled:true};const calls={clear:0,apply:0,sync:0,save:0};const e={target:{checked:true}};vm.runInNewContext('(function(){'+toggle+'})()',{S,k:'androidWebViewRefract',e,androidWebViewEligible:eligible,clearAll(){calls.clear++},applyRoot(){calls.apply++},sync(){calls.sync++},ctx:{saveSettingsDebounced(){calls.save++}}});assert.equal(S.androidWebViewRefract,eligible);assert.equal(calls.clear,eligible?1:0);assert.equal(calls.save,eligible?1:0)}
passed.push('Unsupported synthetic toggle is rejected; supported toggle clears and saves exactly once');
const result={kind:'source-isolated',passed:passed.length,tests:passed,limitations:['Synthetic capability matrix is not installed-device rendering evidence']};
console.log(JSON.stringify(result,null,2));
