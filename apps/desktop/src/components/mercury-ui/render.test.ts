// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MercuryUI } from "./MercuryUI";
import { Markdown } from "../Markdown";
import { mercuryUiDemo } from "./demo";
import { conversations } from "~/app/conversation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const raw = JSON.stringify(mercuryUiDemo);
const fence = `\`\`\`mercury-ui\n${raw}\n\`\`\``;
const noop = () => false;
afterEach(() => document.body.replaceChildren());
describe("actual json-render Renderer on React 18", () => {
  it("SSR renders the complete catalog and escapes untrusted text", () => {
    const html = renderToStaticMarkup(createElement(MercuryUI, { raw, onPreview: noop }));
    for (const fragment of ["Mercury UI examples", 'role="tablist"', "<details", "<table", "<form", 'type="date"', "Preview follow-up", "never send"]) expect(html).toContain(fragment);
    const escaped = renderToStaticMarkup(createElement(MercuryUI, { raw: JSON.stringify({ root: "a", elements: { a: { type: "Text", props: { text: '<img src=x onerror="alert(1)">' } } } }), onPreview: noop }));
    expect(escaped).not.toContain("<img"); expect(escaped).toContain("&lt;img");
  });
  it("Markdown is inert by default, activates only with explicit opt-in and closure", () => {
    expect(renderToStaticMarkup(createElement(Markdown, { text: fence }))).not.toContain('aria-label="Interactive Mercury UI"');
    expect(renderToStaticMarkup(createElement(Markdown, { text: fence, uiPreview: noop }))).toContain('aria-label="Interactive Mercury UI"');
    const incomplete = renderToStaticMarkup(createElement(Markdown, { text: fence.slice(0, -4), streaming: true, uiPreview: noop }));
    expect(incomplete).toContain("waiting for a closing fence"); expect(incomplete).not.toContain("<form");
    expect(renderToStaticMarkup(createElement(Markdown, { text: fence, streaming: true, uiPreview: noop }))).toContain("<form");
  });
  it("keeps local state when prose continues streaming after a closed UI block", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(Markdown, { text: fence, streaming: true, uiPreview: noop })));
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => tabs[1].click());
    const input = container.querySelector<HTMLInputElement>('input[name="topic"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Keep this draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => root.render(createElement(Markdown, { text: `${fence}\n\nAdditional prose`, streaming: true, uiPreview: noop })));
    expect(container.querySelector('input[name="topic"]')).toBe(input);
    expect(input.value).toBe("Keep this draft");
    expect(container.querySelectorAll('[role="tab"]')[1].getAttribute("aria-selected")).toBe("true");
    await act(async () => root.unmount());
  });
  it("invalid JSON stays inert with an explanation", () => {
    const html = renderToStaticMarkup(createElement(MercuryUI, { raw: '{"root":"a","elements":{"a":{"type":"iframe","props":{}}}}', onPreview: noop }));
    expect(html).toContain("Interactive UI not rendered"); expect(html).toContain("<pre><code>"); expect(html).not.toContain("<iframe");
  });
  it("tabs change locally; button and form preview literal text, never send", async () => {
    const preview = vi.fn(() => true);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(MercuryUI, { raw, onPreview: preview })));
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => tabs[1].click());
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(container.querySelectorAll<HTMLElement>('[role="tabpanel"]')[1].hidden).toBe(false);
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Preview follow-up")!;
    await act(async () => button.click());
    expect(preview).toHaveBeenLastCalledWith("Help me review the remaining tasks.");
    expect(container.textContent).toContain("Nothing was sent");
    const input = container.querySelector<HTMLInputElement>('input[name="topic"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Security review");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(preview).toHaveBeenLastCalledWith("Plan a review\nTopic: Security review\nItems: \nDate: \nPriority: ");
    expect(preview).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });
  it("supports tab keyboard navigation and local table filtering and natural sorting", async () => {
    const preview = vi.fn(() => true);
    const table = { root: "a", elements: { a: { type: "Card", props: { title: "Local exploration" }, children: ["tabs", "table"] }, tabs: mercuryUiDemo.elements.tabs, table: { type: "Table", props: { columns: ["Task", "Count"], rows: [["Beta", "10"], ["Alpha", "2"], ["Gamma", "1"]] } } } };
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(MercuryUI, { raw: JSON.stringify(table), onPreview: preview })));
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]); expect(tabs[1].tabIndex).toBe(0); expect(tabs[0].tabIndex).toBe(-1);
    await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(document.activeElement).toBe(tabs[0]);
    const count = container.querySelectorAll<HTMLButtonElement>("th button")[1];
    await act(async () => count.click());
    expect([...container.querySelectorAll("tbody tr")].map((r) => r.textContent)).toEqual(["Gamma1", "Alpha2", "Beta10"]);
    expect(count.parentElement?.getAttribute("aria-sort")).toBe("ascending");
    await act(async () => count.click());
    expect(container.querySelector("tbody tr")?.textContent).toBe("Beta10");
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "ALPHA");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("tbody tr").length).toBe(1);
    expect(container.textContent).toContain("1 of 3 rows");
    expect(preview).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
  it("rejects stale chat callbacks even after leaving and returning to the same ID", async () => {
    const store = conversations.chat;
    store.getState().setActive("old"); store.getState().setLoading(false);
    const epoch = store.getState().uiEpoch;
    const preview = (text: string) => store.getState().previewUiDraft("old", epoch, text);
    expect(preview("first")).toBe(true);
    store.getState().setActive("new");
    expect(preview("stale")).toBe(false); expect(store.getState().uiDraft).toBeNull();
    store.getState().setActive("old"); expect(preview("still stale")).toBe(false);
    store.getState().setLoading(true);
    expect(store.getState().previewUiDraft("old", store.getState().uiEpoch, "loading")).toBe(false);
    expect(conversations.code.getState().previewUiDraft(null, 0, "wrong surface")).toBe(false);
    const container = document.createElement("div"); const root = createRoot(container);
    await act(async () => root.render(createElement(MercuryUI, { raw, onPreview: preview })));
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Preview follow-up")!.click());
    expect(container.textContent).toContain("no longer the current chat");
    await act(async () => root.unmount());
  });
});
