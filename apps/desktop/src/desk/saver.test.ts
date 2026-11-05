import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaver, type SaveState } from "./saver";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup(write = vi.fn(async (_d: unknown) => {})) {
  const states: SaveState[] = [];
  const saver = createSaver({ write, onState: (s) => states.push(s), delay: 800, maxWait: 5000, backoff: [1000, 3000] });
  return { saver, write, states };
}

describe("desk saver", () => {
  it("waits for quiet, reads the data only when saving, and saves once for a burst", async () => {
    const { saver, write, states } = setup();
    const read = vi.fn(() => ({ n: 3 }));
    saver.change(() => ({ n: 1 }));
    saver.change(() => ({ n: 2 }));
    saver.change(read);
    expect(write).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(799);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ n: 3 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["dirty", "saving", "saved"]);
  });

  it("never waits longer than maxWait while changes keep coming", async () => {
    const { saver, write } = setup();
    for (let i = 0; i < 20; i++) {
      saver.change(() => i);
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(write.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(write.mock.calls[0][0]).toBeLessThan(12);
  });

  it("saves a change that arrives during a save right after it, one request at a time", async () => {
    let release!: () => void;
    let active = 0;
    let peak = 0;
    const write = vi.fn(async (_d: unknown) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise<void>((r) => { release = r; });
      active -= 1;
    });
    const { saver } = setup(write);
    saver.change(() => "a");
    await vi.advanceTimersByTimeAsync(900);
    expect(write).toHaveBeenCalledTimes(1);
    saver.change(() => "b");
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith("b");
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(peak).toBe(1);
    expect(saver.state()).toBe("saved");
  });

  it("flush saves immediately and does nothing when there is nothing to save", async () => {
    const { saver, write } = setup();
    await saver.flush();
    expect(write).not.toHaveBeenCalled();
    saver.change(() => "x");
    await saver.flush();
    expect(write).toHaveBeenCalledWith("x");
    expect(saver.state()).toBe("saved");
  });

  it("reports an error, retries with backoff and keeps the data until it lands", async () => {
    const write = vi.fn(async (_d: unknown) => {});
    write.mockRejectedValueOnce(new Error("offline"));
    const { saver, states } = setup(write);
    saver.change(() => "keep");
    await vi.advanceTimersByTimeAsync(900);
    expect(saver.state()).toBe("error");
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith("keep");
    expect(saver.state()).toBe("saved");
    expect(states).toContain("error");
  });

  it("a newer change replaces data that failed to save", async () => {
    const write = vi.fn(async (_d: unknown) => {});
    write.mockRejectedValueOnce(new Error("offline"));
    const { saver } = setup(write);
    saver.change(() => "old");
    await vi.advanceTimersByTimeAsync(900);
    saver.change(() => "new");
    await vi.advanceTimersByTimeAsync(900);
    expect(write).toHaveBeenLastCalledWith("new");
  });

  it("dispose(true) writes what is pending, then ignores further changes", async () => {
    const { saver, write } = setup();
    saver.change(() => "last");
    await saver.dispose(true);
    expect(write).toHaveBeenCalledWith("last");
    saver.change(() => "after");
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
