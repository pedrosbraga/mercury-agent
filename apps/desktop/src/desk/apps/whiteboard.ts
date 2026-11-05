/**
 * The stored shape of a whiteboard: Excalidraw's own `.excalidraw` JSON
 * (type, version, elements, appState, files). Keeping it standard means the
 * file opens in any Excalidraw, and Mercury can read and write it as plain JSON.
 */

export interface BoardElement { id: string; type: string; isDeleted?: boolean; fileId?: string | null; version?: number; [k: string]: unknown }
export interface BoardFile { id: string; dataURL?: string; mimeType?: string; created?: number; [k: string]: unknown }

export interface Board {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: BoardElement[];
  appState: { viewBackgroundColor?: string };
  files: Record<string, BoardFile>;
}

export const SOURCE = "mercury-desk";
/** What Excalidraw uses when a board never picked a background. */
export const DEFAULT_BACKGROUND = "#ffffff";

export function emptyBoard(): Board {
  return { type: "excalidraw", version: 2, source: SOURCE, elements: [], appState: {}, files: {} };
}

/** Whatever was stored, as a board. Anything unreadable becomes an empty board rather than an error. */
export function readBoard(data: unknown): Board {
  const d = (data && typeof data === "object" ? data : {}) as Partial<Board>;
  return {
    type: "excalidraw",
    version: 2,
    source: typeof d.source === "string" ? d.source : SOURCE,
    elements: Array.isArray(d.elements) ? d.elements.filter((e): e is BoardElement => !!e && typeof e === "object" && typeof (e as BoardElement).id === "string") : [],
    appState: d.appState && typeof d.appState === "object" ? { viewBackgroundColor: typeof d.appState.viewBackgroundColor === "string" ? d.appState.viewBackgroundColor : undefined } : {},
    files: d.files && typeof d.files === "object" ? (d.files as Board["files"]) : {},
  };
}

/** What to save: live elements only, and only the image files they still use. */
export function buildBoard(elements: readonly BoardElement[], files: Record<string, BoardFile>, viewBackgroundColor?: string): Board {
  const live = elements.filter((e) => !e.isDeleted);
  const used: Record<string, BoardFile> = {};
  for (const e of live) {
    if (e.type !== "image" || !e.fileId) continue;
    const f = files[e.fileId];
    // A file still being read has no dataURL yet; saving it would store an empty picture.
    if (f && typeof f.dataURL === "string") used[e.fileId] = f;
  }
  return { type: "excalidraw", version: 2, source: SOURCE, elements: live, appState: viewBackgroundColor ? { viewBackgroundColor } : {}, files: used };
}
