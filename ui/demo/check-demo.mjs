/** Browser smoke test for the standalone demo page (no backend, no auth). */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(new URL("../../apps/desktop/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const origin = "http://localhost:4173";
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(origin);
  const ui = page.locator('[aria-label="Interactive Mercury UI"]').first();
  await ui.waitFor();

  // Tabs
  await ui.getByRole("tab", { name: "Details", exact: true }).click();
  assert.equal(await ui.getByRole("tab", { name: "Details", exact: true }).getAttribute("aria-selected"), "true");

  // Accordion
  await ui.locator("summary").click();
  assert.equal(await ui.locator("details").evaluate((el) => el.open), true);

  // Table filter + sort
  await ui.getByRole("searchbox").fill("Review");
  assert.equal(await ui.locator("tbody tr").count(), 1);
  await ui.getByRole("searchbox").fill("");
  await ui.locator("th button").first().click();
  assert.equal(await ui.locator("th").first().getAttribute("aria-sort"), "ascending");

  // Form → draft preview (never sends)
  await ui.locator('input[name="topic"]').fill("Validar demo");
  await ui.locator('input[name="count"]').fill("2");
  await ui.locator('input[name="date"]').fill("2026-11-05");
  await ui.locator('select[name="priority"]').selectOption("High");
  await ui.getByRole("button", { name: "Preview review request", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".draft-box pre")?.textContent?.includes("Validar demo"));
  assert.match(await page.locator(".draft-box pre").innerText(), /Plan a review\nTopic: Validar demo/);

  // Button → draft preview
  await ui.getByRole("button", { name: "Preview follow-up", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".draft-box pre")?.textContent?.includes("Help me review"));
  assert.match(await page.locator(".draft-box pre").innerText(), /Help me review the remaining tasks/);

  await page.screenshot({ path: "demo.png", fullPage: true });
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("PASS: standalone demo — tabs, accordion, table filter/sort, form validation, draft preview. No backend, no auth, no model calls.");
  console.log("Screenshot: ui/demo/demo.png");
} finally {
  await browser?.close();
}
