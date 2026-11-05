import { clampWidth } from "./store";

/**
 * Drag-to-resize for the desk's left edge, without re-rendering anything while
 * the pointer moves: the width goes straight onto the element, and React only
 * hears about it when the drag ends. `room` is what the chat and the desk
 * share, measured once at the start.
 */
export function startResize(opts: {
  panel: HTMLElement;
  startX: number;
  startWidth: number;
  room: number;
  onDone(width: number): void;
  onFrozen(frozen: boolean): void;
}): { move(clientX: number): void; end(): void } {
  const { panel, startX, startWidth, room } = opts;
  let width = startWidth;
  opts.onFrozen(true);
  return {
    move(clientX) {
      width = clampWidth(startWidth + (startX - clientX), room);
      panel.style.flexBasis = `${width}px`;
    },
    end() {
      opts.onFrozen(false);
      opts.onDone(width);
    },
  };
}
