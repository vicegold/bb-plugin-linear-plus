const MARKER = /^Linked (?:Linear|GitHub|GitLab|Jira|Gitea) issue: (\S+)[ \t]*$/m;
const END = "--- END UNTRUSTED ISSUE DATA ---";

/** The picked ticket's block in a draft: its key, title, and where the block starts and ends. */
export function ticketInDraft(text: string): { key: string; title: string; start: number; end: number } | null {
  const marker = MARKER.exec(text);
  if (marker === null) return null;
  const key = marker[1]!;
  const start = marker.index;
  const endAt = text.indexOf(END, start);
  const end = endAt < 0 ? start + marker[0].length : endAt + END.length;
  const titleLine = text.slice(start, end).split("\n").find((line) => line.startsWith(`> ${key}: `));
  return { key, title: titleLine?.slice(`> ${key}: `.length) ?? "", start, end };
}
