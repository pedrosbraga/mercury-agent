/**
 * Autosave for one desk item. An app reports changes as often as it likes;
 * this decides when a save really happens.
 *
 *   - waits for `delay` ms of quiet (a drag is not saved mid-stroke),
 *     but never longer than `maxWait` ms after the first unsaved change
 *   - one request in flight; a change that arrives meanwhile is saved right after
 *   - the data is built (`read()`) only when a save is due
 *   - `flush()` saves now: closing a tab, hiding the window
 *   - a failed save is retried with backoff, and the state says so
 */

export type SaveState = "saved" | "dirty" | "saving" | "error";

export interface SaverOptions {
  /** Writes the data; resolves when the runtime has it. */
  write(data: unknown): Promise<void>;
  onState?(state: SaveState): void;
  delay?: number;
  maxWait?: number;
  /** Retry delays after a failed save, in ms; the last one repeats. */
  backoff?: number[];
}

export interface Saver {
  change(read: () => unknown): void;
  flush(): Promise<void>;
  /** Stop timers. Pending changes are written first when `flush` is true. */
  dispose(flush: boolean): Promise<void>;
  state(): SaveState;
}

export function createSaver(opts: SaverOptions): Saver {
  const delay = opts.delay ?? 800;
  const maxWait = opts.maxWait ?? 5000;
  const backoff = opts.backoff ?? [2000, 5000, 15000];
  let read: (() => unknown) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt = 0;
  let inflight: Promise<void> | null = null;
  let failures = 0;
  let disposed = false;
  let state: SaveState = "saved";

  const set = (s: SaveState) => {
    if (s === state) return;
    state = s;
    opts.onState?.(s);
  };

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const arm = (ms: number) => {
    clear();
    timer = setTimeout(() => { timer = null; void run(); }, ms);
  };

  async function run(): Promise<void> {
    if (inflight) return inflight;
    if (!read) return;
    const take = read;
    read = null;
    firstDirtyAt = 0;
    set("saving");
    inflight = (async () => {
      try {
        await opts.write(take());
        failures = 0;
      } catch {
        // Keep what failed unless something newer already replaced it.
        if (!read) read = take;
        failures += 1;
        set("error");
        if (!disposed) arm(backoff[Math.min(failures - 1, backoff.length - 1)] ?? 15000);
        return;
      }
      if (read) {
        // Changed while saving: go again without waiting for quiet.
        set("dirty");
        if (!disposed) arm(0);
      } else {
        set("saved");
      }
    })().finally(() => { inflight = null; });
    return inflight;
  }

  return {
    change(next) {
      if (disposed) return;
      read = next;
      if (!firstDirtyAt) firstDirtyAt = Date.now();
      if (inflight) return;
      if (state !== "error") set("dirty");
      const waited = Date.now() - firstDirtyAt;
      arm(Math.max(0, Math.min(delay, maxWait - waited)));
    },
    async flush() {
      clear();
      if (inflight) await inflight;
      if (read) await run();
    },
    async dispose(flush) {
      clear();
      if (flush) {
        if (inflight) await inflight;
        if (read) await run();
      }
      disposed = true;
      clear();
    },
    state: () => state,
  };
}
