// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { IssueHeaderButton } from "../components/issue-header-button";
import { issueAction } from "../lib/issue-action";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);

const issue = { identifier: "SIG-42", title: "Fix login", stateName: "In Progress", url: "https://linear.app/x/issue/SIG-42", source: "linear" as const };

describe("header button registration", () => {
  it("uses the header slot that renders before Open in, not a header thread action", () => {
    expect(app.threadHeaderActions.map((a) => a.id)).toEqual(["linear-issue"]);
    expect(app.threadActions.filter((a) => a.placement === "header")).toHaveLength(0);
  });
});

describe("IssueHeaderButton", () => {
  const render = (value: typeof issue | null, compact = false) =>
    renderSlot({ component: IssueHeaderButton }, { threadId: "t1", isCompactViewport: compact }, {
      rpc: { threadIssues: () => ({ issues: { t1: value }, error: null }) },
      openUrl: () => true,
    });

  it("shows the issue key and status and opens the issue in Linear", async () => {
    const slot = render(issue);
    fireEvent.click(await slot.findByRole("button", { name: "SIG-42 · In Progress" }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "openUrl", url: "https://linear.app/x/issue/SIG-42" });
  });

  it("draws the tracker's logo (Linear) instead of a generic icon", async () => {
    const slot = render(issue);
    const button = await slot.findByRole("button", { name: "SIG-42 · In Progress" });
    expect(button.querySelector('svg[data-source="linear"]')).not.toBeNull();
  });

  it("shows only the key on a narrow header", async () => {
    const slot = render(issue, true);
    expect(await slot.findByRole("button", { name: "SIG-42 · In Progress" })).toBeTruthy();
    expect(slot.queryByText("In Progress")).toBeNull();
  });

  it("renders nothing without a linked issue", async () => {
    const slot = render(null);
    await new Promise((r) => setTimeout(r, 20));
    expect(slot.queryByRole("button")).toBeNull();
  });
});

describe("issueAction", () => {
  it("is hidden for a thread without a linked issue", () => {
    expect(issueAction(null, { openUrl: vi.fn() })).toBeNull();
  });

  it("labels the button with the issue key and status and opens it in Linear", () => {
    const openUrl = vi.fn(() => true);
    const action = issueAction(issue, { openUrl })!;
    expect(action.label).toBe("SIG-42 · In Progress");
    expect(action.detail).toBe("Fix login");
    expect(action.disabled).toBeFalsy();
    void action.run({} as never);
    expect(openUrl).toHaveBeenCalledWith("https://linear.app/x/issue/SIG-42");
  });

  it("shows just the key when the status isn't known", () => {
    expect(issueAction({ ...issue, stateName: "" }, { openUrl: vi.fn() })!.label).toBe("SIG-42");
  });

  it("is disabled when the issue has no URL", () => {
    const action = issueAction({ ...issue, url: null }, { openUrl: vi.fn() })!;
    expect(action.disabled).toBe(true);
  });
});
