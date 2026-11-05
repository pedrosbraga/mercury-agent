import { useEffect, useState } from "react";
import { conversations } from "~/app/conversation";
import * as api from "~/api/mercury";

/**
 * The suggestion belongs to one finished reply: the key names it. No key while
 * the chat is empty, loading, working, or ends on your own message.
 */
export function nextStepKey(s: { activeId: string | null; lastId?: string; lastRole?: string; idle: boolean }): string | null {
  return s.activeId && s.lastId && s.idle && s.lastRole === "assistant" ? `${s.activeId}:${s.lastId}` : null;
}

/** Wait for the reply to settle (ids swap when the saved copy loads), then one retry if the runtime was still busy. */
const SETTLE_MS = 600;
const RETRY_MS = 2500;

/** The next message you could send, to show as the chat box's placeholder; null when there is none. */
export function useNextStep(): string | null {
  const store = conversations.chat;
  const activeId = store((s) => s.activeId);
  const messages = store((s) => s.messages);
  const streaming = store((s) => s.streaming);
  const loading = store((s) => s.loading);
  const agent = store((s) => s.agent);
  const waiting = store((s) => s.waiting);
  const last = messages[messages.length - 1];
  const idle = !streaming && !loading && !waiting && agent !== "thinking" && agent !== "working" && agent !== "streaming";
  const key = nextStepKey({ activeId, lastId: last?.id, lastRole: last?.role, idle });
  const [got, setGot] = useState<{ key: string; text: string | null } | null>(null);

  useEffect(() => {
    if (!key || !activeId) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ask = (retry: boolean) => {
      api.chat.suggestion(activeId).then((r) => {
        if (!alive) return;
        const text = r.suggestion?.trim() || null;
        if (text || !retry) setGot({ key, text });
        else timers.push(setTimeout(() => ask(false), RETRY_MS));
      }).catch(() => { if (alive) setGot({ key, text: null }); });
    };
    timers.push(setTimeout(() => ask(true), SETTLE_MS));
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [key, activeId]);

  return key && got?.key === key ? got.text : null;
}
