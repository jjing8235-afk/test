// Chat optics can override shared interface settings without changing the old defaults.
export const SURFACE_RANGES = {
    pMagnify:[1,6],pStrength:[0,5],pThickness:[4,150],pBezel:[4,100],pIor:[1,3],pAberration:[0,40],
    pSaturate:[0,3],pBrightness:[.6,1.6],pContrast:[.6,1.6],pSpecular:[0,3],pSharp:[.5,16],pEdgeShade:[0,1],
    pFresnel:[0,1.5],pCaustic:[0,2],pShadow:[0,2],pSheen:[0,1.5],pLight:[0,359],surfaceBlur:[0,40],saturate:[0,3],brightness:[.6,1.5],highlight:[0,1],
};
export function normalizeGlassSurfaces(value) {
    const result = value && typeof value === 'object' && !Array.isArray(value) ? {...value} : {};
    for (const key of ['mes']) {
        const input = result[key];
        const group = input && typeof input === 'object' && !Array.isArray(input) ? {...input} : {};
        if (!['inherit','liquid','ordinary'].includes(group.mode)) group.mode = 'inherit';
        for (const [field,[min,max]] of Object.entries(SURFACE_RANGES)) {
            if (!(field in group)) continue;
            if (typeof group[field] !== 'number' || !Number.isFinite(group[field])) delete group[field];
            else group[field] = Math.min(max,Math.max(min,group[field]));
        }
        if (!['lens','squircle','circle','soft'].includes(group.profile)) delete group.profile;
        result[key] = group;
    }
    return result;
}
export function resolveSurfaceGlass(settings, kind) {
    const group = settings.glassSurfaces?.[kind];
    if (kind !== 'mes' || !group || !['liquid','ordinary'].includes(group.mode)) return settings;
    const overrides = {};
    for (const key of Object.keys(SURFACE_RANGES)) if (typeof group[key] === 'number' && Number.isFinite(group[key])) overrides[key] = group[key];
    if (['lens','squircle','circle','soft'].includes(group.profile)) overrides.profile = group.profile;
    return {...settings,...overrides,engine:group.mode==='liquid'?'physical':settings.engine,compatibilityMode:group.mode==='ordinary'?'blur':'auto'};
}
