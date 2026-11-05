#!/usr/bin/env node
/**
 * Excalidraw fetches its drawing fonts at run time from a public CDN unless it
 * is told where they live. Mercury must work offline and inside the app's
 * content-security policy, so the fonts ship with the app: this copies them
 * from node_modules into public/excalidraw/fonts (served as /excalidraw/fonts).
 *
 * Skipped: Xiaolai (12 MB of CJK glyphs). Those characters fall back to the
 * system font, which is the right trade for the size of the app.
 *
 * Runs before `dev` and `build`; a stamp file makes it a no-op when the
 * installed Excalidraw version is already copied.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(root, "node_modules", "@excalidraw", "excalidraw");
const from = path.join(pkgDir, "dist", "prod", "fonts");
const to = path.join(root, "public", "excalidraw", "fonts");
const stamp = path.join(root, "public", "excalidraw", ".version");
const SKIP = new Set(["Xiaolai"]);

if (!existsSync(from)) {
  console.error("[excalidraw-assets] @excalidraw/excalidraw is not installed; run npm install first.");
  process.exit(1);
}

const version = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")).version;
if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === version && existsSync(to)) process.exit(0);

rmSync(path.join(root, "public", "excalidraw"), { recursive: true, force: true });
mkdirSync(to, { recursive: true });
let files = 0;
for (const dir of readdirSync(from, { withFileTypes: true })) {
  if (!dir.isDirectory() || SKIP.has(dir.name)) continue;
  cpSync(path.join(from, dir.name), path.join(to, dir.name), { recursive: true });
  files += readdirSync(path.join(to, dir.name)).length;
}
writeFileSync(stamp, `${version}\n`);
console.log(`[excalidraw-assets] ${files} font files copied for Excalidraw ${version}`);
