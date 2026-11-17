// bb-plugin-linear-plus — frontend entry.
//
// Header: the thread's linked Linear issue (key · status) BEFORE bb's
// "Open in". bb 0.49 renders, left to right: retired
// `experimental_threadHeaderAction` components, Open in, then header thread
// actions. So the retired slot is used while bb still has it; without it the
// button falls back to a header thread action (after Open in, before Commit).
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { IssueHeaderButton } from "@/components/issue-header-button";
import { TicketBar, focusTicketBar } from "@/components/ticket-bar";
import { TicketPickerButton } from "@/components/ticket-picker-button";
import { useThreadIssues } from "@/hooks/use-thread-issues";
import { issueAction } from "@/lib/issue-action";

type LegacyHeaderSlot = (registration: {
  id: string;
  title: string;
  component: typeof IssueHeaderButton;
}) => void;

export default definePluginApp((app) => {
  const legacyHeader = (app.slots as unknown as { experimental_threadHeaderAction?: LegacyHeaderSlot })
    .experimental_threadHeaderAction;
  if (typeof legacyHeader === "function") {
    legacyHeader.call(app.slots, { id: "linear-issue", title: "Linear issue", component: IssueHeaderButton });
  } else {
    app.slots.experimental_threadAction({
      id: "linear-issue",
      title: "Linear issue",
      icon: "Layers",
      group: "0-linear",
      placement: "header",
      useData: useThreadIssues,
      item: ({ thread, data, navigate }) => issueAction(data.get(thread.id) ?? null, navigate),
    });
  }

  // New-thread composer: a ticket bar above the composer; the picked ticket's context (with the
  // `Linked Linear issue: KEY` line the server hook acts on) is appended.
  app.composer.customize({
    id: "linear-ticket",
    scopes: ["new-thread"],
    actions: [{ id: "linear-ticket-button", component: TicketPickerButton }],
    // A banner, not a popup: bb doesn't move the composer up for plugin popups,
    // so a popup below the composer could open off-screen.
    banners: [{ id: "linear-ticket-bar", chrome: "bare", component: TicketBar }],
    plusMenu: [
      {
        id: "link-linear-ticket",
        label: "Linear ticket…",
        icon: "Layers",
        description: "Start this thread from a Linear ticket",
        run: ({ composer }) => {
          focusTicketBar(composer.key);
        },
      },
    ],
  });

  // No default key (avoids clashing with bb's shortcuts); bind one in bb's keyboard settings.
  app.composer.experimental_registerCommand({
    id: "link-linear-ticket",
    title: "Link a Linear ticket",
    run: ({ composer }) => {
      focusTicketBar(composer.key);
    },
  });
});
