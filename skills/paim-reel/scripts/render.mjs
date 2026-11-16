#!/usr/bin/env node
// render.mjs <project> [--from s] [--to s] [--preview]: frame-accurate render of a project to renders/<slug>.mp4.
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { buildProject, BuildError, exitWithError, isMain } from './build.mjs';
import { openPage } from '../lib/serve.mjs';

const CRF = 18;
const PREVIEW_CRF = 26;
const MUSIC_DB = -30;

// Runs ffmpeg to completion. Resolves with nothing, rejects with the tail of its log.
function ffmpegProcess(args) {
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let log = '';
  child.stderr.on('data', (chunk) => { log = (log + chunk).slice(-4000); });
  child.stdin.on('error', () => {}); // a dead ffmpeg is reported through `done`
  const done = new Promise((ok, fail) => {
    child.on('error', (err) => fail(new Error(err.code === 'ENOENT'
      ? 'ffmpeg was not found: install it and make sure it is on PATH'
      : `ffmpeg could not start: ${err.message}`)));
    child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg failed (exit ${code}):\n${log.trim()}`))));
  });
  done.catch(() => {});
  return { child, done };
}

// Audio inputs and the filter graph for the final render, or null for a silent video.
function audioPlan(projectDir, buildDir, resolved, videoInputs) {
  const voice = join(projectDir, 'voice', 'voice.wav');
  if (resolved.estimated || !existsSync(voice)) return null;
  const total = resolved.duration;
  const inputs = ['-i', voice];
  let graph = `[${videoInputs}:a]aresample=48000,apad=whole_dur=${total}[voice]`;
  if (resolved.music) {
    inputs.push('-stream_loop', '-1', '-i', join(buildDir, resolved.music)); // build.mjs copied it there
    const fade = Math.max(total - resolved.voiceEnd, 0.01);
    graph += `;[${videoInputs + 1}:a]aresample=48000,atrim=duration=${total},`
      + `volume=${MUSIC_DB}dB,afade=t=out:st=${resolved.voiceEnd}:d=${fade}[music]`
      + ';[voice][music]amix=inputs=2:duration=first:normalize=0[a]';
  } else {
    graph += ';[voice]anull[a]';
  }
  return { inputs, graph };
}

export async function renderProject(projectDir, opts = {}) {
  projectDir = resolve(projectDir);
  const fps = 30;
  const { resolved, buildDir } = await buildProject(projectDir);
  const total = Math.round(resolved.duration * fps);
  const partial = opts.from !== undefined || opts.to !== undefined;
  const first = Math.round((opts.from ?? 0) * fps);
  const last = Math.min(Math.round((opts.to ?? resolved.duration) * fps), total);
  if (!(first >= 0) || !(last > first)) {
    throw new BuildError(`--from/--to must select a span inside 0 to ${resolved.duration} s, got ${opts.from ?? 0} to ${opts.to ?? resolved.duration}`);
  }

  const outDir = join(projectDir, 'renders');
  mkdirSync(outDir, { recursive: true });
  const base = partial ? `${resolved.slug}-part` : resolved.estimated ? `${resolved.slug}-draft` : resolved.slug;
  const file = join(outDir, `${base}.mp4`);
  const tmp = join(outDir, `${base}.partial.mp4`);

  const audio = partial ? null : audioPlan(projectDir, buildDir, resolved, 1);
  const args = ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0'];
  if (audio) args.push(...audio.inputs, '-filter_complex', audio.graph, '-map', '0:v', '-map', '[a]');
  // JPEG frames are full-range BT.601 YUV: go through RGB to limited-range BT.709 (plain yuv420p, not
  // yuvj420p; swscale does not convert the matrix YUV to YUV) and tag it, so players show the brand colours.
  args.push('-vf', 'format=gbrp,scale=out_range=limited:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-crf', String(CRF), '-r', String(fps),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
  if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  args.push('-t', String((last - first) / fps), '-movflags', '+faststart', tmp);

  // ffmpeg starts only once the page is open, so a failed page load leaves nothing to clean up.
  const { page, close } = await openPage(projectDir);
  const { child, done } = ffmpegProcess(args);
  let ffmpegError = null; // set when ffmpeg dies early, so the frame loop stops at once
  done.catch((err) => { ffmpegError = err; });
  try {
    for (let i = first; i < last; i++) {
      if (ffmpegError) throw ffmpegError;
      await opts.onFrame?.(i); // progress hook; a throw here aborts the render like a failed seek
      await page.evaluate((t) => window.__paim.seek(t), i / fps);
      const jpeg = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!child.stdin.write(jpeg)) {
        await Promise.race([new Promise((ok) => child.stdin.once('drain', ok)), done]);
      }
    }
    child.stdin.end();
    await done;
  } catch (err) {
    // Stop ffmpeg for good and wait for it to exit before touching its output file.
    child.kill('SIGKILL');
    await done.catch(() => {});
    rmSync(tmp, { force: true });
    throw err;
  } finally {
    await close();
  }
  renameSync(tmp, file);

  const result = { file, frames: last - first };
  if (opts.preview) {
    const previewFile = join(outDir, `${base}-preview.mp4`);
    const previewTmp = join(outDir, `${base}-preview.partial.mp4`);
    const preview = ffmpegProcess([
      '-i', file, '-vf', 'scale=720:1280', '-c:v', 'libx264', '-crf', String(PREVIEW_CRF),
      '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', previewTmp,
    ]);
    try {
      await preview.done;
    } catch (err) {
      rmSync(previewTmp, { force: true });
      throw err;
    }
    renameSync(previewTmp, previewFile);
    result.previewFile = previewFile;
  }
  return result;
}

function parseArgs(argv) {
  const opts = {};
  let project = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preview') opts.preview = true;
    else if (a === '--from' || a === '--to') {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) throw new BuildError(`${a} needs a number of seconds`);
      opts[a.slice(2)] = v;
    } else if (a.startsWith('--') || project !== null) {
      throw new BuildError(`unexpected argument ${a}`);
    } else project = a;
  }
  if (project === null) throw new BuildError('usage: render.mjs <project> [--from s] [--to s] [--preview]');
  return { project, opts };
}

if (isMain(import.meta.url)) {
  try {
    const { project, opts } = parseArgs(process.argv.slice(2));
    renderProject(project, opts)
      .then((r) => {
        console.log(`${r.frames} frames -> ${r.file}`);
        if (r.previewFile) console.log(`preview -> ${r.previewFile}`);
      })
      .catch(exitWithError);
  } catch (err) {
    exitWithError(err);
  }
}
