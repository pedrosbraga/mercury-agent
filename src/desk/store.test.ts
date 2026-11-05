import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DeskError, DeskStore, MAX_ITEM_BYTES } from './store.js';

const fresh = () => new DeskStore(mkdtempSync(join(tmpdir(), 'mercury-desk-')));
const fails = (fn: () => unknown, status: number) => {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(DeskError); expect((e as DeskError).status).toBe(status); return; }
  throw new Error('expected a DeskError');
};

describe('DeskStore', () => {
  it('creates, lists (oldest first), reads back exactly what was stored', () => {
    const s = fresh();
    const board = { type: 'excalidraw', elements: [{ id: 'a' }], files: {} };
    const a = s.create('t1', { app: 'excalidraw', title: '  Plan  ', data: board });
    const b = s.create('t1', { app: 'excalidraw' });
    expect(a).toMatchObject({ app: 'excalidraw', title: 'Plan', rev: 1 });
    expect(b.title).toBe('Untitled');
    expect(s.list('t1').map((m) => m.id)).toEqual([a.id, b.id]);
    expect(s.get('t1', a.id).data).toEqual(board);
    expect(s.list('other')).toEqual([]);
  });

  it('keeps creation order even for items made in the same millisecond', () => {
    const s = fresh();
    const made = Array.from({ length: 30 }, () => s.create('t1', { app: 'excalidraw' }).id);
    expect(s.list('t1').map((m) => m.id)).toEqual(made);
  });

  it('rev rises on every write and baseRev guards against a stale writer', () => {
    const s = fresh();
    const m = s.create('t1', { app: 'excalidraw', data: { n: 1 } });
    const m2 = s.put('t1', m.id, { data: { n: 2 }, baseRev: 1 });
    expect(m2.rev).toBe(2);
    fails(() => s.put('t1', m.id, { data: { n: 3 }, baseRev: 1 }), 409);
    expect(s.get('t1', m.id).data).toEqual({ n: 2 });
    expect(s.put('t1', m.id, { title: 'Renamed' }).rev).toBe(3);
    expect(s.get('t1', m.id)).toMatchObject({ title: 'Renamed', data: { n: 2 } });
  });

  it('refuses ids and apps that could escape the folder or are malformed', () => {
    const s = fresh();
    fails(() => s.list('../etc'), 400);
    fails(() => s.get('t1', '../x'), 400);
    fails(() => s.create('t1', { app: 'Bad App' }), 400);
    fails(() => s.create('t1', { app: '' }), 400);
    fails(() => s.get('t1', 'missing'), 404);
    fails(() => s.put('t1', 'missing', { data: 1 }), 404);
  });

  it('refuses oversized items without touching the stored copy', () => {
    const s = fresh();
    const m = s.create('t1', { app: 'excalidraw', data: { ok: true } });
    fails(() => s.put('t1', m.id, { data: 'x'.repeat(MAX_ITEM_BYTES + 1) }), 413);
    expect(s.get('t1', m.id).data).toEqual({ ok: true });
  });

  it('leaves no temp files behind and removes items', () => {
    const root = mkdtempSync(join(tmpdir(), 'mercury-desk-'));
    const s = new DeskStore(root);
    const m = s.create('t1', { app: 'excalidraw', data: { a: 1 } });
    s.put('t1', m.id, { data: { a: 2 } });
    expect(readdirSync(join(root, 't1')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(s.remove('t1', m.id)).toBe(true);
    expect(s.remove('t1', m.id)).toBe(false);
    expect(s.list('t1')).toEqual([]);
  });

  it('adopts a draft desk into a chat, keeping ids, and tidies the draft folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'mercury-desk-'));
    const s = new DeskStore(root);
    const m = s.create('draft', { app: 'excalidraw', data: { a: 1 } });
    expect(s.adopt('draft', 'thread-9')).toBe(1);
    expect(s.list('draft')).toEqual([]);
    expect(existsSync(join(root, 'draft'))).toBe(false);
    expect(s.get('thread-9', m.id).data).toEqual({ a: 1 });
    expect(s.adopt('draft', 'thread-9')).toBe(0);
  });

  it('removes a whole conversation desk', () => {
    const s = fresh();
    s.create('t1', { app: 'excalidraw' });
    s.removeScope('t1');
    expect(s.list('t1')).toEqual([]);
  });
});
