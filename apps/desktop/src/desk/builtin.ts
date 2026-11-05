import { PenTool } from "lucide-react";
import { registerDeskApp } from "./registry";
import { emptyBoard } from "./apps/whiteboard";

let done = false;

/**
 * The apps that ship with Mercury. They register exactly as a later one would:
 * a new app is one `registerDeskApp({ … })` call and nothing else in the window changes.
 */
export function registerBuiltinDeskApps(): void {
  if (done) return;
  done = true;
  registerDeskApp({
    id: "excalidraw",
    title: "Whiteboard",
    description: "Sketch ideas, strategies and explanations together.",
    icon: PenTool,
    // A separate chunk: the editor is downloaded and parsed only when it is wanted.
    load: () => import("./apps/ExcalidrawApp"),
    initialData: emptyBoard,
  });
}
