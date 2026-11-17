import { describe, expect, it, vi } from "vitest";
import { markerKey, onDispatch, shouldHandle } from "../lib/start-hook";

const ctx = (over: Record<string, unknown> = {}) => ({
  attempt: "start-turn",
  initiator: "user",
  thread: { id: "t1", title: null },
  environment: null,
  project: { id: "proj_sig" },
  input: { text: "Please fix it.\n\nLinked Linear issue: SIG-42\nhttps://linear.app/s/issue/SIG-42" },
  ...over,
});

describe("markerKey", () => {
  it("finds the first marker line", () => {
    expect(markerKey("a\nLinked Linear issue: SIG-42\nLinked Linear issue: KWY-7")).toBe("SIG-42");
  });
  it("tolerates trailing spaces after the key", () => {
    expect(markerKey("Linked Linear issue: SIG-42  \nmore")).toBe("SIG-42");
  });
  it("accepts any Taskboard provider's marker", () => {
    expect(markerKey("Linked GitHub issue: Owner/Repo#103")).toBe("Owner/Repo#103");
  });
  it("ignores inline mentions and missing markers", () => {
    expect(markerKey("see Linked Linear issue: SIG-42 inline")).toBeNull();
    expect(markerKey("nothing here")).toBeNull();
  });
});

describe("shouldHandle", () => {
  it("handles only a user's first message to an untitled, unprovisioned thread", () => {
    expect(shouldHandle(ctx())).toBe(true);
    expect(shouldHandle(ctx({ attempt: "join-turn" }))).toBe(false);
    expect(shouldHandle(ctx({ initiator: "agent" }))).toBe(false);
    expect(shouldHandle(ctx({ thread: { id: "t1", title: "Already named" } }))).toBe(false);
    expect(shouldHandle(ctx({ environment: { id: "env" } }))).toBe(false);
  });
});

describe("onDispatch", () => {
  const deps = (link: (threadId: string, projectId: string, key: string) => Promise<{ title: string } | null>) => ({
    link: vi.fn(link),
    updateTitle: vi.fn(async () => {}),
    warn: vi.fn(),
  });

  it("titles and links the thread, then proceeds", async () => {
    const d = deps(async () => ({ title: "SIG-42 Fix login" }));
    expect(await onDispatch(ctx(), d)).toEqual({ action: "proceed" });
    expect(d.link).toHaveBeenCalledWith("t1", "proj_sig", "SIG-42");
    expect(d.updateTitle).toHaveBeenCalledWith("t1", "SIG-42 Fix login");
  });

  it("proceeds untouched but logs when the key doesn't resolve", async () => {
    const d = deps(async () => null);
    expect(await onDispatch(ctx(), d)).toEqual({ action: "proceed" });
    expect(d.updateTitle).not.toHaveBeenCalled();
    expect(d.warn).toHaveBeenCalledWith(expect.stringContaining("SIG-42"));
  });

  it("never holds the send longer than its time limit", async () => {
    const d = { ...deps(() => new Promise(() => {})), timeoutMs: 30 };
    const started = Date.now();
    expect(await onDispatch(ctx(), d)).toEqual({ action: "proceed" });
    expect(Date.now() - started).toBeLessThan(500);
    expect(d.warn).toHaveBeenCalledWith(expect.stringContaining("took too long"));
  });

  it("proceeds and warns when the Linear plugin fails", async () => {
    const d = deps(async () => {
      throw new Error("plugin taskboard is not running");
    });
    expect(await onDispatch(ctx(), d)).toEqual({ action: "proceed" });
    expect(d.warn).toHaveBeenCalledWith(expect.stringContaining("plugin taskboard is not running"));
  });

  it("does nothing for messages it shouldn't handle", async () => {
    const d = deps(async () => ({ title: "x" }));
    await onDispatch(ctx({ attempt: "join-turn" }), d);
    await onDispatch(ctx({ input: { text: "no marker" } }), d);
    expect(d.link).not.toHaveBeenCalled();
  });
});
