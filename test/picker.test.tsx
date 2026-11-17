// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { TicketBar, focusTicketBar } from "../components/ticket-bar";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);

const hit = (key: string, title: string) => ({
  projectId: "proj_sig", source: "linear", locator: `loc-${key}`, key, title, url: `https://linear.app/s/issue/${key}`, status: "Todo", provider: "Linear",
});
const tickets = [hit("SIG-42", "Fix login"), hit("SIG-43", "Fix logout")];
const scope = { kind: "new-thread" } as never;

const render = (rpc: Record<string, (input: any) => unknown>) =>
  renderSlot({ component: TicketBar }, {}, { rpc, composer: { scope, text: "Please fix it.", selection: { projectId: "proj_sig" } } });

const search = (slot: ReturnType<typeof render>, value: string) =>
  fireEvent.change(slot.getByRole("combobox", { name: "Search Linear tickets" }), { target: { value } });

describe("TicketBar", () => {
  it("doesn't take focus from the prompt by itself, but focuses on request", async () => {
    const slot = render({});
    const input = slot.getByRole("combobox", { name: "Search Linear tickets" });
    expect(document.activeElement).not.toBe(input);
    focusTicketBar(slot.inspection.composer.key);
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("shows the picked ticket as a chip, and removing it takes the context back out", async () => {
    const slot = render({
      searchTickets: () => ({ tickets, error: null }),
      ticketContext: () => ({ text: "Linked Linear issue: SIG-42\nhttps://x\n\n--- BEGIN UNTRUSTED ISSUE DATA key=SIG-42 ---\nnote\n> SIG-42: Fix login\n--- END UNTRUSTED ISSUE DATA ---", key: "SIG-42" }),
    });
    search(slot, "fix");
    await slot.findByText("SIG-42");
    fireEvent.keyDown(slot.getByRole("combobox", { name: "Search Linear tickets" }), { key: "Enter" });
    await waitFor(() => expect(slot.inspection.composer.text).toContain("Linked Linear issue: SIG-42"));
    expect(slot.queryByRole("combobox", { name: "Search Linear tickets" })).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Remove SIG-42" }));
    await waitFor(() => expect(slot.inspection.composer.text).toBe("Please fix it."));
    expect(slot.getByRole("combobox", { name: "Search Linear tickets" })).toBeTruthy();
  });

  it("shows the chip for a ticket already in the prompt (e.g. after the project switched)", async () => {
    const block = "Linked Linear issue: SIG-7\nhttps://x\n\n--- BEGIN UNTRUSTED ISSUE DATA key=SIG-7 ---\nnote\n> SIG-7: Fix the thing\n--- END UNTRUSTED ISSUE DATA ---";
    const slot = renderSlot({ component: TicketBar }, {}, { rpc: {}, composer: { scope, text: `Do it.\n\n${block}` } });
    expect(slot.getByText("Fix the thing")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Remove SIG-7" }));
    await waitFor(() => expect(slot.inspection.composer.text).toBe("Do it."));
  });

  it("clears the search with Escape", async () => {
    const slot = render({ searchTickets: () => ({ tickets, error: null }) });
    search(slot, "fix");
    await slot.findByText("SIG-42");
    fireEvent.keyDown(slot.getByRole("combobox", { name: "Search Linear tickets" }), { key: "Escape" });
    expect((slot.getByRole("combobox", { name: "Search Linear tickets" }) as HTMLInputElement).value).toBe("");
    expect(slot.queryByText("SIG-42")).toBeNull();
  });

  it("searches after a short pause and lists tickets", async () => {
    const slot = render({ searchTickets: () => ({ tickets, error: null }) });
    search(slot, "fix");
    expect(await slot.findByText("SIG-42")).toBeTruthy();
    expect(slot.getByText("Fix logout")).toBeTruthy();
    expect(slot.inspection.rpcCalls.filter((c) => c.method === "searchTickets").map((c) => c.input)).toEqual([{ projectId: "proj_sig", query: "fix" }]);
  });

  it("searches every project when the composer has no project", async () => {
    const slot = renderSlot({ component: TicketBar }, {}, {
      rpc: { searchTickets: () => ({ tickets, error: null }) },
      composer: { scope, selection: { projectId: "proj_personal" } },
      sidebarThreads: { status: "ready", threads: [], sections: [], experimental_archived: null,
        projects: [{ id: "proj_personal", name: "Personal", isPersonal: true, href: "/", settingsHref: "/" }] },
    });
    search(slot, "kwy");
    await slot.findByText("SIG-42");
    expect(slot.inspection.rpcCalls.find((c) => c.method === "searchTickets")?.input).toEqual({ projectId: null, query: "kwy" });
  });

  it("moves a no-project thread into the picked ticket's project", async () => {
    const slot = renderSlot({ component: TicketBar }, {}, {
      rpc: { searchTickets: () => ({ tickets, error: null }), ticketContext: () => ({ text: "Linked Linear issue: SIG-42", key: "SIG-42" }) },
      composer: { scope, selection: { projectId: "proj_personal" } },
      sidebarThreads: { status: "ready", threads: [], sections: [], experimental_archived: null,
        projects: [{ id: "proj_personal", name: "Personal", isPersonal: true, href: "/", settingsHref: "/" }] },
    });
    search(slot, "fix");
    await slot.findByText("SIG-42");
    fireEvent.keyDown(slot.getByRole("combobox", { name: "Search Linear tickets" }), { key: "Enter" });
    await waitFor(() => expect(slot.inspection.composer.selections.map((x) => x.projectId)).toContain("proj_sig"));
  });

  it("doesn't pick a result from an older query while a newer one is searching", async () => {
    const slot = render({
      searchTickets: ({ query }: { query: string }) => (query === "fix" ? { tickets, error: null } : new Promise(() => {})),
      ticketContext: () => ({ text: "x", key: "x" }),
    });
    search(slot, "fix");
    await slot.findByText("SIG-42");
    search(slot, "fix l");
    fireEvent.keyDown(slot.getByRole("combobox", { name: "Search Linear tickets" }), { key: "Enter" });
    await new Promise((r) => setTimeout(r, 50));
    expect(slot.inspection.rpcCalls.some((c) => c.method === "ticketContext")).toBe(false);
  });

  it("keeps the highlighted row in view", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const slot = render({ searchTickets: () => ({ tickets, error: null }) });
    search(slot, "fix");
    await slot.findByText("SIG-42");
    fireEvent.keyDown(slot.getByRole("combobox", { name: "Search Linear tickets" }), { key: "ArrowDown" });
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "nearest" }));
  });

  it("ignores a slower answer to an older query", async () => {
    let releaseOld!: () => void;
    const slot = render({
      searchTickets: ({ query }: { query: string }) =>
        query === "fi"
          ? new Promise((resolve) => (releaseOld = () => resolve({ tickets: [hit("OLD-1", "Old")], error: null })))
          : { tickets, error: null },
    });
    search(slot, "fi");
    await waitFor(() => expect(slot.inspection.rpcCalls.length).toBe(1));
    search(slot, "fix");
    expect(await slot.findByText("SIG-42")).toBeTruthy();
    releaseOld();
    await new Promise((r) => setTimeout(r, 20));
    expect(slot.queryByText("OLD-1")).toBeNull();
  });

  it("picks the highlighted ticket with the keyboard and appends its context", async () => {
    const slot = render({
      searchTickets: () => ({ tickets, error: null }),
      ticketContext: ({ ticket }: { ticket: { key: string } }) => ({ text: `Linked Linear issue: ${ticket.key}`, key: ticket.key }),
    });
    search(slot, "fix");
    await slot.findByText("SIG-42");
    const input = slot.getByRole("combobox", { name: "Search Linear tickets" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(slot.inspection.composer.text).toContain("Linked Linear issue: SIG-43"));
    expect(slot.inspection.composer.text.startsWith("Please fix it.")).toBe(true);
  });

  it("shows why it can't search", async () => {
    const slot = render({ searchTickets: () => ({ tickets: [], error: "Taskboard isn't available: off" }) });
    search(slot, "fix");
    expect(await slot.findByText("Taskboard isn't available: off")).toBeTruthy();
  });

  it("hints at Taskboard setup when nothing matches", async () => {
    const slot = render({ searchTickets: () => ({ tickets: [], error: null }) });
    search(slot, "zzz");
    expect(await slot.findByText('No tickets match "zzz". Is Taskboard set up for this project?')).toBeTruthy();
  });

  it("stays a single slim line before anything is typed", () => {
    const slot = render({});
    expect(slot.queryByRole("listbox")).toBeNull();
    expect(slot.container.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("composer registration", () => {
  it("adds the ticket bar above the new-thread composer, plus a button and + menu row that jump to it", () => {
    const custom = app.composerCustomizations.find((c) => c.id === "linear-ticket");
    expect(custom?.scopes).toEqual(["new-thread"]);
    expect(custom?.banners?.map((b) => b.id)).toEqual(["linear-ticket-bar"]);
    expect(custom?.plusMenu?.map((m) => m.id)).toEqual(["link-linear-ticket"]);
    expect(custom?.experimental_popups ?? []).toHaveLength(0);
    expect(custom?.actions).toHaveLength(1);
  });

  it("offers a rebindable command that opens the picker", () => {
    const commands = (app as unknown as { commandPaletteActions: { id?: string }[] }).commandPaletteActions;
    expect(commands.some((a) => a.id === "link-linear-ticket")).toBe(true);
  });
});
