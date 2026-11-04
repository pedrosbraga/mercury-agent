/**
 * Local speech-to-text with whisper.cpp — no network, no API key.
 *
 * Layout (installed once under ~/.mercury/whisper):
 *   bin/whisper-cli
 *   models/ggml-*.bin            (e.g. ggml-large-v3-turbo-q5_0.bin)
 *
 * Runs on the CPU (`-ng`): Metal needs the system shader compiler, which is
 * not reachable from every process (sandboxed or background), and a failed
 * Metal init aborts the whole binary. The CPU path is slower but always works.
 */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/** Prefer the best model that is installed. */
const MODEL_PREFERENCE = ['ggml-large-v3-turbo-q5_0.bin', 'ggml-large-v3-turbo.bin', 'ggml-medium-q5_0.bin', 'ggml-small.bin', 'ggml-base.bin'];

export interface LocalWhisper {
  cli: string;
  model: string;
}

export function whisperHome(): string {
  return process.env.MERCURY_WHISPER_HOME || join(homedir(), '.mercury', 'whisper');
}

/** The installed whisper.cpp binary + model, or null when not set up. */
export function findLocalWhisper(home = whisperHome()): LocalWhisper | null {
  const cli = join(home, 'bin', 'whisper-cli');
  const dir = join(home, 'models');
  if (!existsSync(cli) || !existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.bin'));
  const model = MODEL_PREFERENCE.find((m) => files.includes(m)) ?? files[0];
  if (!model) return null;
  const path = join(dir, model);
  // A truncated download loads as a model with missing tensors — reject tiny files.
  if (statSync(path).size < 50 * 1024 * 1024) return null;
  return { cli, model: path };
}

/** Strips whisper's non-speech markers like [MÚSICA] / (aplausos) and collapses whitespace. */
export function cleanTranscript(raw: string): string {
  return raw
    .split('\n')
    .map((l) => l.replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Transcribes any audio/video file. Language: MERCURY_WHISPER_LANG (default
 * `pt`, Pedro's language; `auto` lets whisper detect it).
 */
export async function transcribeLocal(path: string, opts: { ffmpeg?: string; timeoutMs?: number } = {}): Promise<string> {
  const w = findLocalWhisper();
  if (!w) throw new Error('local whisper not installed');
  const ffmpeg = opts.ffmpeg ?? 'ffmpeg';
  const dir = await mkdtemp(join(tmpdir(), 'mercury-whisper-'));
  try {
    const wav = join(dir, 'audio.wav');
    await execFileAsync(ffmpeg, ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', wav], {
      maxBuffer: 4 * 1024 * 1024,
    });
    const lang = process.env.MERCURY_WHISPER_LANG || 'pt';
    const threads = String(Math.max(2, Math.min(8, (await import('node:os')).cpus().length - 2)));
    const { stdout } = await execFileAsync(w.cli, ['-m', w.model, '-l', lang, '-nt', '-ng', '-t', threads, '-f', wav], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: opts.timeoutMs ?? 5 * 60_000,
    });
    return cleanTranscript(stdout);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'local whisper transcription failed');
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
