import ReactDOM from "react-dom/client";
import "./styles/base.css";
import "./app/theme";
import { TooltipProvider } from "~/components/ui/Tooltip";
import { ChatView } from "~/views/chat/ChatView";
import { registerBuiltinDeskApps } from "~/desk/builtin";
import { preloadWhenIdle } from "~/desk/registry";
import { useRuntimeState } from "~/app/store";

// An in-memory runtime for the desk routes; everything else answers empty.
const store: Record<string, Record<string, any>> = (window as any).__store = JSON.parse(sessionStorage.getItem("h") ?? "{}");
const log: string[] = (window as any).__log = [];
const persist = () => sessionStorage.setItem("h", JSON.stringify(store));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
  const method = (init?.method ?? "GET").toUpperCase();
  const m = url.pathname.match(/^\/api\/desk\/([^/]+)(?:\/items(?:\/([^/]+))?|\/adopt)?$/);
  if (m) {
    const [, scope, id] = m;
    const body = init?.body ? JSON.parse(init.body as string) : {};
    log.push(`${method} ${url.pathname}${body.data ? ` (${JSON.stringify(body.data).length}b)` : ""}`);
    const sc = (store[scope] ??= {});
    if (method === "GET" && !id) return json({ items: Object.values(sc).map(({ data, ...meta }: any) => meta) });
    if (method === "POST" && url.pathname.endsWith("/items")) { const it = { id: "i" + Date.now().toString(36), app: body.app, title: body.title, createdAt: Date.now(), updatedAt: Date.now(), rev: 1, bytes: 1, data: body.data }; sc[it.id] = it; persist(); const { data, ...meta } = it; return json({ item: meta }); }
    if (method === "GET") return sc[id] ? json({ item: sc[id] }) : json({ error: "Not found" }, 404);
    if (method === "PUT") { const it = sc[id]; if (!it) return json({ error: "Not found" }, 404); if (body.baseRev !== undefined && body.baseRev !== it.rev) return json({ error: "stale" }, 409); if (body.data !== undefined) it.data = body.data; if (body.title) it.title = body.title; it.rev++; persist(); const { data, ...meta } = it; return json({ item: meta }); }
    if (method === "DELETE") { delete sc[id]; persist(); return json({ deleted: true }); }
  }
  return json(url.pathname.endsWith("/threads") ? { threads: [] } : url.pathname.includes("threads") ? [] : {});
};
useRuntimeState.getState().setConnected(true);
registerBuiltinDeskApps();
preloadWhenIdle();
ReactDOM.createRoot(document.getElementById("root")!).render(<TooltipProvider><div className="flex h-full bg-bg text-ink"><main className="relative flex min-w-0 flex-1 flex-col"><ChatView /></main></div></TooltipProvider>);
