import { describe, expect, it } from "vitest";
import { nextStepKey } from "./nextStep";

describe("nextStepKey", () => {
  const base = { activeId: "t1", lastId: "m9", lastRole: "assistant", idle: true };
  it("names the finished reply a suggestion belongs to", () => {
    expect(nextStepKey(base)).toBe("t1:m9");
  });
  it("has none while working, empty, or ending on your own message", () => {
    expect(nextStepKey({ ...base, idle: false })).toBeNull();
    expect(nextStepKey({ ...base, lastId: undefined })).toBeNull();
    expect(nextStepKey({ ...base, activeId: null })).toBeNull();
    expect(nextStepKey({ ...base, lastRole: "user" })).toBeNull();
  });
  it("changes with the reply, so an old suggestion is not shown for a new one", () => {
    expect(nextStepKey({ ...base, lastId: "m10" })).not.toBe(nextStepKey(base));
  });
});
