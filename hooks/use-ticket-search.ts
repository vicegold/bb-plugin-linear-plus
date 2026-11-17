import { useEffect, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "@/server";
import type { TicketHit } from "@/lib/taskboard";

const DEBOUNCE_MS = 200;

export interface TicketSearchState {
  status: "idle" | "searching" | "done";
  /** The query these tickets answer. */
  query: string;
  tickets: TicketHit[];
  error: string | null;
}

/** Debounced ticket search through Linear+'s server; answers to older queries are dropped. */
export function useTicketSearch(query: string, projectId: string | null): TicketSearchState {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<TicketSearchState>({ status: "idle", query: "", tickets: [], error: null });
  const latest = useRef(0);
  const text = query.trim();

  useEffect(() => {
    const request = ++latest.current;
    if (text.length < 2) {
      setState({ status: "idle", query: text, tickets: [], error: null });
      return;
    }
    setState((previous) => ({ ...previous, status: "searching" }));
    const timer = setTimeout(() => {
      rpc.call("searchTickets", { projectId, query: text }).then(
        (result) => {
          if (request === latest.current) setState({ status: "done", query: text, tickets: result.tickets, error: result.error });
        },
        (cause: unknown) => {
          if (request === latest.current) {
            setState({ status: "done", query: text, tickets: [], error: cause instanceof Error ? cause.message : String(cause) });
          }
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rpc, text, projectId]);

  return state;
}
