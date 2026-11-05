import { create } from "zustand";
import * as api from "~/api/mercury";
import type { DeskItem, DeskItemMeta } from "./types";
import { getDeskApp } from "./registry";
import type { Saver } from "./saver";

/**
 * Desk state: whether the panel is open, how wide, and the items of the
 * conversation on screen. Items are keyed by "scope" (the chat thread id, or
 * "draft" while a chat has no thread yet) so switching chats switches desks
 * and switching back finds yours exactly as left.
 */

export const DRAFT = "draft";
export const MIN_WIDTH = 360;
/** The chat column never shrinks below this to make room for the desk. */
export const MIN_CHAT = 420;
export const DEFAULT_WIDTH = 640;

const OPEN_KEY = "mercury.desk.open.v1";
const WIDTH_KEY = "mercury.desk.width.v1";

/** Keep the desk and the chat both usable inside `total` px of room. */
export function clampWidth(width: number, total: number): number {
  const max = Math.max(MIN_WIDTH, total - MIN_CHAT);
  return Math.round(Math.min(max, Math.max(MIN_WIDTH, width)));
}

/**
 * Beside the chat only while both fit: the chat keeps MIN_CHAT and the desk MIN_WIDTH,
 * after `reserved` px of anything left of the chat. Otherwise the desk covers the chat.
 */
export function needsOverlay(total: number, reserved: number): boolean {
  return total - reserved < MIN_CHAT + MIN_WIDTH;
}

function readNumber(key: string, fallback: number): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch { return fallback; }
}

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

export type DeskLoad = "idle" | "loading" | "ready" | "error";

interface ScopeState {
  items: DeskItemMeta[];
  activeId: string | null;
  load: DeskLoad;
}

interface DeskState {
  open: boolean;
  width: number;
  scopes: Record<string, ScopeState>;
  setOpen(open: boolean): void;
  toggle(): void;
  setWidth(width: number): void;
  /** Fetch a scope's items (cheap: no data). Safe to repeat; keeps the selected tab. */
  load(scope: string): Promise<void>;
  select(scope: string, id: string): void;
  /** New item of an app; selected right away. */
  add(scope: string, appId: string): Promise<DeskItemMeta | null>;
  rename(scope: string, id: string, title: string): Promise<void>;
  remove(scope: string, id: string): Promise<void>;
  /** A save came back: keep the new rev so the next write and the cache agree. */
  saved(scope: string, meta: DeskItemMeta): void;
  /** The draft desk became this chat's desk. */
  adopt(threadId: string): Promise<void>;
}

const EMPTY: ScopeState = { items: [], activeId: null, load: "idle" };

export const useDesk = create<DeskState>((set, get) => {
  const patch = (scope: string, fn: (s: ScopeState) => Partial<ScopeState>) =>
    set((st) => {
      const cur = st.scopes[scope] ?? EMPTY;
      return { scopes: { ...st.scopes, [scope]: { ...cur, ...fn(cur) } } };
    });

  return {
    open: readOpen(),
    width: readNumber(WIDTH_KEY, DEFAULT_WIDTH),
    scopes: {},
    setOpen(open) { write(OPEN_KEY, open ? "1" : "0"); set({ open }); },
    toggle() { get().setOpen(!get().open); },
    setWidth(width) { const w = Math.max(MIN_WIDTH, Math.round(width)); write(WIDTH_KEY, String(w)); set({ width: w }); },

    async load(scope) {
      patch(scope, (s) => ({ load: s.items.length ? s.load : "loading" }));
      try {
        const items = await api.desk.list(scope);
        patch(scope, (s) => ({
          items,
          load: "ready",
          activeId: s.activeId && items.some((i) => i.id === s.activeId) ? s.activeId : (items[items.length - 1]?.id ?? null),
        }));
      } catch {
        patch(scope, (s) => ({ load: s.items.length ? "ready" : "error" }));
      }
    },

    select(scope, id) { patch(scope, () => ({ activeId: id })); },

    async add(scope, appId) {
      const app = getDeskApp(appId);
      if (!app) return null;
      const n = (get().scopes[scope]?.items ?? []).filter((i) => i.app === appId).length + 1;
      try {
        const meta = await api.desk.create(scope, { app: appId, title: n === 1 ? app.title : `${app.title} ${n}`, data: app.initialData?.() ?? null });
        patch(scope, (s) => ({ items: [...s.items, meta], activeId: meta.id, load: "ready" }));
        return meta;
      } catch { return null; }
    },

    async rename(scope, id, title) {
      const clean = title.replace(/\s+/g, " ").trim().slice(0, 120);
      const cur = get().scopes[scope]?.items.find((i) => i.id === id);
      if (!clean || !cur || clean === cur.title) return;
      patch(scope, (s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, title: clean } : i)) }));
      try {
        const meta = await api.desk.save(scope, id, { title: clean });
        get().saved(scope, meta);
      } catch {
        patch(scope, (s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, title: cur.title } : i)) }));
      }
    },

    async remove(scope, id) {
      const before = get().scopes[scope];
      if (!before) return;
      const index = before.items.findIndex((i) => i.id === id);
      const items = before.items.filter((i) => i.id !== id);
      patch(scope, (s) => ({ items, activeId: s.activeId === id ? (items[Math.min(index, items.length - 1)]?.id ?? null) : s.activeId }));
      forget(scope, id);
      try { await api.desk.remove(scope, id); } catch { void get().load(scope); }
    },

    saved(scope, meta) {
      patch(scope, (s) => ({ items: s.items.map((i) => (i.id === meta.id ? { ...i, ...meta } : i)) }));
      const hit = cache.get(key(scope, meta.id));
      if (hit) hit.rev = meta.rev;
    },

    async adopt(threadId) {
      const draft = get().scopes[DRAFT];
      if (!draft || draft.items.length === 0) return;
      // Anything still unsaved lands in the draft folder before it moves.
      await flushSavers();
      try {
        await api.desk.adopt(DRAFT, threadId);
      } catch { return; }
      set((st) => {
        const scopes = { ...st.scopes };
        scopes[threadId] = { ...draft, load: "ready" };
        scopes[DRAFT] = { items: [], activeId: null, load: "ready" };
        return { scopes };
      });
      for (const [k, v] of [...cache]) {
        if (k.startsWith(`${DRAFT}/`)) { cache.delete(k); cache.set(key(threadId, k.slice(DRAFT.length + 1)), v); }
      }
    },
  };
});

/* ── open savers, so a move or a quit can write everything first ── */

const savers = new Set<Saver>();
export function registerSaver(saver: Saver): () => void {
  savers.add(saver);
  return () => { savers.delete(saver); };
}
export async function flushSavers(): Promise<void> {
  await Promise.all([...savers].map((s) => s.flush().catch(() => {})));
}

/* ── item data cache: instant re-open, validated by rev ── */

const cache = new Map<string, { rev: number; data: unknown }>();
const key = (scope: string, id: string) => `${scope}/${id}`;
const CACHE_MAX = 12;

function forget(scope: string, id: string): void { cache.delete(key(scope, id)); }

/** The item with its data. A cached copy is used when its rev still matches `meta.rev`. */
export async function loadItem(scope: string, meta: DeskItemMeta): Promise<DeskItem> {
  const hit = cache.get(key(scope, meta.id));
  if (hit && hit.rev === meta.rev) {
    cache.delete(key(scope, meta.id));
    cache.set(key(scope, meta.id), hit);
    return { ...meta, data: hit.data };
  }
  const item = await api.desk.get(scope, meta.id);
  remember(scope, item.id, item.rev, item.data);
  return item;
}

/** Remember what was last saved, so re-opening the tab does not refetch. */
export function remember(scope: string, id: string, rev: number, data: unknown): void {
  cache.set(key(scope, id), { rev, data });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function resetDeskCache(): void { cache.clear(); }
