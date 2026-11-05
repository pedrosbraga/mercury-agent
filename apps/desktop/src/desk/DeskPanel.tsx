import { Check, CircleAlert, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/Button";
import { Menu, MenuItem, MenuLabel } from "~/components/ui/Menu";
import { Tooltip } from "~/components/ui/Tooltip";
import { cx } from "~/lib/cx";
import { ItemHost, Loading } from "./ItemHost";
import { getDeskApp, preloadDeskApp, useDeskApps } from "./registry";
import { startResize } from "./resize";
import type { SaveState } from "./saver";
import { clampWidth, DEFAULT_WIDTH, MIN_CHAT, MIN_WIDTH, needsOverlay, useDesk } from "./store";
import type { DeskItemMeta } from "./types";

const EMPTY: never[] = [];

/**
 * The workspace: a panel beside the chat that hosts desk apps. Everything
 * here is app-agnostic. Tabs are the conversation's items; each one is
 * rendered by whichever app made it.
 */
export function DeskPanel({ scope }: { scope: string }) {
  const width = useDesk((s) => s.width);
  const setWidth = useDesk((s) => s.setWidth);
  const setOpen = useDesk((s) => s.setOpen);
  const load = useDesk((s) => s.load);
  const items = useDesk((s) => s.scopes[scope]?.items ?? EMPTY);
  const activeId = useDesk((s) => s.scopes[scope]?.activeId ?? null);
  const status = useDesk((s) => s.scopes[scope]?.load ?? "idle");
  const active = items.find((i) => i.id === activeId) ?? null;
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [frozen, setFrozen] = useState<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  const [fit, setFit] = useState({ overlay: false, reserved: 300 });
  const overlayRef = useRef(false);
  overlayRef.current = fit.overlay;

  // Beside the chat while both fit; over it when the window is too narrow for both.
  // `reserved` is what sits left of the chat (the sessions list), measured, so nothing here hard-codes it.
  useLayoutEffect(() => {
    const el = panel.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const measure = () => {
      const chat = el.previousElementSibling as HTMLElement | null;
      const total = parent.clientWidth;
      const reserved = Math.max(0, total - (chat?.clientWidth ?? 0) - (overlayRef.current ? 0 : el.offsetWidth));
      const overlay = needsOverlay(total, reserved);
      setFit((f) => (f.overlay === overlay && f.reserved === reserved ? f : { overlay, reserved }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    if (el.previousElementSibling) ro.observe(el.previousElementSibling);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { void load(scope); }, [scope, load]);
  useEffect(() => { setSaveState("saved"); }, [scope, activeId]);

  function onHandleDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = panel.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startWidth = el.getBoundingClientRect().width;
    const chat = el.previousElementSibling as HTMLElement | null;
    const room = startWidth + (chat?.getBoundingClientRect().width ?? 0);
    const drag = startResize({
      panel: el, startX: e.clientX, startWidth, room,
      onFrozen: (f) => setFrozen(f ? startWidth : null),
      onDone: (w) => setWidth(w),
    });
    const move = (ev: PointerEvent) => drag.move(ev.clientX);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      drag.end();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  function onHandleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = panel.current;
    if (!el) return;
    const step = e.shiftKey ? 80 : 24;
    const room = el.getBoundingClientRect().width + ((el.previousElementSibling as HTMLElement | null)?.getBoundingClientRect().width ?? 0);
    const now = el.getBoundingClientRect().width;
    if (e.key === "ArrowLeft") { e.preventDefault(); setWidth(clampWidth(now + step, room)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setWidth(clampWidth(now - step, room)); }
    else if (e.key === "Home") { e.preventDefault(); setWidth(DEFAULT_WIDTH); }
  }

  return (
    <aside
      ref={panel}
      aria-label="Workspace"
      data-mode={fit.overlay ? "overlay" : "side"}
      className={cx(
        "flex min-w-0 flex-col overflow-hidden border-l border-line bg-bg",
        fit.overlay ? "absolute inset-y-0 right-0 z-30 shadow-[-12px_0_32px_-8px_rgba(0,0,0,0.35)]" : "relative shrink",
      )}
      style={fit.overlay
        ? { width: `min(${width}px, 100%)` }
        // The chat keeps MIN_CHAT px whatever the stored width is; a wider window gives the stored width back.
        : { flexBasis: width, minWidth: MIN_WIDTH, maxWidth: `calc(100% - ${fit.reserved + MIN_CHAT}px)` }}
    >
      {!fit.overlay && <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={onHandleDown}
        onKeyDown={onHandleKey}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        className="group absolute inset-y-0 left-0 z-20 w-2 -translate-x-1 cursor-col-resize outline-none"
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-accent/60 group-focus-visible:bg-accent group-active:bg-accent" />
      </div>}

      {/* While dragging, the content keeps its width and is clipped: the board reflows once, on release. */}
      <div className="flex h-full min-h-0 flex-col" style={frozen ? { width: frozen, flexShrink: 0 } : undefined}>
        <header className="flex h-[52px] shrink-0 items-center gap-1 border-b border-line pl-3 pr-2" data-tauri-drag-region>
          <Tabs scope={scope} items={items} activeId={activeId} />
          <AddMenu scope={scope} />
          <span className="min-w-2 flex-1" />
          <SaveBadge state={saveState} visible={!!active} />
          <Tooltip label="Close workspace" shortcut="⌘J" side="bottom">
            <Button variant="ghost" size="sm" icon onClick={() => setOpen(false)} aria-label="Close workspace"><X size={16} /></Button>
          </Tooltip>
        </header>

        <div className="relative min-h-0 flex-1">
          {active ? (
            <ItemHost key={`${scope}/${active.id}`} scope={scope} meta={active} onSaveState={setSaveState} />
          ) : status === "loading" || status === "idle" ? (
            <Loading label="Opening workspace" />
          ) : status === "error" && items.length === 0 ? (
            <Unreachable onRetry={() => void load(scope)} />
          ) : (
            <EmptyDesk scope={scope} />
          )}
        </div>
      </div>
    </aside>
  );
}

function Tabs({ scope, items, activeId }: { scope: string; items: DeskItemMeta[]; activeId: string | null }) {
  const select = useDesk((s) => s.select);
  return (
    <div role="tablist" aria-label="Workspace items" className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
      {items.map((item) => (
        <Tab key={item.id} scope={scope} item={item} selected={item.id === activeId} onSelect={() => select(scope, item.id)} />
      ))}
    </div>
  );
}

function Tab({ scope, item, selected, onSelect }: { scope: string; item: DeskItemMeta; selected: boolean; onSelect(): void }) {
  const rename = useDesk((s) => s.rename);
  const remove = useDesk((s) => s.remove);
  const Icon = getDeskApp(item.app)?.icon;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  function commit() {
    setEditing(false);
    const v = input.current?.value ?? "";
    if (v.trim()) void rename(scope, item.id, v);
  }

  return (
    <div
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } if (e.key === "F2") setEditing(true); }}
      className={cx(
        "group flex h-8 max-w-[180px] shrink-0 cursor-default items-center gap-1.5 rounded-md pl-2 pr-1 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent",
        selected ? "bg-ink/[0.07] text-ink" : "text-ink3 hover:bg-ink/[0.05] hover:text-ink",
      )}
    >
      {Icon && <Icon size={14} className="shrink-0" aria-hidden="true" />}
      {editing ? (
        <input
          ref={input}
          defaultValue={item.title}
          maxLength={120}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="h-6 w-28 rounded border border-line-strong bg-surface px-1 text-sm text-ink outline-none"
          aria-label="Rename"
        />
      ) : (
        <span className="truncate">{item.title}</span>
      )}
      {!editing && (
        <button
          onClick={(e) => { e.stopPropagation(); if (confirming) void remove(scope, item.id); else setConfirming(true); }}
          onBlur={() => setConfirming(false)}
          aria-label={confirming ? `Confirm: delete ${item.title}` : `Delete ${item.title}`}
          title={confirming ? "Click again to delete it for good" : "Delete"}
          className={cx(
            "flex h-5 shrink-0 items-center justify-center rounded text-ink3 transition-opacity hover:bg-ink/[0.1] hover:text-ink",
            confirming ? "bg-red/10 px-1.5 text-2xs font-medium text-red opacity-100" : "w-5 opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
          )}
        >
          {confirming ? "Delete?" : <X size={12} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

function AddMenu({ scope }: { scope: string }) {
  const apps = useDeskApps((s) => s.apps);
  const add = useDesk((s) => s.add);
  const list = Object.values(apps);
  return (
    <Menu
      align="start"
      trigger={
        <Button variant="ghost" size="sm" icon aria-label="Add to workspace" onPointerEnter={() => list.forEach((a) => preloadDeskApp(a.id))}>
          <Plus size={16} />
        </Button>
      }
    >
      <MenuLabel>Add to workspace</MenuLabel>
      {list.map((a) => (
        <MenuItem key={a.id} onSelect={() => { void add(scope, a.id); }}>
          <span className="flex items-center gap-2"><a.icon size={14} aria-hidden="true" />{a.title}</span>
        </MenuItem>
      ))}
    </Menu>
  );
}

function SaveBadge({ state, visible }: { state: SaveState; visible: boolean }) {
  if (!visible) return null;
  const label = state === "saved" ? "Saved" : state === "error" ? "Not saved, retrying" : "Saving…";
  return (
    <span className={cx("mr-1 flex items-center gap-1 text-xs", state === "error" ? "text-amber" : "text-ink4")} role="status" aria-live="polite">
      {state === "saved" ? <Check size={12} aria-hidden="true" /> : state === "error" ? <CircleAlert size={12} aria-hidden="true" /> : <span className="h-1.5 w-1.5 animate-dot-pulse rounded-full bg-current" aria-hidden="true" />}
      {label}
    </span>
  );
}

function EmptyDesk({ scope }: { scope: string }) {
  const apps = useDeskApps((s) => s.apps);
  const add = useDesk((s) => s.add);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-ink">Workspace</h3>
        <p className="mx-auto mt-1 max-w-[320px] text-sm text-ink3">A place next to this chat where you and Mercury draw ideas, plan strategy and explain things. Everything here stays with this conversation.</p>
      </div>
      <div className="flex w-full max-w-[320px] flex-col gap-2">
        {Object.values(apps).map((a) => (
          <button
            key={a.id}
            onClick={() => { void add(scope, a.id); }}
            onPointerEnter={() => preloadDeskApp(a.id)}
            onFocus={() => preloadDeskApp(a.id)}
            className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong"
          >
            <a.icon size={18} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-base font-medium text-ink">{a.title}</span>
              <span className="block text-xs text-ink3">{a.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Unreachable({ onRetry }: { onRetry(): void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="max-w-[300px] text-sm text-ink3">The workspace couldn't load. The Mercury you're connected to may be an older version without it, or it is not reachable.</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>
    </div>
  );
}
