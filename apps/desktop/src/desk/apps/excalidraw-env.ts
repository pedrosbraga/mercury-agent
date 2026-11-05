/**
 * Must run before Excalidraw is used: tells it to load its drawing fonts from
 * the app itself (public/excalidraw/fonts, copied by scripts/excalidraw-assets.mjs)
 * instead of a public CDN. Offline-safe, and inside the app's CSP.
 */
declare global {
  interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] }
}
window.EXCALIDRAW_ASSET_PATH = `${window.location.origin}/excalidraw/`;
export {};
