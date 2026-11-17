const MARKER = /^Linked (?:Linear|GitHub|GitLab|Jira|Gitea) issue: (\S+)[ \t]*$/m;

/** bb gives a dispatch hook 10 s and holds every send meanwhile; Linear+ waits at most this long. */
const DEFAULT_TIMEOUT_MS = 2500;

/** The key on the first `Linked Linear issue: KEY` line, or null. */
export function markerKey(text: string): string | null {
  return MARKER.exec(text)?.[1] ?? null;
}

interface DispatchFacts {
  attempt: string;
  initiator: string;
  thread: { id: string; title: string | null };
  project: { id: string };
  environment: unknown;
  input: { text: string };
}

/** Only a user's first message to a thread that has no title and no workspace yet. */
export function shouldHandle(ctx: Omit<DispatchFacts, "input" | "project">): boolean {
  return ctx.attempt === "start-turn" && ctx.initiator === "user" && ctx.thread.title === null && ctx.environment === null;
}

/**
 * Before bb provisions the new thread's workspace: title it `KEY Ticket title`
 * (bb names the worktree branch from the title) and remember its ticket.
 * Never blocks the send.
 */
export async function onDispatch(
  ctx: DispatchFacts,
  deps: {
    link(threadId: string, projectId: string, key: string): Promise<{ title: string } | null>;
    updateTitle(threadId: string, title: string): Promise<void>;
    warn(message: string): void;
    timeoutMs?: number;
  },
): Promise<{ action: "proceed" }> {
  if (!shouldHandle(ctx)) return { action: "proceed" };
  const key = markerKey(ctx.input.text);
  if (key === null) return { action: "proceed" };
  const work = (async () => {
    const linked = await deps.link(ctx.thread.id, ctx.project.id, key);
    if (linked === null) {
      deps.warn(`Couldn't find ${key} in Taskboard, so the new thread wasn't titled or linked.`);
      return;
    }
    await deps.updateTitle(ctx.thread.id, linked.title);
  })().catch((cause: unknown) => {
    deps.warn(`Couldn't link the new thread to ${key}: ${cause instanceof Error ? cause.message : String(cause)}`);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });
  // The send goes ahead either way; a slow link may still land afterwards.
  if ((await Promise.race([work.then(() => "done" as const), timedOut])) === "timeout") {
    deps.warn(`Linking the new thread to ${key} took too long; sending without waiting (the branch keeps bb's own name).`);
  }
  clearTimeout(timer);
  return { action: "proceed" };
}
