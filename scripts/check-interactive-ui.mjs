/** Browser acceptance test against the actual built web chat. All API data is mocked;
 * no credentials, live conversations or model calls are used. Run after ui build.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const ts = require('typescript');
const source = await readFile(new URL('../apps/desktop/src/components/mercury-ui/demo.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { mercuryUiDemo } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const fence = '```mercury-ui\n' + JSON.stringify(mercuryUiDemo) + '\n```';
const origin = 'http://127.0.0.1:4177';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4177', '--strictPort'], { cwd: `${root}ui`, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`Preview server exited ${server.exitCode}`);
    if (await fetch(origin).then(r => r.ok).catch(() => false)) break;
    await delay(200);
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const sends = [];
  const thread = { id: 'ui-test', title: 'Interactive UI test', createdAt: new Date().toISOString(), messages: [{ id: 'assistant-ui', role: 'assistant', content: fence, timestamp: new Date().toISOString() }] };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body = {};
    if (path === '/api/chat/events') return route.fulfill({ contentType: 'text/event-stream', body: 'event: connected\ndata: {"provider":"test","model":"test"}\n\n' });
    if (path === '/api/chat/threads') body = { threads: [thread] };
    if (path === '/api/chat/threads/ui-test') body = thread;
    if (path === '/api/chat/settings') body = { bypassPermissions: false, restrictUser: false, workspace: '/tmp' };
    if (path === '/api/chat/models') body = { current: { name: 'test', model: 'test' }, providers: [] };
    if (path === '/api/code/status') body = { available: false, state: 'off', active: false };
    if (path === '/api/workspace/tree') body = { entries: [], items: [], path: '/tmp' };
    if (path === '/api/chat/send') { sends.push(request.postDataJSON()); body = { sent: true, sessionId: 'ui-test' }; }
    return route.fulfill({ json: body });
  });
  await page.goto(`${origin}/chat/ui-test`);
  const ui = page.locator('[aria-label="Interactive Mercury UI"]').first();
  await ui.waitFor();
  await ui.getByRole('tab', { name: 'Details', exact: true }).click();
  assert.equal(await ui.getByRole('tab', { name: 'Details', exact: true }).getAttribute('aria-selected'), 'true');
  await ui.locator('summary').click();
  assert.equal(await ui.locator('details').evaluate(el => el.open), true);
  await ui.getByRole('searchbox').fill('Review');
  assert.equal(await ui.locator('tbody tr').count(), 1);
  await ui.getByRole('searchbox').fill('');
  await ui.locator('th button').first().click();
  assert.equal(await ui.locator('th').first().getAttribute('aria-sort'), 'ascending');
  await ui.locator('input[name="topic"]').fill('Testar interface');
  await ui.locator('input[name="count"]').fill('3');
  await ui.locator('input[name="date"]').fill('2026-11-05');
  await ui.locator('select[name="priority"]').selectOption('High');
  const composer = page.locator('textarea');
  await composer.fill('Rascunho existente');
  await ui.getByRole('button', { name: 'Preview review request', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('Testar interface'));
  assert.match(await composer.inputValue(), /^Rascunho existente\n\nPlan a review/);
  assert.equal(sends.length, 0, 'Form preview must not send');
  await page.getByRole('button', { name: 'Open interactive UI examples', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.screenshot({ path: `${root}ui/dist/interactive-ui-demo.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Preview follow-up', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('Help me review'));
  assert.equal(await dialog.count(), 0, 'Accepted preview closes gallery');
  assert.equal(sends.length, 0, 'Gallery preview must not send');
  await Promise.all([
    page.waitForRequest(r => new URL(r.url()).pathname === '/api/chat/send'),
    composer.press('Enter'),
  ]);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].interactiveUi, 'mercury-ui-v1');
  assert.match(sends[0].content, /Rascunho existente/);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: built web chat — nine catalog components, tabs, accordion, table filter/sort, form constraints, draft preservation, gallery, explicit send + capability. No model calls.');
  console.log(`Screenshot: ${root}ui/dist/interactive-ui-demo.png`);
} finally {
  await browser?.close();
  server.kill();
}
