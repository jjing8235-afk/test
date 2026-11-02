import assert from 'node:assert/strict';
import {normalizeGlassSurfaces,resolveSurfaceGlass} from '../../glass-surfaces.js';
const passed=[];
for(const value of [undefined,null,[],true,42]){const normalized=normalizeGlassSurfaces(value);assert.equal(normalized.mes.mode,'inherit');}
const input={unknown:'keep',mes:{mode:'liquid',preset:'custom',pSpecular:100,pStrength:-1,pSharp:NaN,pIor:'2',profile:'lens',unknown:'keep'}};
const normalized=normalizeGlassSurfaces(input);assert.equal(input.mes.pSpecular,100);assert.equal(normalized.unknown,'keep');assert.equal(normalized.mes.unknown,'keep');assert.equal(normalized.mes.pSpecular,3);assert.equal(normalized.mes.pStrength,0);assert.equal('pSharp' in normalized.mes,false);assert.equal('pIor' in normalized.mes,false);
passed.push('Invalid imports inherit safely, numeric bounds are enforced, original inputs and unknown fields are preserved');
const shared={engine:'legacy',compatibilityMode:'blur',pStrength:1,pShadow:.8,mesBlur:3,unknown:'keep',glassSurfaces:normalized};
const chat=resolveSurfaceGlass(shared,'mes');assert.equal(chat.engine,'physical');assert.equal(chat.compatibilityMode,'auto');assert.equal(chat.pStrength,0);assert.equal(shared.pStrength,1);assert.equal(chat.unknown,'keep');
assert.equal(resolveSurfaceGlass(shared,'bar'),shared);assert.equal(resolveSurfaceGlass(shared,'panel'),shared);
shared.glassSurfaces.mes={mode:'ordinary',surfaceBlur:7};assert.equal(resolveSurfaceGlass(shared,'mes').compatibilityMode,'blur');assert.equal(resolveSurfaceGlass(shared,'mes').surfaceBlur,7);
shared.glassSurfaces.mes={mode:'inherit',pStrength:4};assert.equal(resolveSurfaceGlass(shared,'mes'),shared);shared.pStrength=2;assert.equal(resolveSurfaceGlass(shared,'mes').pStrength,2);
passed.push('Chat overrides never change interface/panel settings; liquid/ordinary/inherit remain independent');
console.log(JSON.stringify({passed},null,2));
