import "./excalidraw-env";
import "@excalidraw/excalidraw/index.css";
import { Excalidraw, MainMenu, getSceneVersion } from "@excalidraw/excalidraw";
import { useCallback, useMemo, useRef } from "react";
import type { DeskAppProps } from "../types";
import { buildBoard, DEFAULT_BACKGROUND, readBoard, type BoardElement, type BoardFile } from "./whiteboard";

/**
 * Whiteboard: Excalidraw inside the desk. The desk owns saving; this reports
 * only real changes to the drawing (not scrolling, zooming or selecting).
 */
export default function ExcalidrawApp({ data, theme, change }: DeskAppProps) {
  // The board as it was stored: read once, so typing and drawing never re-seed the editor.
  const initial = useMemo(() => {
    const board = readBoard(data);
    return {
      board,
      initialData: {
        elements: board.elements,
        appState: { viewBackgroundColor: board.appState.viewBackgroundColor, theme },
        files: board.files,
        scrollToContent: board.elements.length > 0,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Excalidraw reports its default white when a board never chose a background; that is not a change.
  const seen = useRef<{ version: number; background: string | undefined } | null>(null);
  if (!seen.current) seen.current = { version: getSceneVersion(initial.board.elements as never), background: initial.board.appState.viewBackgroundColor ?? DEFAULT_BACKGROUND };

  const onChange = useCallback((elements: readonly unknown[], appState: { viewBackgroundColor?: string }, files: unknown) => {
    const version = getSceneVersion(elements as never);
    const background = appState.viewBackgroundColor;
    const last = seen.current!;
    if (version === last.version && background === last.background) return;
    seen.current = { version, background };
    change(() => buildBoard(elements as readonly BoardElement[], files as Record<string, BoardFile>, background));
  }, [change]);

  return (
    <div className="desk-excalidraw h-full w-full">
      <Excalidraw
        initialData={initial.initialData as never}
        onChange={onChange as never}
        theme={theme}
        // The desk sits next to a chat: shortcuts must only act while the board has focus.
        handleKeyboardGlobally={false}
        autoFocus={false}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false } }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.Help />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
