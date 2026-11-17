import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { SourceGlyph } from "@/components/source-glyph";
import { useThreadIssues } from "@/hooks/use-thread-issues";

/** The thread's linked Linear issue, before bb's "Open in" button. */
export function IssueHeaderButton({ threadId, isCompactViewport }: { threadId: string; isCompactViewport: boolean }) {
  const navigate = useBbNavigate();
  const issue = useThreadIssues({ threadIds: [threadId] }).get(threadId) ?? null;
  if (issue === null) return null;
  const url = issue.url;
  const label = issue.stateName === "" ? issue.identifier : `${issue.identifier} · ${issue.stateName}`;
  return (
    <span className="inline-flex" title={`${issue.identifier}: ${issue.title}`}>
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 max-w-64 gap-1.5 px-2 text-xs"
      aria-label={label}
      disabled={url === null}
      onClick={() => {
        if (url !== null) navigate.openUrl(url);
      }}
    >
      <SourceGlyph source={issue.source} className="size-3.5 shrink-0" />
      <span className="font-medium">{issue.identifier}</span>
      {isCompactViewport || issue.stateName === "" ? null : <span className="truncate text-muted-foreground">{issue.stateName}</span>}
    </Button>
    </span>
  );
}
