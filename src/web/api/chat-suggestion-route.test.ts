import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-suggestion-route-'));
  fs.writeFileSync(path.join(dir, 'mercury.yaml'), 'identity:\n  owner: Test\n');
  process.env.MERCURY_HOME = dir;
});

import { SessionRepository } from '../../sessions/repository.js';
import chat, { setNextStepSuggester, setSessionRepository } from './chat.js';

const get = (id: string) => chat.request(`http://127.0.0.1/api/chat/threads/${id}/suggestion`);

describe('GET /api/chat/threads/:id/suggestion', () => {
  const repo = new SessionRepository({ rootDir: mkdtempSync(join(tmpdir(), 'mercury-suggestion-sessions-')), autoMigrate: false });
  setSessionRepository(repo);
  const t = repo.create({ title: 'T' });

  it('returns null while no suggester is wired', async () => {
    setNextStepSuggester(null);
    const res = await get(t.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestion: null });
  });

  it('returns the suggestion for the thread', async () => {
    const fn = vi.fn(async () => 'Roda o build e instala');
    setNextStepSuggester(fn);
    expect(await (await get(t.id)).json()).toEqual({ suggestion: 'Roda o build e instala' });
    expect(fn).toHaveBeenCalledWith(t.id);
  });

  it('turns a failing suggester into null, not an error', async () => {
    setNextStepSuggester(async () => { throw new Error('boom'); });
    const res = await get(t.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestion: null });
  });

  it('404s for an unknown thread', async () => {
    expect((await get('nope')).status).toBe(404);
  });
});
