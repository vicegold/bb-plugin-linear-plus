// bb-plugin-linear-plus — backend entry.
//
// Tickets come from the Taskboard plugin (bb.sdk.plugins.callRpc, id
// "taskboard"), which owns each project's tracker connection and ticket cache.
// Linear+ stores only which ticket a thread works on, in its own thread
// plugin metadata. No credentials, no direct tracker calls.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  findTicket,
  searchTickets,
  threadIssuesOutputSchema,
  threadTickets,
  ticketContext,
  ticketRefSchema,
  type CallPluginRpc,
  type TicketRef,
} from "./lib/taskboard";
import { onDispatch } from "./lib/start-hook";

const ticketHitSchema = ticketRefSchema.extend({ status: z.string(), provider: z.string() });

export const rpcContract = defineRpcContract({
  threadIssues: {
    input: z.object({ threadIds: z.array(z.string()).max(200) }),
    output: threadIssuesOutputSchema,
  },
  searchTickets: {
    input: z.object({ projectId: z.string().nullable(), query: z.string().max(200) }),
    output: z.object({ tickets: z.array(ticketHitSchema), error: z.string().nullable() }),
  },
  ticketContext: {
    input: z.object({ ticket: ticketRefSchema }),
    output: z.union([z.object({ text: z.string(), key: z.string() }), z.object({ error: z.string() })]),
  },
});

export default async function plugin(bb: BbPluginApi) {
  const call: CallPluginRpc = (args) => bb.sdk.plugins.callRpc({ ...args, input: args.input as never });

  const readLinks = async (threadIds: readonly string[]) => {
    const { threads } = await bb.sdk.threads.experimental_listPluginMetadata({ threadIds: [...threadIds] });
    const links = new Map<string, TicketRef>();
    for (const { threadId, metadata } of threads) {
      const parsed = ticketRefSchema.safeParse(metadata.ticket);
      if (parsed.success) links.set(threadId, parsed.data);
    }
    return links;
  };
  const saveLink = async (threadId: string, ref: TicketRef) => {
    await bb.sdk.threads.updatePluginMetadata({ threadId, set: { ticket: ref } });
  };

  // Log each distinct failure once per source, not on every refresh or keystroke.
  const warnOnce = () => {
    let last: string | null = null;
    return (message: string | null) => {
      if (message !== null && message !== last) bb.log.warn(message);
      if (message !== null) last = message;
    };
  };
  const warnHeader = warnOnce();
  const warnSearch = warnOnce();

  bb.rpc.register(rpcContract, {
    threadIssues: async ({ threadIds }) => {
      const result = await threadTickets(call, { readLinks, saveLink }, threadIds);
      warnHeader(result.error);
      return result;
    },
    searchTickets: async (input) => {
      const result = await searchTickets(call, input);
      warnSearch(result.error);
      return result;
    },
    ticketContext: ({ ticket }) => ticketContext(call, ticket),
  });

  // A new thread whose first message carries `Linked <Provider> issue: KEY`
  // (added by the composer's ticket picker) is titled `KEY title` and linked
  // here, before bb names and creates its worktree branch.
  bb.experimental_hooks.on("message.dispatch", (ctx) =>
    onDispatch(ctx, {
      link: async (threadId, projectId, key) => {
        const ref = await findTicket(call, projectId, key);
        if (ref === null) return null;
        await saveLink(threadId, ref);
        return { title: `${ref.key} ${ref.title}` };
      },
      updateTitle: async (threadId, title) => {
        await bb.sdk.threads.update({ threadId, title });
      },
      warn: (message) => bb.log.warn(message),
    }),
  );
}
