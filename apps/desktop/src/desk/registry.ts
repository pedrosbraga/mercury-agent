import { create } from "zustand";
import { lazy, type ComponentType } from "react";
import type { DeskApp, DeskAppProps } from "./types";

/**
 * The desk's apps. Built-ins register through this exact call and so will
 * anything added later (a document editor, a site preview, a table…).
 */
const ID_RE = /^[a-z0-9][a-z0-9.-]{0,60}$/;

interface Registry {
  apps: Record<string, DeskApp>;
}

export const useDeskApps = create<Registry>(() => ({ apps: {} }));

const components = new Map<string, ComponentType<DeskAppProps>>();
const loading = new Map<string, Promise<unknown>>();

export function registerDeskApp(app: DeskApp): () => void {
  if (!ID_RE.test(app.id)) throw new Error(`Desk app id must be lowercase letters, digits, dots or dashes: ${app.id}`);
  useDeskApps.setState((s) => ({ apps: { ...s.apps, [app.id]: app } }));
  components.delete(app.id);
  return () => {
    useDeskApps.setState((s) => {
      const apps = { ...s.apps };
      delete apps[app.id];
      return { apps };
    });
    components.delete(app.id);
  };
}

export function getDeskApp(id: string): DeskApp | undefined {
  return useDeskApps.getState().apps[id];
}

export function listDeskApps(): DeskApp[] {
  return Object.values(useDeskApps.getState().apps);
}

/** The app's component, wrapped once so React reuses it between renders. */
export function deskAppComponent(id: string): ComponentType<DeskAppProps> | null {
  const app = getDeskApp(id);
  if (!app) return null;
  let c = components.get(id);
  if (!c) {
    c = lazy(app.load);
    components.set(id, c);
  }
  return c;
}

/** Start loading an app's code now (hover, idle time). Safe to call many times. */
export function preloadDeskApp(id: string): void {
  const app = getDeskApp(id);
  if (!app || loading.has(id)) return;
  loading.set(id, app.load().catch(() => { loading.delete(id); }));
}

/** After startup, when the window is idle, warm the apps that asked for it. */
export function preloadWhenIdle(): void {
  const run = () => listDeskApps().filter((a) => a.preload).forEach((a) => preloadDeskApp(a.id));
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 8000 });
  else setTimeout(run, 4000);
}
