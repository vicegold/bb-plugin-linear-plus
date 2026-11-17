import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { experimental_useSidebarThreads as useSidebarThreads, useComposer, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "@/server";
import { useTicketSearch } from "@/hooks/use-ticket-search";
import { cn } from "@/lib/utils";
import { ticketInDraft } from "@/lib/draft-ticket";

const FOCUS_EVENT = "linear-plus:focus-ticket-bar";

/** Focus the ticket bar above the composer with this key (from the composer button, + menu or command). */
export function focusTicketBar(composerKey: string): void {
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { composerKey } }));
}

/**
 * Banner above the new-thread composer: find a ticket by key or title and
 * append it to the draft as context. A banner (not a popup) so it is part of
 * the page layout and can never open off-screen.
 */
export function TicketBar() {
  const composer = useComposer();
  const rpc = useRpc<typeof rpcContract>();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pickError, setPickError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  // Derived from the prompt itself, so it survives the bar remounting (e.g. when the project switches).
  const picked = ticketInDraft(composer.text);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onFocus = (event: Event) => {
      if ((event as CustomEvent<{ composerKey: string }>).detail?.composerKey === composer.key) inputRef.current?.focus();
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, [composer.key]);
  // "No project" is bb's personal project, which has no tickets: search every project instead.
  const { projects } = useSidebarThreads();
  const selected = composer.selection?.projectId ?? null;
  const projectId = selected === null || projects.some((p) => p.id === selected && p.isPersonal) ? null : selected;
  const search = useTicketSearch(query, projectId);
  const tickets = search.tickets;

  useEffect(() => setActive(0), [tickets]);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const row = listRef.current?.children[active];
    if (row instanceof HTMLElement && typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }, [active]);
  // Only results that answer what's typed now can be picked (no stale picks mid-search).
  const current = search.status === "done" && search.query === query.trim();

  const pick = async (index: number) => {
    const ticket = tickets[index];
    if (ticket === undefined || picking || !current) return;
    setPicking(true);
    setPickError(null);
    try {
      const { status: _status, provider: _provider, ...ref } = ticket;
      const result = await rpc.call("ticketContext", { ticket: ref });
      if ("error" in result) {
        setPickError(result.error);
        return;
      }
      // Start the thread where the ticket lives (e.g. from "No project"), so it gets that repo's worktree.
      if (ticket.projectId !== selected) await composer.setSelection({ projectId: ticket.projectId });
      composer.insert(result.text, { at: "end", block: true });
      setQuery("");
      composer.focus();
    } catch (cause) {
      setPickError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPicking(false);
    }
  };

  const unpick = () => {
    composer.replace((current) => {
      const block = ticketInDraft(current.text);
      if (block === null) return current;
      const before = current.text.slice(0, block.start).replace(/\s+$/u, "");
      const after = current.text.slice(block.end).replace(/^\s+/u, "");
      const text = after === "" ? before : `${before}\n\n${after}`;
      const shift = current.text.length - text.length;
      const mentions = current.mentions
        .filter((m) => m.to <= before.length || m.from >= block.end)
        .map((m) => (m.from >= block.end ? { ...m, from: m.from - shift, to: m.to - shift } : m));
      return { ...current, text, mentions };
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(tickets.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      void pick(active);
    } else if (event.key === "Escape" && query !== "") {
      event.preventDefault();
      setQuery("");
    }
  };

  const message =
    pickError ??
    search.error ??
    (search.status === "idle"
      ? null
      : search.status === "searching" && tickets.length === 0
        ? "Searching…"
        : search.status === "done" && tickets.length === 0
          ? `No tickets match "${query.trim()}". Is Taskboard set up for this project?`
          : null);

  if (picked !== null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
        <span className="shrink-0 text-xs text-muted-foreground">Starting from</span>
        <span className="shrink-0 font-medium tabular-nums">{picked.key}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{picked.title}</span>
        <button
          type="button"
          aria-label={`Remove ${picked.key}`}
          onClick={unpick}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background px-2 py-1">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={tickets.length > 0}
        aria-controls="linear-plus-ticket-results"
        aria-activedescendant={tickets[active] ? `linear-plus-ticket-${active}` : undefined}
        aria-label="Search Linear tickets"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Start from a ticket: SIG-42 or part of a title…"
        className="h-9 w-full rounded-md bg-transparent px-2 text-sm outline-none placeholder:font-light placeholder:text-subtle-foreground placeholder:opacity-70"
      />
      {message === null ? null : <p className="px-2 py-1.5 text-xs text-muted-foreground">{message}</p>}
      {tickets.length === 0 ? null : (
        <ul ref={listRef} id="linear-plus-ticket-results" role="listbox" aria-label="Linear tickets" className="max-h-72 overflow-y-auto">
          {tickets.map((ticket, index) => (
            <li
              key={`${ticket.projectId}:${ticket.locator}`}
              id={`linear-plus-ticket-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                void pick(index);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                index === active && "bg-state-active",
              )}
            >
              <span className="shrink-0 font-medium tabular-nums">{ticket.key}</span>
              <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{ticket.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
