import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  adopt: vi.fn(),
}));
vi.mock("~/api/mercury", () => ({ desk: api }));

import { clampWidth, DRAFT, needsOverlay, flushSavers, loadItem, MIN_CHAT, MIN_WIDTH, registerSaver, remember, resetDeskCache, useDesk } from "./store";
import { registerDeskApp } from "./registry";
import type { DeskItemMeta } from "./types";

const meta = (id: string, over: Partial<DeskItemMeta> = {}): DeskItemMeta => ({ id, app: "excalidraw", title: id, createdAt: 1, updatedAt: 1, rev: 1, bytes: 10, ...over });

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  useDesk.setState({ scopes: {}, open: false });
  resetDeskCache();
  registerDeskApp({ id: "excalidraw", title: "Whiteboard", description: "", icon: (() => null) as never, load: async () => ({ default: () => null }), initialData: () => ({ type: "excalidraw" }) });
});

describe("clampWidth", () => {
  it("keeps the desk at least MIN_WIDTH and leaves the chat at least MIN_CHAT", () => {
    expect(clampWidth(100, 1400)).toBe(MIN_WIDTH);
    expect(clampWidth(5000, 1400)).toBe(1400 - MIN_CHAT);
    expect(clampWidth(640, 1400)).toBe(640);
  });
  it("never goes below MIN_WIDTH even in a tiny window", () => {
    expect(clampWidth(500, 500)).toBe(MIN_WIDTH);
  });
});

describe("desk store", () => {
  it("loads a scope and selects the newest item, keeping a still-valid selection on reload", async () => {
    api.list.mockResolvedValue([meta("a"), meta("b")]);
    await useDesk.getState().load("t1");
    expect(useDesk.getState().scopes.t1).toMatchObject({ load: "ready", activeId: "b" });
    useDesk.getState().select("t1", "a");
    await useDesk.getState().load("t1");
    expect(useDesk.getState().scopes.t1.activeId).toBe("a");
  });

  it("keeps showing its items when a reload fails, and reports an error only when it has none", async () => {
    api.list.mockResolvedValueOnce([meta("a")]).mockRejectedValue(new Error("down"));
    await useDesk.getState().load("t1");
    await useDesk.getState().load("t1");
    expect(useDesk.getState().scopes.t1).toMatchObject({ load: "ready" });
    await useDesk.getState().load("t2");
    expect(useDesk.getState().scopes.t2.load).toBe("error");
  });

  it("adds an item of an app with a numbered title and the app's starting data", async () => {
    api.create.mockImplementation(async (_s: string, b: { title: string }) => meta(`n-${b.title}`, { title: b.title }));
    const first = await useDesk.getState().add("t1", "excalidraw");
    const second = await useDesk.getState().add("t1", "excalidraw");
    expect(first?.title).toBe("Whiteboard");
    expect(second?.title).toBe("Whiteboard 2");
    expect(api.create).toHaveBeenCalledWith("t1", expect.objectContaining({ app: "excalidraw", data: { type: "excalidraw" } }));
    expect(useDesk.getState().scopes.t1.activeId).toBe(second?.id);
    expect(await useDesk.getState().add("t1", "unknown")).toBeNull();
  });

  it("removes an item, moves selection to a neighbour, and restores state if the server refuses", async () => {
    api.list.mockResolvedValue([meta("a"), meta("b"), meta("c")]);
    await useDesk.getState().load("t1");
    useDesk.getState().select("t1", "b");
    api.remove.mockResolvedValue({ deleted: true });
    await useDesk.getState().remove("t1", "b");
    expect(useDesk.getState().scopes.t1.items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(useDesk.getState().scopes.t1.activeId).toBe("c");
    api.remove.mockRejectedValue(new Error("no"));
    api.list.mockResolvedValue([meta("a"), meta("c")]);
    await useDesk.getState().remove("t1", "a");
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("renames optimistically and rolls back on failure", async () => {
    api.list.mockResolvedValue([meta("a", { title: "Old" })]);
    await useDesk.getState().load("t1");
    api.save.mockResolvedValue(meta("a", { title: "New", rev: 2 }));
    await useDesk.getState().rename("t1", "a", "  New ");
    expect(useDesk.getState().scopes.t1.items[0]).toMatchObject({ title: "New", rev: 2 });
    api.save.mockRejectedValue(new Error("no"));
    await useDesk.getState().rename("t1", "a", "Other");
    expect(useDesk.getState().scopes.t1.items[0].title).toBe("New");
  });

  it("adopts the draft desk into a new chat, flushing unsaved work first and moving the cache", async () => {
    api.list.mockResolvedValue([meta("a")]);
    await useDesk.getState().load(DRAFT);
    remember(DRAFT, "a", 1, { drawn: true });
    const order: string[] = [];
    registerSaver({ flush: async () => { order.push("flush"); }, change() {}, dispose: async () => {}, state: () => "saved" });
    api.adopt.mockImplementation(async () => { order.push("adopt"); return { moved: 1 }; });
    await useDesk.getState().adopt("thread-1");
    expect(order).toEqual(["flush", "adopt"]);
    expect(useDesk.getState().scopes["thread-1"].items.map((i) => i.id)).toEqual(["a"]);
    expect(useDesk.getState().scopes[DRAFT].items).toEqual([]);
    expect(await loadItem("thread-1", meta("a"))).toMatchObject({ data: { drawn: true } });
    expect(api.get).not.toHaveBeenCalled();
  });

  it("does not touch the server when the draft desk is empty", async () => {
    await useDesk.getState().adopt("thread-1");
    expect(api.adopt).not.toHaveBeenCalled();
  });

  it("flushSavers survives a saver that throws", async () => {
    registerSaver({ flush: async () => { throw new Error("x"); }, change() {}, dispose: async () => {}, state: () => "error" });
    await expect(flushSavers()).resolves.toBeUndefined();
  });
});

describe("item cache", () => {
  it("serves a cached copy while its rev matches and refetches when it does not", async () => {
    api.get.mockResolvedValue({ ...meta("a", { rev: 3 }), data: { v: 3 } });
    remember("t1", "a", 2, { v: 2 });
    expect((await loadItem("t1", meta("a", { rev: 2 }))).data).toEqual({ v: 2 });
    expect(api.get).not.toHaveBeenCalled();
    expect((await loadItem("t1", meta("a", { rev: 3 }))).data).toEqual({ v: 3 });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("keeps the cache bounded", async () => {
    for (let i = 0; i < 30; i++) remember("t1", `i${i}`, 1, i);
    api.get.mockResolvedValue({ ...meta("i0"), data: "fresh" });
    expect((await loadItem("t1", meta("i0"))).data).toBe("fresh");
  });
});

describe("desk layout", () => {
  it("sits beside the chat only while the chat keeps MIN_CHAT and the desk MIN_WIDTH", () => {
    const need = MIN_CHAT + MIN_WIDTH;
    expect(needsOverlay(300 + need, 300)).toBe(false);
    expect(needsOverlay(300 + need - 1, 300)).toBe(true);
    expect(needsOverlay(need, 0)).toBe(false);
    expect(needsOverlay(1000, 300)).toBe(true);
    expect(needsOverlay(1600, 300)).toBe(false);
  });
});
