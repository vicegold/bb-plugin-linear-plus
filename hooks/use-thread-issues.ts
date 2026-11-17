import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "@/server";
import type { LinkedIssue } from "@/lib/taskboard";

const REFRESH_MS = 30_000;
const EMPTY: ReadonlyMap<string, LinkedIssue | null> = new Map();

/** The linked issue of each thread whose header is on screen, refreshed every 30s and on window focus. */
export function useThreadIssues({ threadIds }: { threadIds: readonly string[] }): ReadonlyMap<string, LinkedIssue | null> {
  const rpc = useRpc<typeof rpcContract>();
  const [issues, setIssues] = useState(EMPTY);
  const key = threadIds.join(",");

  useEffect(() => {
    const ids = key === "" ? [] : key.split(",");
    if (ids.length === 0) {
      setIssues(EMPTY);
      return;
    }
    let cancelled = false;
    const load = () => {
      rpc.call("threadIssues", { threadIds: ids }).then(
        (result) => {
          if (!cancelled) setIssues(new Map(Object.entries(result.issues)));
        },
        () => {},
      );
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [rpc, key]);

  return issues;
}
