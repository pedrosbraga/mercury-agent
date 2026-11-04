// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "~/views/chat/Composer";
import { conversations } from "~/app/conversation";
import { useRuntimeState } from "~/app/store";
import { TooltipProvider } from "~/components/ui/Tooltip";

const send = vi.fn();
vi.mock("~/app/events", () => ({ sendMessage: (...args: unknown[]) => send(...args), stopTurn: vi.fn() }));
vi.mock("~/api/mercury", () => ({ chat: { commands: async () => [], models: async () => ({ providers: [] }) } }));
vi.mock("~/app/permission", () => ({ usePermissionMode: () => ({ allowAll: false, setAllowAll: vi.fn() }) }));
vi.mock("~/app/voice", () => ({ useVoice: () => false, startCall: vi.fn() }));
vi.mock("~/components/dictation/Dictation", () => ({
  useDictation: () => ({ phase: "idle" }), DictationNotice: () => null, MicButton: () => null, RecordingBar: () => null, joinText: (a: string, b: string) => `${a} ${b}`,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });

describe("UI draft composer integration", () => {
  it("appends previews, gives explicit feedback, and sends only after owner confirmation", async () => {
    const store = conversations.chat;
    store.getState().setActive("owner-chat"); store.getState().setLoading(false);
    useRuntimeState.getState().setConnected(true);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(TooltipProvider, { children: createElement(Composer, { surface: "chat", placeholder: "Message" }) })));
    const input = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Existing draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const epoch = store.getState().uiEpoch;
    await act(async () => { expect(store.getState().previewUiDraft("owner-chat", epoch, "Widget preview")).toBe(true); });
    expect(input.value).toBe("Existing draft\n\nWidget preview");
    expect(container.textContent).toContain("Nothing was sent");
    expect(store.getState().uiDraft).toBeNull(); expect(send).not.toHaveBeenCalled();
    await act(async () => (container.querySelector('[aria-label="Send"]') as HTMLButtonElement).click());
    expect(send).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledWith("chat", "Existing draft\n\nWidget preview", [], undefined);
    expect(container.textContent).not.toContain("UI preview added to your draft");
    send.mockClear();
    await act(async () => (container.querySelector('[aria-label="Open interactive UI examples"]') as HTMLButtonElement).click());
    expect(input.value).toBe(""); expect(send).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Illustrative data only");
    expect(document.querySelector('[role="dialog"] [role="tablist"]')).not.toBeNull();
    await act(async () => (document.querySelector('[role="dialog"] [aria-label="Close"]') as HTMLButtonElement).click());
    await act(async () => { store.getState().setActive("another-chat"); });
    await act(async () => { expect(store.getState().previewUiDraft("owner-chat", epoch, "STALE")).toBe(false); });
    expect(input.value).not.toContain("STALE");
    await act(async () => root.unmount()); container.remove();
  });
});
