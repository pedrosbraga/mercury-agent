import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/** One document on the desk, without its data (what the tab strip needs). */
export interface DeskItemMeta {
  id: string;
  app: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  rev: number;
  bytes: number;
}

export interface DeskItem extends DeskItemMeta {
  data: unknown;
}

/**
 * What the desk gives an app. An app owns one document: it renders `data`
 * and calls `change` when the document changes. Saving is the desk's job:
 * debounced, one request at a time, flushed when the tab closes or the
 * window hides. An app never talks to the network.
 */
export interface DeskAppProps {
  /** Stored data as the app last saved it (null for a brand-new item). */
  data: unknown;
  /** Light or dark, following the app's theme. */
  theme: "light" | "dark";
  /**
   * Report that the document changed. Pass a function that builds the data:
   * it runs only when a save is due, so a drag that fires change() sixty times
   * a second costs nothing until the pointer rests.
   */
  change(read: () => unknown): void;
}

/**
 * A desk app: how it is listed and how to load it. Registering one is all it
 * takes to appear in the desk's "+" menu; nothing else in the window changes.
 */
export interface DeskApp {
  /** Stable id, stored with every item ("excalidraw"). Lowercase letters, digits, dots, dashes. */
  id: string;
  /** Shown in the "+" menu and as the default tab title. */
  title: string;
  description: string;
  icon: LucideIcon;
  /** Loaded the first time one is opened, so an app costs nothing until used. */
  load: () => Promise<{ default: ComponentType<DeskAppProps> }>;
  /** Data for a new item; defaults to null. */
  initialData?: () => unknown;
  /** Warm the code in the background after startup, so the first open is instant. Default: false. */
  preload?: boolean;
}
