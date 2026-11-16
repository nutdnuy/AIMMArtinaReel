// Shared by render.mjs and export_openfilm.mjs: the voice file and timing.json must belong to the same take.
//
// prep_voice.py replaces voice/voice.wav at once. When transcribe.py or `timing.py align` then fails, the old
// aligned timing.json stays, and without this check a later render would pair the new voice with the old
// captions and exit 0. `timing.py align` records the sha256 of the voice it aligned (`voice_sha256`); a
// timing.json from before that field existed is compared by length instead.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { BuildError } from './build.mjs';

const LENGTH_TOLERANCE = 0.05; // s: how far a voice may differ from timing.duration when there is no hash

// Length in seconds of an audio file, from ffprobe.
export function mediaSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], {
    encoding: 'utf8', timeout: 30_000,
  });
  const seconds = Number(r.stdout?.trim());
  if (r.error || r.status !== 0 || !(seconds > 0)) {
    throw new BuildError(`cannot read the length of ${file} (ffprobe is needed: run doctor.sh)`);
  }
  return seconds;
}

// Throws a BuildError (exit 2) when an aligned timing.json does not belong to voice/voice.wav. A draft
// (estimated timing) and a project without a voice file have nothing to compare.
export function assertVoiceMatchesTiming(projectDir) {
  const voice = join(projectDir, 'voice', 'voice.wav');
  const timing = JSON.parse(readFileSync(join(projectDir, 'timing.json'), 'utf8'));
  if (timing.estimated || !existsSync(voice)) return;
  const other = new BuildError('timing.json belongs to another take: run transcribe.py and timing.py align again');
  if (typeof timing.voice_sha256 === 'string') {
    if (createHash('sha256').update(readFileSync(voice)).digest('hex') !== timing.voice_sha256) throw other;
  } else if (Math.abs(mediaSeconds(voice) - timing.duration) > LENGTH_TOLERANCE) {
    throw other;
  }
}
