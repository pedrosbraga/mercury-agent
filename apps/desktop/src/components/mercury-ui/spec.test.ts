import { describe, expect, it } from "vitest";
import { isClosedUiFence, MAX_UI_BYTES, validateUiSpec } from "./spec";
import { mercuryUiDemo } from "./demo";

const simple = () => ({ root: "a", elements: { a: { type: "Text", props: { text: "Safe" } } } });
const valid = (value: unknown) => validateUiSpec(JSON.stringify(value)).ok;
describe("static Mercury UI contract", () => {
  it("accepts all nine demo components", () => expect(valid(mercuryUiDemo)).toBe(true));
  it("accepts literal HTML/URLs as inert text", () => {
    const s = simple(); s.elements.a.props.text = '<script>alert(1)</script> https://example.com $state.secret';
    expect(valid(s)).toBe(true);
  });
  it.each([
    { ...simple(), state: {} },
    { root: "a", elements: { a: { type: "Unknown", props: {} } } },
    { root: "a", elements: { a: { type: "Text", props: { text: "x", onClick: "send" } } } },
    { root: "a", elements: { a: { type: "Text", props: { text: "x" }, on: { press: { action: "send" } } } } },
    { root: "a", elements: { a: { type: "Text", props: { text: { $state: "/secret" } } } } },
    { root: "a", elements: { a: { type: "Button", props: { label: "Go", message: "hi", href: "https://example.com" } } } },
    { root: "a", elements: { a: { type: "Card", props: { title: "A" }, children: ["missing"] } } },
    { root: "a", elements: { a: { type: "Card", props: { title: "A" }, children: ["a"] } } },
    { root: "missing", elements: simple().elements },
    { root: "a", elements: { ...simple().elements, b: simple().elements.a } },
    { root: "a", elements: { a: { type: "Card", props: { title: "A" }, children: ["b", "b"] }, b: simple().elements.a } },
    { root: "a", elements: { a: { type: "Table", props: { columns: ["A"], rows: [["1", "2"]] } } } },
    { root: "a", elements: { a: { type: "Form", props: { title: "A", fields: [{ name: "x", label: "X", type: "select" }] } } } },
    { root: "a", elements: { a: { type: "BarChart", props: { items: [{ label: "A", value: -1 }] } } } },
  ])("rejects unsafe or malformed specs %#", (s) => expect(valid(s)).toBe(false));
  it("rejects prototype/dynamic keys at any depth", () => {
    for (const key of ["__proto__", "constructor", "prototype", "$bind", "$expr"]) {
      expect(validateUiSpec(`{"root":"a","elements":{"a":{"type":"Text","props":{"text":"x","${key}":{}}}}}`).ok).toBe(false);
    }
  });
  it("bounds UTF-8 size before parsing", () => {
    expect(validateUiSpec(" ".repeat(MAX_UI_BYTES + 1)).ok).toBe(false);
    const s = simple(); s.elements.a.props.text = "🌍".repeat(MAX_UI_BYTES / 4);
    expect(valid(s)).toBe(false);
  });
  it("bounds nodes and tree depth", () => {
    function tree(count: number, chain = false) {
      const elements: Record<string, unknown> = {};
      for (let i = 0; i < count; i++) elements[`n${i}`] = { type: "Card", props: { title: "A" }, children: chain ? (i + 1 < count ? [`n${i + 1}`] : []) : (i === 0 ? Array.from({ length: count - 1 }, (_, j) => `n${j + 1}`) : []) };
      return { root: "n0", elements };
    }
    expect(valid(tree(80))).toBe(true);
    expect(valid(tree(81))).toBe(false);
    expect(valid(tree(12, true))).toBe(true);
    expect(valid(tree(13, true))).toBe(false);
    expect(validateUiSpec("[".repeat(10000) + "]".repeat(10000)).ok).toBe(false);
  });
  it("requires real matching backtick fence closure, not parser EOF recovery", () => {
    expect(isClosedUiFence('```mercury-ui\n{}\n```')).toBe(true);
    expect(isClosedUiFence('````mercury-ui\n{}\n`````')).toBe(true);
    for (const source of ['```mercury-ui\n{}', '````mercury-ui\n{}\n```', '```mercury-ui\n{}\n~~~', '```mercury-ui\n{"text":"```"}']) expect(isClosedUiFence(source)).toBe(false);
  });
});
