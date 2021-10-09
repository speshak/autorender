import goproTelemetry from 'gopro-telemetry';
import moment from 'moment-timezone';
import ffprobe from 'ffprobe-client';
import ffmpeg from 'fluent-ffmpeg';

export const extractGPMF = async (videoFile: any) => {
    const ffData = await ffprobe(videoFile);
    for (let i = 0; i < ffData.streams.length; i++) {
        if (ffData.streams[i].codec_tag_string === 'gpmd') {
            return [await extractGPMFAt(videoFile, i), ffData];
        }
    }
    console.error('[Invalid file] No data stream (gpmd) found in: ' + videoFile);
    return [null, null];
};

const extractGPMFAt = async (videoFile: any, stream: number) => {
    let rawData = Buffer.alloc(0);
    await new Promise((resolve) => {
        ffmpeg(videoFile)
            .outputOption('-y')
            .outputOptions('-codec copy')
            .outputOptions(`-map 0:${stream}`)
            .outputOption('-f rawvideo')
            .pipe()
            .on('data', (chunk) => {
                rawData = Buffer.concat([rawData, chunk]);
            })
            .on('end', async () => {await sleep(100); return resolve({})});
    });
    return rawData;
};

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export function getSamplefromTime(time: moment.Moment, samples: any[]) {
    const searchFor = time.valueOf();
    const closest = samples.reduce((prev, curr) => {
        if (!curr || !curr.date) { return; }
        if (!prev) { return curr; }
        return (Math.abs(moment(curr.date).valueOf() - searchFor)
            < Math.abs(moment(prev.date).valueOf() - searchFor)
            ? curr : prev);
    });
    return closest;
}

export async function getCompleteTrack(inDir: string, files: any[]) {
    const track = await files.reduce(async (prevTrack, f) => {
        const ctrack = await prevTrack;
        const [raw, ffData]: any = await extractGPMF(inDir + f);
        if (!raw) { return ctrack; }
        const data = await goproTelemetry({ rawData: raw });
        const key = Object.keys(data).filter((x) => data[x].streams && data[x].streams.GPS5)[0];
        ctrack.push(...data[key].streams.GPS5.samples);
        return ctrack;
    }, Promise.resolve([]));
    return track;
}

export async function getStartDate(inDir: string, files: any[]) {
    const min = await files.reduce(async (minP, f) => {
        const cmin = await minP;
        const [raw, ffData]: any = await extractGPMF(inDir + f);
        if (!ffData) { return cmin; }
        return moment.min([cmin, moment.utc(ffData.format.tags.creation_time)]);
    }, Promise.resolve(moment.utc()));
    return min;
}

// SRC: https://www.geodatasource.com/developers/javascript
export function distance(lat1: number, lon1: number, lat2: number, lon2: number, unit: string) {
    if ((lat1 === lat2) && (lon1 === lon2)) {
        return 0;
    } else {
        const radlat1 = Math.PI * lat1 / 180;
        const radlat2 = Math.PI * lat2 / 180;
        const theta = lon1 - lon2;
        const radtheta = Math.PI * theta / 180;
        let dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
        if (dist > 1) {
            dist = 1;
        }
        dist = Math.acos(dist);
        dist = dist * 180 / Math.PI;
        dist = dist * 60 * 1.1515;
        if (unit === 'K') { dist = dist * 1.609344; }
        if (unit === 'N') { dist = dist * 0.8684; }
        return dist;
    }
}
