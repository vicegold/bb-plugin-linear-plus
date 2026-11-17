import type { PluginThreadAction } from "@get-bb/plugin-sdk/app";
import type { LinkedIssue } from "@/lib/taskboard";

/** The header button for a thread's linked issue, or null to hide it. */
export function issueAction(
  issue: LinkedIssue | null,
  navigate: { openUrl(url: string): boolean },
): PluginThreadAction | null {
  if (issue === null) return null;
  const url = issue.url;
  return {
    label: issue.stateName === "" ? issue.identifier : `${issue.identifier} · ${issue.stateName}`,
    detail: issue.title,
    icon: "Layers",
    disabled: url === null,
    run: () => {
      if (url !== null) navigate.openUrl(url);
    },
  };
}
