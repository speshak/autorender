

export function roundRect(ctx: any, x: any, y: any, width: any, height: any, radius: any, fill: boolean, stroke: boolean) {
    if (typeof stroke === 'undefined') {
        stroke = true;
    }
    if (typeof radius === 'undefined') {
        radius = 5;
    }
    if (typeof radius === 'number') {
        radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
        const defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
        for (const side in defaultRadius) {
            if (side in radius) {
                radius[side] = radius[side];
            }
        }
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) {
        ctx.fill();
    }
    if (stroke) {
        ctx.stroke();
    }
}

let lastValidBound: any = null;
export function getBoundingRect(data: any) {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;

    for (let { value } of data) {
        if (value) { lastValidBound = value; }
        if (!value) { value = lastValidBound; }
        const [lat, long, hgt, spd, inc] = value;
        if (left > long) { left = long; }
        if (top > lat) { top = lat; }
        if (right < long) { right = long; }
        if (bottom < lat) { bottom = lat; }
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
}
