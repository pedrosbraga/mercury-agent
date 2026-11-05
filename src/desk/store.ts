import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

/**
 * The workspace desk: documents that belong to a conversation, made by any
 * desk app (a whiteboard today, others later). The store knows nothing about
 * what an app puts in `data`; it keeps it, versions it and hands it back.
 *
 *   <root>/<scope>/<id>.json        the app's data, exactly as given
 *   <root>/<scope>/<id>.meta.json   id, app, title, times, rev, size
 *
 * `scope` is a chat thread id, or "draft" for a chat that has no thread yet.
 * Writes are whole-file and atomic (temp file, then rename), so a crash never
 * leaves half a drawing. `rev` rises on every write; a caller that passes
 * `baseRev` is refused when someone else wrote in between (the agent and the
 * app can both edit one board without silently overwriting each other).
 */

export interface DeskItemMeta {
  id: string;
  app: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  rev: number;
  bytes: number;
}

export interface DeskItem extends DeskItemMeta {
  data: unknown;
}

export const DRAFT_SCOPE = 'draft';
/** Largest item we keep. A board with several pasted images is a few MB. */
export const MAX_ITEM_BYTES = 40 * 1024 * 1024;

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const APP_RE = /^[a-z0-9][a-z0-9.-]{0,60}$/;

export class DeskError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 413) {
    super(message);
    this.name = 'DeskError';
  }
}

export const isDeskId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

function cleanTitle(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, 120);
  return t || fallback;
}

let lastStamp = 0;
/** Never repeats and never goes backwards, so two items made in one millisecond keep their order. */
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

function newId(at: number): string {
  return `d${at.toString(36)}${randomBytes(3).toString('hex')}`;
}

function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export class DeskStore {
  constructor(private readonly root: string) {}

  private dir(scope: string): string {
    if (!isDeskId(scope)) throw new DeskError('Invalid scope', 400);
    return join(this.root, scope);
  }

  private paths(scope: string, id: string) {
    if (!isDeskId(id)) throw new DeskError('Invalid item id', 400);
    const dir = this.dir(scope);
    return { dir, data: join(dir, `${id}.json`), meta: join(dir, `${id}.meta.json`) };
  }

  private readMeta(path: string): DeskItemMeta | null {
    try {
      const m = JSON.parse(readFileSync(path, 'utf-8')) as DeskItemMeta;
      return m && typeof m.id === 'string' ? m : null;
    } catch {
      return null;
    }
  }

  /** Oldest first, so tabs keep the order things were opened in. */
  list(scope: string): DeskItemMeta[] {
    const dir = this.dir(scope);
    if (!existsSync(dir)) return [];
    const out: DeskItemMeta[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.meta.json')) continue;
      const m = this.readMeta(join(dir, f));
      if (m) out.push(m);
    }
    return out.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  create(scope: string, input: { app: unknown; title?: unknown; data?: unknown }): DeskItemMeta {
    if (typeof input.app !== 'string' || !APP_RE.test(input.app)) throw new DeskError('Invalid app', 400);
    const now = stamp();
    const id = newId(now);
    const p = this.paths(scope, id);
    mkdirSync(p.dir, { recursive: true });
    const text = JSON.stringify(input.data ?? null);
    if (Buffer.byteLength(text) > MAX_ITEM_BYTES) throw new DeskError('Item too large', 413);
    const meta: DeskItemMeta = {
      id, app: input.app, title: cleanTitle(input.title, 'Untitled'),
      createdAt: now, updatedAt: now, rev: 1, bytes: Buffer.byteLength(text),
    };
    writeAtomic(p.data, text);
    writeAtomic(p.meta, JSON.stringify(meta));
    return meta;
  }

  get(scope: string, id: string): DeskItem {
    const p = this.paths(scope, id);
    const meta = existsSync(p.meta) ? this.readMeta(p.meta) : null;
    if (!meta || !existsSync(p.data)) throw new DeskError('Not found', 404);
    let data: unknown = null;
    try { data = JSON.parse(readFileSync(p.data, 'utf-8')); } catch { throw new DeskError('Item is unreadable', 404); }
    return { ...meta, data };
  }

  /** Keep new data and/or a new title. `baseRev` makes it a compare-and-swap. */
  put(scope: string, id: string, input: { data?: unknown; title?: unknown; baseRev?: unknown }): DeskItemMeta {
    const p = this.paths(scope, id);
    const meta = existsSync(p.meta) ? this.readMeta(p.meta) : null;
    if (!meta) throw new DeskError('Not found', 404);
    if (input.baseRev !== undefined && input.baseRev !== meta.rev) throw new DeskError(`Changed elsewhere (rev ${meta.rev})`, 409);
    let bytes = meta.bytes;
    if (input.data !== undefined) {
      const text = JSON.stringify(input.data);
      bytes = Buffer.byteLength(text);
      if (bytes > MAX_ITEM_BYTES) throw new DeskError('Item too large', 413);
      writeAtomic(p.data, text);
    }
    const next: DeskItemMeta = {
      ...meta,
      title: input.title === undefined ? meta.title : cleanTitle(input.title, meta.title),
      updatedAt: Date.now(),
      rev: meta.rev + 1,
      bytes,
    };
    writeAtomic(p.meta, JSON.stringify(next));
    return next;
  }

  remove(scope: string, id: string): boolean {
    const p = this.paths(scope, id);
    const had = existsSync(p.meta) || existsSync(p.data);
    rmSync(p.meta, { force: true });
    rmSync(p.data, { force: true });
    return had;
  }

  /** Move everything from one scope to another (the draft becoming a real chat's desk). */
  adopt(from: string, to: string): number {
    const src = this.dir(from);
    const dst = this.dir(to);
    if (from === to || !existsSync(src)) return 0;
    mkdirSync(dst, { recursive: true });
    let moved = 0;
    for (const f of readdirSync(src)) {
      if (!f.endsWith('.json')) continue;
      if (existsSync(join(dst, f))) continue;
      renameSync(join(src, f), join(dst, f));
      if (f.endsWith('.meta.json')) moved += 1;
    }
    try { if (readdirSync(src).length === 0) rmSync(src, { recursive: true, force: true }); } catch { /* leave it */ }
    return moved;
  }

  /** Forget a conversation's whole desk (when the chat is deleted). */
  removeScope(scope: string): void {
    rmSync(this.dir(scope), { recursive: true, force: true });
  }

  usage(scope: string): number {
    const dir = this.dir(scope);
    if (!existsSync(dir)) return 0;
    return readdirSync(dir).reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  }
}
