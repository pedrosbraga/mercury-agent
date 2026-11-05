import { describe, expect, it } from "vitest";
import { deskAppComponent, getDeskApp, listDeskApps, registerDeskApp } from "./registry";

const app = (id: string) => ({ id, title: id, description: "", icon: (() => null) as never, load: async () => ({ default: () => null }) });

describe("desk app registry", () => {
  it("registers, lists and unregisters an app", () => {
    const off = registerDeskApp(app("notes"));
    expect(getDeskApp("notes")?.title).toBe("notes");
    expect(listDeskApps().map((a) => a.id)).toContain("notes");
    off();
    expect(getDeskApp("notes")).toBeUndefined();
  });

  it("refuses ids that could not be stored", () => {
    expect(() => registerDeskApp(app("Bad Id"))).toThrow();
    expect(() => registerDeskApp(app(""))).toThrow();
  });

  it("hands React the same component every time, and null for unknown apps", () => {
    registerDeskApp(app("table"));
    expect(deskAppComponent("table")).toBe(deskAppComponent("table"));
    expect(deskAppComponent("ghost")).toBeNull();
  });
});
