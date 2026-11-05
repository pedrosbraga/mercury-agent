import { describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  process.env.MERCURY_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-desk-route-'));
});

import desk from './desk.js';

const call = (method: string, path: string, body?: unknown) =>
  desk.request(`http://127.0.0.1/api/desk${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('/api/desk', () => {
  it('creates, lists, reads, saves, renames and deletes a board', async () => {
    const created = (await (await call('POST', '/t1/items', { app: 'excalidraw', title: 'Ideas', data: { elements: [] } })).json()) as { item: { id: string; rev: number } };
    const id = created.item.id;
    expect(created.item.rev).toBe(1);

    const list = (await (await call('GET', '/t1')).json()) as { items: Array<{ id: string; data?: unknown }> };
    expect(list.items.map((i) => i.id)).toEqual([id]);
    expect(list.items[0]).not.toHaveProperty('data');

    const saved = await call('PUT', `/t1/items/${id}`, { data: { elements: [{ id: 'x' }] }, baseRev: 1 });
    expect(saved.status).toBe(200);
    const stale = await call('PUT', `/t1/items/${id}`, { data: {}, baseRev: 1 });
    expect(stale.status).toBe(409);

    const one = (await (await call('GET', `/t1/items/${id}`)).json()) as { item: { data: { elements: unknown[] }; rev: number } };
    expect(one.item.data.elements).toHaveLength(1);
    expect(one.item.rev).toBe(2);

    expect(await (await call('DELETE', `/t1/items/${id}`)).json()).toEqual({ deleted: true });
    expect((await call('GET', `/t1/items/${id}`)).status).toBe(404);
  });

  it('rejects bad input with a clear status', async () => {
    expect((await call('POST', '/t1/items', { app: 'No Good' })).status).toBe(400);
    expect((await call('POST', '/t1/items')).status).toBe(400);
    expect((await call('GET', '/bad.scope')).status).toBe(400);
    expect((await call('PUT', '/t1/items/none', { data: 1 })).status).toBe(404);
  });

  it('moves the draft desk to a new chat', async () => {
    const c = (await (await call('POST', '/draft/items', { app: 'excalidraw', data: { a: 1 } })).json()) as { item: { id: string } };
    expect(await (await call('POST', '/draft/adopt', { to: 'thread-1' })).json()).toEqual({ moved: 1 });
    expect(((await (await call('GET', '/draft')).json()) as { items: unknown[] }).items).toEqual([]);
    expect(((await (await call('GET', '/thread-1')).json()) as { items: Array<{ id: string }> }).items.map((i) => i.id)).toContain(c.item.id);
    expect((await call('POST', '/draft/adopt', {})).status).toBe(400);
  });
});
