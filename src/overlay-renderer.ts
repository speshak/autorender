import { createCanvas } from 'canvas';
import tzlookup from 'tz-lookup';
import moment from 'moment-timezone';
import * as fs from 'fs';
import * as geometry from './geometry';
import * as tracklogHelpers from './tracklog-helpers';

const globalTZ = 'Europe/Berlin';

function pad(num: number, size: number) {
    let s = num + '';
    while (s.length < size) { s = '0' + s; }
    return s;
}

function drawRoutePosition(x: number, y: number, w: number, h: number, ctx: any, data: any, lat: number, long: number) {
    const boundingRect = geometry.getBoundingRect(data);
    let xx = (long - boundingRect.x) / boundingRect.width * w;
    let yy = (lat - boundingRect.y) / boundingRect.height * h;
    yy *= -1;
    yy += h;

    xx += x;
    yy += y;

    // track crosshair
    ctx.fillRect(xx, y + 0, 1, h);
    ctx.fillRect(x + 0, yy, w, 1);
}

async function renderFullTrack(ctx: any, x: number, y: number, w: number, h: number, fullTrack: any) {
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    // ctx.font = '10px Arial';

    ctx.fillStyle = 'rgba(80,80,80,0.5)';
    geometry.roundRect(ctx, x, y, w, h, 10, true, false);
    ctx.fillStyle = 'white';

    ctx.lineWidth = 1;
    drawRoute(x + 5, y + 5, w - 10, h - 10, ctx, fullTrack);
}

/**
 * Render a single overlay frame.
 */
export async function renderOverlayFrame(frame: number, sample: any, video: any, rawName: string, fullTrack: any[]) {
    const [lat, long, hgt, spd, inc] = sample.value;
    const spdKMH = (spd * 3.6).toFixed(2) + ' km/h';
    let dist = fullTrack ? getTrackLen(fullTrack, sample) : 0;
    dist = dist.toFixed(3) + 'km';

    const date = moment.utc(sample.date).tz(tzlookup(lat, long) || globalTZ).format('YYYY-MM-DD HH:mm:ss');

    const canvas = createCanvas(video.width, video.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;

    // TODO: scale all by res / settings
    ctx.font = '30px Arial';

    // date time
    ctx.fillText(date, 50, 100);
    ctx.strokeText(date, 50, 100);

    // lat long
    ctx.fillText(lat, 50, video.height - 100);
    ctx.strokeText(lat, 50, video.height - 100);
    ctx.fillText(long, 240, video.height - 100);
    ctx.strokeText(long, 240, video.height - 100);

    // spd
    ctx.fillText(spdKMH, 50, video.height - 150);
    ctx.strokeText(spdKMH, 50, video.height - 150);

    // track len
    ctx.fillText(dist, 50, video.height - 50);
    ctx.strokeText(dist, 50, video.height - 50);

    // minimap - has more or less scaling
    const { x, y, w, h } = {
        h: (video.width * 0.15) / 2,
        w: (video.width * 0.15),
        x: video.width - (video.width * 0.15) - 20,
        y: video.height - (video.width * 0.15) + (video.width * 0.15) / 2 - 20,
    };

    if (fullTrack) {
        renderFullTrack(ctx, x, y, w, h, fullTrack);
        drawRoutePosition(x + 5, y + 5, w - 10, h - 10, ctx, fullTrack, lat, long);
    }

    async function renderFrameFile(stream: any, iCanvas: any) {
        return new Promise((resolve) => {
            iCanvas.createPNGStream().pipe(stream);
            stream.on('finish', resolve);
        });
    }

    const out = fs.createWriteStream(__dirname + '/out/' + rawName + '/' + pad(frame, 4) + '.png');
    await renderFrameFile(out, canvas);
}


let lastValidRoute: any = null;
function drawRoute(x: number, y: number, w: number, h: number, ctx: any, data: any) {
    const boundingRect = geometry.getBoundingRect(data);
    for (let { value } of data) {
        if (value) { lastValidRoute = value; }
        if (!value) { value = lastValidRoute; }
        const [lat, long, hgt, spd, inc] = value;
        let xx = (long - boundingRect.x) / boundingRect.width * w;
        let yy = (lat - boundingRect.y) / boundingRect.height * h;
        yy *= -1;
        yy += h;
        xx += x;
        yy += y;
        ctx.fillRect(xx, yy, 1, 1);
    }
}

export function getTrackLen(track: any[], until?: any) {
    // calc dist total
    let lastValid: any = null;
    const trackLength = track.slice(0).reduce((len, pnt, idx, arr) => {
        if (idx < 1) { return 0; }
        if (lastValid && pnt?.value) { lastValid = pnt; }
        if (!pnt?.value) { pnt = lastValid; }
        let prevPnt = arr[idx - 1];
        if (!prevPnt?.value) { prevPnt = lastValid; }
        if (!pnt || !prevPnt) { return len; }
        const [lat1, long1, hgt1, spd1, inc1] = prevPnt.value;
        const [lat2, long2, hgt2, spd2, inc2] = pnt.value;
        const ll = len + tracklogHelpers.distance(lat1, long1, lat2, long2, 'K');
        // early exit
        if (until) {
            const [lat3, long3, hgt3, spd3, inc3] = until.value;
            if (lat1 === lat3 && long1 === long3) {
                arr.splice(1);
            }
        }
        return ll;
    }, track.slice(-1)[0]);
    return trackLength;
}

