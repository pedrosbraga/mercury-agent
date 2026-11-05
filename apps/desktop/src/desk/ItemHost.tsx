import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import * as api from "~/api/mercury";
import { ApiError } from "~/api/client";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { useTheme } from "~/app/theme";
import { deskAppComponent, getDeskApp } from "./registry";
import { createSaver, type Saver, type SaveState } from "./saver";
import { loadItem, registerSaver, remember, useDesk } from "./store";
import type { DeskItem, DeskItemMeta } from "./types";

type Loaded = { state: "loading" } | { state: "error" } | { state: "ready"; item: DeskItem };

/**
 * One open item: fetches its data, mounts its app (code loaded on demand),
 * and wires the app's changes to a saver. Keyed by scope and item id by the
 * panel, so each item gets a fresh saver and a flush when it goes away.
 */
export function ItemHost({ scope, meta, onSaveState }: { scope: string; meta: DeskItemMeta; onSaveState(state: SaveState): void }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const theme = useTheme((s) => s.resolved);
  const rev = useRef(meta.rev);
  const saverRef = useRef<Saver | null>(null);
  const reportRef = useRef(onSaveState);
  reportRef.current = onSaveState;

  // Fetch the data (the cache answers at once when this tab was open before).
  useEffect(() => {
    let alive = true;
    setLoaded({ state: "loading" });
    loadItem(scope, meta)
      .then((item) => { if (alive) { rev.current = item.rev; setLoaded({ state: "ready", item }); } })
      .catch(() => { if (alive) setLoaded({ state: "error" }); });
    return () => { alive = false; };
    // Only the item's identity: our own saves raise `rev` without needing a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, meta.id]);

  // Someone else (Mercury drawing on the board) raised the revision: show what they wrote.
  // Skipped while this window still has unsaved changes; its own save then wins, as before.
  useEffect(() => {
    if (loaded.state !== "ready" || meta.rev <= rev.current) return;
    if (saverRef.current && saverRef.current.state() !== "saved") return;
    let alive = true;
    loadItem(scope, meta)
      .then((item) => {
        if (!alive || item.rev <= rev.current) return;
        rev.current = item.rev;
        setLoaded({ state: "ready", item });
      })
      .catch(() => { /* try again on the next look */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.rev, loaded.state]);

  // One saver per item; flushed when the tab goes away, the window hides or the page unloads.
  useEffect(() => {
    const saver = createSaver({
      onState: (s) => reportRef.current(s),
      async write(data) {
        const put = (baseRev: number) => api.desk.save(scope, meta.id, { data, baseRev });
        let saved: DeskItemMeta;
        try {
          saved = await put(rev.current);
        } catch (e) {
          // Changed elsewhere since we loaded it: this window's drawing wins, on top of the newer revision.
          if (!(e instanceof ApiError) || e.status !== 409) throw e;
          const latest = (await api.desk.list(scope)).find((i) => i.id === meta.id);
          if (!latest) throw e;
          saved = await put(latest.rev);
        }
        rev.current = saved.rev;
        remember(scope, meta.id, saved.rev, data);
        useDesk.getState().saved(scope, saved);
      },
    });
    saverRef.current = saver;
    const unregister = registerSaver(saver);
    const hide = () => { if (document.visibilityState === "hidden") void saver.flush(); };
    const leave = () => { void saver.flush(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      unregister();
      void saver.dispose(true);
      saverRef.current = null;
    };
  }, [scope, meta.id]);

  const change = useCallback((read: () => unknown) => { saverRef.current?.change(read); }, []);

  const app = getDeskApp(meta.app);
  const App = deskAppComponent(meta.app);
  if (!app || !App) return <Notice title="This app isn't available" body={`"${meta.app}" isn't installed in this version of Mercury. Your ${meta.title} is safe and will open again when it is.`} />;
  if (loaded.state === "error") return <Notice title="Couldn't open it" body="Mercury couldn't read this item. Check the connection and try again." />;
  if (loaded.state === "loading") return <Loading label={`Opening ${meta.title}`} />;

  return (
    <ErrorBoundary label={app.title} resetKey={`${scope}/${meta.id}`}>
      <Suspense fallback={<Loading label={`Loading ${app.title}`} />}>
        <App key={loaded.item.rev} data={loaded.item.data} theme={theme} change={change} />
      </Suspense>
    </ErrorBoundary>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center" role="status">
      <span className="flex items-center gap-2 text-sm text-ink3">
        <span className="h-3.5 w-3.5 animate-ring-spin rounded-full border-[1.5px] border-current border-r-transparent" aria-hidden="true" />
        {label}…
      </span>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-[340px] text-center">
        <div className="text-base font-medium text-ink">{title}</div>
        <p className="mt-1 text-sm text-ink3">{body}</p>
      </div>
    </div>
  );
}
