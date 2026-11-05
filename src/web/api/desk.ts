import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { join } from 'node:path';
import { getMercuryHome } from '../../utils/config.js';
import { DeskError, DeskStore, MAX_ITEM_BYTES } from '../../desk/store.js';

/**
 * The workspace desk: what you and Mercury put on the side panel next to a chat.
 * Generic on purpose: an item is { app, title, data }, and only the app that
 * made it knows what `data` means.
 *
 *   GET    /api/desk/:scope                       items of a chat (or "draft"), oldest first, without their data
 *   POST   /api/desk/:scope/items { app, title?, data? }
 *   GET    /api/desk/:scope/items/:id             one item with its data
 *   PUT    /api/desk/:scope/items/:id { data?, title?, baseRev? }   409 when baseRev is stale
 *   DELETE /api/desk/:scope/items/:id
 *   POST   /api/desk/:scope/adopt { to }          move a draft desk onto the chat that was just created
 */
const desk = new Hono();

const store = () => new DeskStore(join(getMercuryHome(), 'desk'));

// Whole boards are written in one request: allow the item size plus a little.
desk.use('/api/desk/*', bodyLimit({ maxSize: MAX_ITEM_BYTES + 64 * 1024, onError: (c) => c.json({ error: 'Request too large' }, 413) }));

function fail(c: { json: (b: unknown, s: 400 | 404 | 409 | 413 | 500) => Response }, e: unknown): Response {
  if (e instanceof DeskError) return c.json({ error: e.message }, e.status);
  return c.json({ error: 'Desk unavailable' }, 500);
}

async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const v = await c.req.json().catch(() => null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new DeskError('Expected a JSON object', 400);
  return v as Record<string, unknown>;
}

desk.get('/api/desk/:scope', (c) => {
  try { return c.json({ items: store().list(c.req.param('scope')) }); } catch (e) { return fail(c, e); }
});

desk.post('/api/desk/:scope/items', async (c) => {
  try {
    const b = await body(c);
    return c.json({ item: store().create(c.req.param('scope'), { app: b.app, title: b.title, data: b.data }) }, 200);
  } catch (e) { return fail(c, e); }
});

desk.get('/api/desk/:scope/items/:id', (c) => {
  try { return c.json({ item: store().get(c.req.param('scope'), c.req.param('id')) }); } catch (e) { return fail(c, e); }
});

desk.put('/api/desk/:scope/items/:id', async (c) => {
  try {
    const b = await body(c);
    return c.json({ item: store().put(c.req.param('scope'), c.req.param('id'), { data: b.data, title: b.title, baseRev: b.baseRev }) });
  } catch (e) { return fail(c, e); }
});

desk.delete('/api/desk/:scope/items/:id', (c) => {
  try { return c.json({ deleted: store().remove(c.req.param('scope'), c.req.param('id')) }); } catch (e) { return fail(c, e); }
});

desk.post('/api/desk/:scope/adopt', async (c) => {
  try {
    const b = await body(c);
    if (typeof b.to !== 'string') throw new DeskError('Missing "to"', 400);
    return c.json({ moved: store().adopt(c.req.param('scope'), b.to) });
  } catch (e) { return fail(c, e); }
});

export default desk;
