import { describe, expect, it } from "vitest";
import { buildBoard, emptyBoard, readBoard } from "./apps/whiteboard";

describe("whiteboard data", () => {
  it("reads anything as a board, never throwing", () => {
    expect(readBoard(null)).toEqual(emptyBoard());
    expect(readBoard("nope").elements).toEqual([]);
    expect(readBoard({ elements: [{ id: "a", type: "rectangle" }, null, 4, { type: "x" }] }).elements).toEqual([{ id: "a", type: "rectangle" }]);
    expect(readBoard({ appState: { viewBackgroundColor: 3 } }).appState).toEqual({ viewBackgroundColor: undefined });
  });

  it("saves live elements only, as a standard .excalidraw document", () => {
    const b = buildBoard([{ id: "a", type: "rectangle" }, { id: "b", type: "ellipse", isDeleted: true }], {}, "#fff");
    expect(b).toMatchObject({ type: "excalidraw", version: 2, appState: { viewBackgroundColor: "#fff" } });
    expect(b.elements.map((e) => e.id)).toEqual(["a"]);
  });

  it("keeps only the image files that live elements use and that finished loading", () => {
    const files = {
      f1: { id: "f1", dataURL: "data:image/png;base64,AA" },
      f2: { id: "f2", dataURL: "data:image/png;base64,BB" },
      f3: { id: "f3" },
    };
    const b = buildBoard([
      { id: "i1", type: "image", fileId: "f1" },
      { id: "i2", type: "image", fileId: "f2", isDeleted: true },
      { id: "i3", type: "image", fileId: "f3" },
    ], files);
    expect(Object.keys(b.files)).toEqual(["f1"]);
  });

  it("round-trips", () => {
    const b = buildBoard([{ id: "a", type: "text", text: "hi" }], {}, "#eee");
    expect(readBoard(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });
});
