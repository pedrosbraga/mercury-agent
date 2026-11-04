import { afterEach, describe, expect, it, vi } from "vitest";
import { chat } from "./mercury";

/**
 * The desktop app must declare interactive-UI support the same way the web
 * dashboard does, so the runtime will actually emit `mercury-ui` blocks in
 * Chat (Code stays text-only). This locks the request body, not the transport.
 */
describe("chat.send interactive UI capability", () => {
  const sent: Array<{ url: string; init: RequestInit }> = [];

  afterEach(() => {
    sent.length = 0;
    vi.unstubAllGlobals();
  });

  function captureFetch() {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ sent: true, sessionId: "thread-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
  }

  function lastBody(): Record<string, unknown> {
    return JSON.parse(String(sent.at(-1)?.init.body ?? "{}")) as Record<string, unknown>;
  }

  it("declares mercury-ui-v1 for the Chat surface", async () => {
    captureFetch();
    await chat.send("show a form", "thread-1", [], undefined, true);
    expect(sent.at(-1)?.url).toContain("/api/chat/send");
    expect(lastBody().interactiveUi).toBe("mercury-ui-v1");
  });

  it("omits the capability when not asked (Code surface, older path)", async () => {
    captureFetch();
    await chat.send("build this", "thread-1", [], { programming: "auto", cwd: "/tmp/x" });
    expect(lastBody().interactiveUi).toBeUndefined();
    expect(lastBody().programming).toBe("auto");
  });

  it("keeps content, session and attachments beside the capability", async () => {
    captureFetch();
    await chat.send("hi", "t2", [{ name: "a.png", data: "AAAA" }], undefined, true);
    const body = lastBody();
    expect(body.content).toBe("hi");
    expect(body.sessionId).toBe("t2");
    expect(body.interactiveUi).toBe("mercury-ui-v1");
    expect(Array.isArray(body.attachments)).toBe(true);
  });
});
