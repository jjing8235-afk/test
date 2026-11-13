export function packBallFrame(result, urls) {
    const frame = { ...result.frame };
    for (const field of ['cover', 'inv', 'reflection', 'html']) frame[field] = frame[field].replace(/__ILG_BITMAP_(\d+)__/g, (_, i) => urls[Number(i)]);
    frame.chars = frame.cover.length + frame.inv.length + frame.reflection.length + frame.html.length;
    return frame;
}

// The worker may return raw pixels when its canvas encoder is unavailable.
// Only the final PNG encoding remains on the UI thread; geometry and raster math stay off it.
export function materializeGlassFrame(frame,doc) {
    if(!frame?.rawBall&&!frame?.rawReflection)return frame;
    const document=doc||globalThis.document,canvas=document.createElement('canvas');
    const encode=image=>{
        canvas.width=image.w;canvas.height=image.h;
        const context=canvas.getContext('2d', { willReadFrequently: true });if(!context)throw Error('Canvas encoder unavailable');
        const pixels=context.createImageData(image.w,image.h);pixels.data.set(image.data);context.putImageData(pixels,0,0);
        return canvas.toDataURL('image/png');
    };
    try{return frame.rawReflection?{url:encode(frame.rawReflection)}:packBallFrame(frame.rawBall,frame.rawBall.images.map(encode));}
    finally{canvas.width=canvas.height=0;}
}
