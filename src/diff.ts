export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface DiffContext {
  prompt: string;
  commentableLines: Map<string, Set<number>>;
  truncated: boolean;
}

const DEFAULT_MAX_PROMPT_CHARS = 120_000;

export function buildDiffContext(
  files: PullRequestFile[],
  maxPromptChars = DEFAULT_MAX_PROMPT_CHARS
): DiffContext {
  const commentableLines = new Map<string, Set<number>>();
  const sections: string[] = [];
  let usedChars = 0;
  let truncated = false;

  for (const file of files) {
    if (file.patch) {
      commentableLines.set(file.filename, parseAddedLines(file.patch));
    }

    const section = formatFileSection(file);
    if (usedChars + section.length > maxPromptChars) {
      truncated = true;
      sections.push(
        `\n### ${file.filename}\nDiff omitted because the review context reached the ${maxPromptChars} character limit.`
      );
      continue;
    }

    usedChars += section.length;
    sections.push(section);
  }

  return {
    prompt: sections.join("\n\n"),
    commentableLines,
    truncated
  };
}

export function parseAddedLines(patch: string): Set<number> {
  const lines = new Set<number>();
  let newLine: number | undefined;

  for (const rawLine of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (newLine === undefined) {
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      lines.add(newLine);
      newLine += 1;
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      continue;
    }

    newLine += 1;
  }

  return lines;
}

function formatFileSection(file: PullRequestFile): string {
  const header = [
    `### ${file.filename}`,
    `status: ${file.status}`,
    `additions: ${file.additions}`,
    `deletions: ${file.deletions}`,
    `changes: ${file.changes}`
  ].join("\n");

  if (!file.patch) {
    return `${header}\npatch: unavailable; skip inline comments for this file unless the issue is clear from metadata.`;
  }

  return `${header}\n\`\`\`diff\n${file.patch}\n\`\`\``;
}
