import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffprobe from 'ffprobe-client';
import ffmpeg from 'fluent-ffmpeg';
import goproTelemetry from 'gopro-telemetry';
import * as fs from 'fs';
import moment from 'moment-timezone';
import * as path from 'path';
import * as util from 'util';

import * as overlay from './overlay-renderer';
import * as tracklogHelpers from './tracklog-helpers';

// setup env
process.env.FFPROBE_PATH = ffprobeInstaller.path;
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const overlayFPS = 2;



async function handleVideo(file: string, fullTrack: any) {
    const rawName = path.basename(file);
    const [raw, ffData]: any = await tracklogHelpers.extractGPMF(file);
    if (!raw) { return; }
    const vid = ffData.streams.filter((s: any) => s.codec_type === 'video')[0];
    console.log('File: ' + rawName);
    console.log('Size: ' + Math.round(ffData.format.size / 1024 / 1024) + 'MiB');
    console.log('Created: ' + ffData.format.tags.creation_time);
    console.log('Length: ' + Math.trunc(ffData.format.duration / 60) + 'min ' +
        Math.trunc(ffData.format.duration % 60) + 's');
    console.log('Res: ' + vid.width + 'x' + vid.height + ' @ ' + vid.r_frame_rate);
    console.log('---------------------');
    console.log('Render targets:');
    const frames = Math.trunc(ffData.format.duration * 60);
    console.log('Total Frames: ' + frames);
    console.log('Res: ' + vid.width + 'x' + vid.height + ' @ 60');
    console.log('---------------------');

    const data = await goproTelemetry({ rawData: raw });
    const key = Object.keys(data).filter((x) => data[x].streams && data[x].streams.GPS5)[0];
    const zeroMark = moment(data[key].streams.GPS5.samples.slice(0, 1)[0].date);
    const renderList: any[] = [];

    // SAMPLE FETCH LOOP
    for (let i = 0; i < frames; i++) {
        if (i % Math.round(60 / overlayFPS) !== 0) { continue; }
        const timeMS = (1000 / 60 * i);
        const timeTotal = moment(zeroMark).add(timeMS, 'milliseconds');
        const sample = tracklogHelpers.getSamplefromTime(timeTotal, data[key].streams.GPS5.samples);
        if (!sample) { continue; }
        if (i % Math.trunc(frames / 100) === 0) {
            console.log(rawName + ': [' + Math.round(i / frames * 100) + '%] TrgTime: ' + timeTotal.toISOString());
        }
        renderList.push(sample);
    }

    console.log('Collected target frames: ' + renderList.length);
    console.log('Beginning frame rendering...');

    // uhh
    if (!fs.existsSync(__dirname + '/out/' + rawName)) {
        fs.mkdirSync(__dirname + '/out/' + rawName);
    }

    // RENDER LOOP
    for (let i = 0; i < renderList.length; i++) {
        const trackInfo = renderList[i];
        await overlay.renderOverlayFrame(i, trackInfo, vid, rawName, fullTrack);
        if ((i / renderList.length * 100) % 10 === 0) {
            console.log(rawName + ': Frame render [' + Math.round(i / renderList.length * 100) + '%]');
        }
    }

    console.log('Rendered overlay frames for file: ' + rawName);
}


async function asyncForEach(array: any, callback: any) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

async function renderOverlayedPart(inDir: string, outDir: string, file: string) {
    return new Promise((resolve, reject) => {
        // for testing add .addOption('-t 5') which will return a 5s video instead of whole duration
        const render = ffmpeg(inDir + file)
            .addInput(outDir + file + '/%04d.png')
            .inputFPS(overlayFPS)
            .complexFilter([
                {
                    filter: 'overlay',
                    input: '[0:v][1:v]',
                },
            ] as any)
            .addOption('-c:a copy')
            .on('end', resolve)
            .on('error', reject)
            .on('progress', (progress: { timemark: moment.MomentInput; }) => {
                const tm = moment(progress.timemark, 'HH:mm:ss.SS').valueOf();
                if (Math.round(tm / 100) % 10 === 0) {
                    console.log(file + '] Processing: ' + progress.timemark);
                }
            })
            .output(outDir + 'rendered_' + file);
        render.run();
    });
}

async function concatVideos(inDir: string, outDir: string, files: string[], date: moment.Moment) {
    if (files.length < 1) { return; }
    return new Promise((resolve, reject) => {
        const render = ffmpeg(inDir + files[0]);
        files.shift();
        files.forEach((f) => render.addInput(inDir + f));
        render.addOption('-safe 0')
            .on('end', resolve)
            .on('error', reject)
            .on('progress', (progress) => {
                const tm = moment(progress.timemark, 'HH:mm:ss.SS').valueOf();
                if (Math.round(tm / 100) % 10 === 0) {
                    console.log('Concat processing: ' + progress.timemark);
                }
            });

        render.mergeToFile(outDir + date.format('YYYYMMDD_HHmmss') + '.mp4');
    });
}

async function load() {
    const startTime = moment();
    console.log('START: ' + startTime.toISOString());

    const inDir = __dirname + '/in/';
    const outDir = __dirname + '/out/';
    const renderOutDir = __dirname + '/final/';
    const readdir = util.promisify(fs.readdir) as any;
    console.log('inDir: ' + inDir);

    await readdir(inDir, async (err: any, files: any[]) => {
        console.log('All files: ' + files.join(','));
        let fileArr = files.filter((x) => x.toLowerCase().includes('.mp4'));
        console.log('Files for one track: ' + fileArr.join(','));

        // collect track metadata over all files
        const [cTrack, startDate] = await Promise.all([
            await tracklogHelpers.getCompleteTrack(inDir, fileArr),
            await tracklogHelpers.getStartDate(inDir, fileArr)
        ]);

        const tl = overlay.getTrackLen(cTrack);
        console.log('Track length: ' + tl.toFixed(3) + 'km');
        console.log('Track start: ' + startDate.toISOString());
        console.log('----------------------------');

        const videoHandlers: [Promise<void>] = [Promise.resolve()];
        await asyncForEach(fileArr, async (file: string) => {
            videoHandlers.push(handleVideo(inDir + file, cTrack));
        });

        // render overlay images in parallel
        await Promise.all(videoHandlers);

        console.log('----------------------------');
        console.log('Overlay frames done');
        console.log('Proceeding with overlaying over raws');

        await asyncForEach(fileArr, async (file: string) => {
            console.log('Starting: ' + file);
            await renderOverlayedPart(inDir, outDir, file);
            console.log('Done: ' + file);
            console.log('----------------------------');
        });

        // build out files from above, TODO: return out files above instead of this "logic"
        fileArr = fileArr.map((x) => {
            x = 'rendered_' + x;
            return x;
        });

        // render final file by concatinating all rendered parts of track
        if (fileArr.length > 1) {
            await concatVideos(outDir, renderOutDir, fileArr, startDate);
        } else {
            fs.copyFileSync(outDir + fileArr[0], renderOutDir + startDate.format('YYYYMMDD_HHmmss') + '.mp4');
        }

        console.log('END: ' + moment().toISOString());
        const duration = moment.utc(moment().diff(moment(startTime, 'HH:mm:ss'))).format('HH:mm:ss');
        console.log('Duration: ' + duration);
    });

}

load();
