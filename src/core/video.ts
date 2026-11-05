/**
 * Video attachments: a clip the model cannot read directly is turned into
 * what a vision model CAN read — a few frames as images, plus the spoken
 * audio as a transcript when a speech service is configured.
 *
 * Frames are extracted with ffmpeg (an even floor across the whole clip plus
 * detected scene changes); the
 * audio track is transcoded to Ogg and handed to the owner's transcription
 * service. The change is in-place on the message: each `video` attachment is
 * replaced by its frames (`image`), and the transcript is appended to the
 * message text, so the rest of the pipeline (`withAttachments`) needs no
 * knowledge of video at all.
 *
 * Frames are written under the system temp dir and left there — they must
 * outlive this call (withAttachments reads them during the turn), and the OS
 * reclaims the temp dir on its own schedule.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ChannelMessage, ChannelAttachment } from '../types/channel.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

const MAX_FRAMES = 12;
const FRAME_WIDTH = 640;
/** Scene-change sensitivity for ffmpeg's `scene` score (0–1); lower = more cuts. */
const SCENE_THRESHOLD = 0.3;
/** Two frames closer than this (seconds) are the same moment. */
const MIN_FRAME_GAP = 0.5;
const SCENE_SCAN_TIMEOUT_MS = 60_000;
const MAX_AUDIO_SECONDS = 5 * 60;

export interface VideoPrepareOptions {
  ffmpeg?: string;
  ffprobe?: string;
  maxFrames?: number;
  /** Transcribe the extracted audio track; null skips transcription (frames only). */
  transcribe: ((path: string) => Promise<string>) | null;
}

interface VideoAtt extends ChannelAttachment {
  kind: 'video';
  path: string;
}

export function videoAttachmentsOf(msg: ChannelMessage): VideoAtt[] {
  const raw = msg.metadata?.attachments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is VideoAtt => !!a && (a as VideoAtt).kind === 'video' && typeof (a as VideoAtt).path === 'string');
}

function probeDuration(ffprobe: string, file: string): Promise<number | null> {
  return execFileAsync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { maxBuffer: 1024 * 1024 })
    .then(({ stdout }) => {
      const d = Number(stdout.trim());
      return Number.isFinite(d) && d > 0 ? d : null;
    })
    .catch(() => null);
}

/** `count` timestamps spread evenly from the first to the last moment of the clip. */
function evenTimes(duration: number, count: number): number[] {
  const last = Math.max(0, duration - 0.1);
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, i) => (i * last) / (count - 1));
}

/** Picks `n` items spread evenly across a sorted list. */
function spread<T>(items: T[], n: number): T[] {
  if (n <= 0) return [];
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor(((i + 0.5) * items.length) / n)]);
}

/**
 * Decides WHEN to sample a clip. Short clips (up to `maxFrames` seconds) get
 * a floor of one frame per second so nothing between samples is missing;
 * longer clips get the budget split between evenly spaced frames and the
 * scene changes ffmpeg detected, so the whole clip is covered — not just its
 * first seconds. Pure: exported for tests.
 */
export function planFrameTimes(duration: number | null, sceneTimes: number[], maxFrames: number = MAX_FRAMES): number[] {
  if (!duration) return [0];
  const cap = Math.max(1, maxFrames);
  const uniformFloor = duration <= cap ? Math.max(2, Math.ceil(duration)) : Math.ceil(cap / 2);
  const scenes = sceneTimes.filter((t) => t > 0.2 && t < duration - 0.2).sort((a, b) => a - b);
  const base = evenTimes(duration, Math.min(cap, uniformFloor));
  const extras = spread(
    scenes.filter((t) => base.every((b) => Math.abs(b - t) >= MIN_FRAME_GAP)),
    duration <= cap ? cap - base.length : Math.floor(cap / 2),
  );
  let merged: number[];
  if (duration <= cap) {
    merged = [...base, ...extras];
  } else {
    // Long clip: the cuts first, then even spacing in the gaps they leave —
    // the start of the clip is always kept, and any unused budget stays even.
    const grid = evenTimes(duration, cap * 3).filter((g) => g > 0 && extras.every((e) => Math.abs(e - g) >= MIN_FRAME_GAP));
    merged = [0, ...extras, ...spread(grid, cap - extras.length - 1)];
  }
  const out: number[] = [];
  for (const t of merged.sort((a, b) => a - b)) {
    if (!out.length || t - out[out.length - 1] >= MIN_FRAME_GAP / 2) out.push(t);
  }
  return out.slice(0, cap);
}

/** Scene-change timestamps (seconds) via ffmpeg's `scene` score; [] on any failure. */
async function detectSceneChanges(ffmpeg: string, file: string): Promise<number[]> {
  try {
    const { stderr } = await execFileAsync(
      ffmpeg,
      ['-i', file, '-an', '-vf', `scale=320:-2,select='gt(scene,${SCENE_THRESHOLD})',showinfo`, '-f', 'null', '-'],
      { maxBuffer: 16 * 1024 * 1024, timeout: SCENE_SCAN_TIMEOUT_MS },
    );
    return [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
  } catch {
    return [];
  }
}

/**
 * Turns each video attachment into frames + transcript, in place. Nothing to
 * do when there is no video, and a failure never blocks the turn — the video
 * simply stays a path in the transcript, as it does today.
 */
export async function prepareVideoAttachments(msg: ChannelMessage, opts: VideoPrepareOptions): Promise<void> {
  const videos = videoAttachmentsOf(msg);
  if (!videos.length) return;
  const { ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', maxFrames = MAX_FRAMES, transcribe } = opts;

  const dir = join(tmpdir(), `mercury-video-${randomUUID()}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const frames: ChannelAttachment[] = [];
  const transcripts: string[] = [];
  const notes: string[] = [];
  let frameIndex = 0;

  for (const v of videos) {
    if (!existsSync(v.path)) continue;
    const duration = await probeDuration(ffprobe, v.path);

    // Even coverage of the whole clip + scene changes, each frame stamped with its time.
    const sceneTimes = duration && duration > 1 ? await detectSceneChanges(ffmpeg, v.path) : [];
    const times = planFrameTimes(duration, sceneTimes, maxFrames);
    const stamps: string[] = [];
    for (const at of times) {
      const frame = join(dir, `frame-${frameIndex}.jpg`);
      try {
        await execFileAsync(ffmpeg, ['-ss', at.toFixed(2), '-i', v.path, '-frames:v', '1', '-vf', `scale=${FRAME_WIDTH}:-2`, '-q:v', '3', '-y', frame], { maxBuffer: 4 * 1024 * 1024 });
        if (existsSync(frame)) {
          frames.push({ kind: 'image', path: frame, mime: 'image/jpeg', name: `frame-${frameIndex + 1}.jpg` });
          stamps.push(`${at.toFixed(1)}s`);
          frameIndex++;
        }
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err), file: v.path }, 'video frame extraction failed');
      }
    }
    if (stamps.length) {
      const total = duration ? `${duration.toFixed(1)}s` : 'unknown length';
      notes.push(`${stamps.length} frames in order, taken at ${stamps.join(', ')} of a ${total} clip (${sceneTimes.length} scene changes detected)`);
    }

    // Spoken audio → transcript (best-effort: no service, or a failure, skips it).
    if (transcribe) {
      const audio = join(dir, `audio-${randomUUID()}.ogg`);
      try {
        await execFileAsync(ffmpeg, ['-i', v.path, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-t', String(MAX_AUDIO_SECONDS), '-y', audio], { maxBuffer: 4 * 1024 * 1024 });
        const text = (await transcribe(audio)).trim();
        if (text) transcripts.push(text);
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err), file: v.path }, 'video audio transcription failed');
      }
    }
  }

  // Replace the video attachments with their frames; keep any other kinds.
  const rawOthers = msg.metadata?.attachments;
  const others = (Array.isArray(rawOthers) ? rawOthers : []).filter(
    (a): a is ChannelAttachment => (a as ChannelAttachment).kind !== 'video',
  );
  msg.metadata = { ...msg.metadata, attachments: [...others, ...frames] };
  const extra: string[] = [];
  if (notes.length) extra.push(`[Video frames: ${notes.join('; ')}. Only these frames were seen — anything between them was not.]`);
  if (transcripts.length) extra.push(`[Video audio transcript:\n${transcripts.join('\n\n')}]`);
  else if (frames.length) extra.push('[Video audio: not transcribed — speech in the clip was NOT heard.]');
  if (extra.length) {
    msg.content = [msg.content, `\n\n${extra.join('\n')}`].filter(Boolean).join('\n');
    msg.metadata = { ...msg.metadata, videoNote: extra.join('\n') };
  }
}
