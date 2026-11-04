// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Attachments } from "./Attachments";
import type { MessageAttachment } from "~/api/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(el: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(el));
  return container;
}

describe("Attachments media viewer", () => {
  it("renders a video as an inline <video> player, never a file chip", async () => {
    const att: MessageAttachment = { name: "clip.mp4", kind: "video", mime: "video/mp4", src: "blob:clip" };
    const c = await render(createElement(Attachments, { items: [att] }));
    const video = c.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("blob:clip");
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(c.textContent).toContain("clip.mp4");
    expect(c.textContent).not.toContain("PDF");
  });

  it("detects a video by mime even when kind is generic", async () => {
    const att: MessageAttachment = { name: "clip.mov", kind: "document", mime: "video/quicktime", src: "blob:mov" };
    const c = await render(createElement(Attachments, { items: [att] }));
    expect(c.querySelector("video")).not.toBeNull();
  });

  it("still renders a PDF as a file chip", async () => {
    const att: MessageAttachment = { name: "doc.pdf", kind: "document", mime: "application/pdf" };
    const c = await render(createElement(Attachments, { items: [att] }));
    expect(c.querySelector("video")).toBeNull();
    expect(c.textContent).toContain("PDF");
  });

  it("renders an image as a thumbnail", async () => {
    const att: MessageAttachment = { name: "pic.png", kind: "image", mime: "image/png", src: "data:image/png;base64,AA==" };
    const c = await render(createElement(Attachments, { items: [att] }));
    expect(c.querySelector("img")).not.toBeNull();
    expect(c.querySelector("video")).toBeNull();
  });
});
