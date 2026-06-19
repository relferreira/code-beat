import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { tool } from "ai";
import { z } from "zod";

const MAX_FILE_BYTES = 120_000;
const MAX_SEARCH_FILES = 800;
const MAX_SEARCH_RESULTS = 80;
const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".config",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".graphql",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".md",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

export interface RepoToolContext {
  root: string;
  prDetails: unknown;
  prComments: unknown;
  prReviewThreads: ReviewThreadContext[];
  repoInstructions: string;
}

interface ReviewThreadContext {
  isResolved: boolean;
  isOutdated: boolean;
  path?: string;
  line?: number;
  comments: Array<{ author: string; body: string; path?: string; line?: number; createdAt?: string; url?: string }>;
}

export function createReviewTools(context: RepoToolContext) {
  return {
    getPrDetails: tool({
      description: "Return pull request metadata, changed files, and patches.",
      inputSchema: z.object({}),
      execute: async () => {
        console.log("Code Beat tool call: getPrDetails");
        return context.prDetails;
      }
    }),
    getPrComments: tool({
      description:
        "Return all existing pull request issue comments, review comments, and review threads. Use getReviewThreads for filtered or paginated thread lookup.",
      inputSchema: z.object({}),
      execute: async () => {
        const counts = describePrComments(context.prComments);
        console.log(`Code Beat tool call: getPrComments returned ${counts}`);
        return context.prComments;
      }
    }),
    getReviewThreads: tool({
      description:
        "Return pull request review threads with resolved state and replies. Use this before repeating a prior Code Beat finding.",
      inputSchema: z.object({
        path: z.string().optional().describe("Optional repository-relative file path to filter threads."),
        query: z.string().optional().describe("Optional case-insensitive text to search in thread comments."),
        includeResolved: z.boolean().default(true),
        includeUnresolved: z.boolean().default(true),
        onlyWithHumanReplies: z.boolean().default(false),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20)
      }),
      execute: async (args) => {
        const result = filterReviewThreads(context.prReviewThreads, args);
        console.log(
          `Code Beat tool call: getReviewThreads path=${args.path ?? "(any)"} query=${
            args.query ? "(provided)" : "(none)"
          } includeResolved=${args.includeResolved} includeUnresolved=${args.includeUnresolved} ` +
            `onlyWithHumanReplies=${args.onlyWithHumanReplies} offset=${args.offset} limit=${args.limit} ` +
            `returned ${result.threads.length}/${result.totalMatching} matching thread(s), moreAvailable=${result.moreAvailable}`
        );
        return result;
      }
    }),
    getRepoInstructions: tool({
      description: "Return repository-level agent/review instructions discovered in the checkout.",
      inputSchema: z.object({}),
      execute: async () => {
        console.log(`Code Beat tool call: getRepoInstructions chars=${context.repoInstructions.length}`);
        return {
          instructions: context.repoInstructions || "No repository instruction files were found."
        };
      }
    }),
    readFile: tool({
      description: "Read a UTF-8 text file from the checked-out repository.",
      inputSchema: z.object({
        path: z.string().describe("Repository-relative file path.")
      }),
      execute: async ({ path }) => {
        const result = readRepoFile(context.root, path);
        console.log(`Code Beat tool call: readFile ${path} -> ${describeReadResult(result)}`);
        return result;
      }
    }),
    readFileAroundLine: tool({
      description: "Read a window of lines around a specific line in a repository file.",
      inputSchema: z.object({
        path: z.string().describe("Repository-relative file path."),
        line: z.number().int().positive(),
        radius: z.number().int().min(1).max(80).default(30)
      }),
      execute: async ({ path, line, radius }) => {
        const result = readFileAroundLine(context.root, path, line, radius);
        console.log(`Code Beat tool call: readFileAroundLine ${path}:${line} radius=${radius} -> ${describeReadResult(result)}`);
        return result;
      }
    }),
    listFiles: tool({
      description: "List repository files whose path includes a query string.",
      inputSchema: z.object({
        query: z.string().default("").describe("Case-insensitive substring to match against file paths."),
        limit: z.number().int().min(1).max(200).default(80)
      }),
      execute: async ({ query, limit }) => {
        const result = listRepoFiles(context.root, query, limit);
        console.log(`Code Beat tool call: listFiles query="${query}" returned ${result.files.length} file(s)`);
        return result;
      }
    }),
    searchRepo: tool({
      description: "Search text files in the repository for a literal query.",
      inputSchema: z.object({
        query: z.string().min(2).describe("Literal case-insensitive text to search for."),
        limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(40)
      }),
      execute: async ({ query, limit }) => {
        const result = searchRepo(context.root, query, limit);
        console.log(`Code Beat tool call: searchRepo query="${query}" returned ${result.results.length} result(s)`);
        return result;
      }
    })
  };
}

function filterReviewThreads(
  threads: ReviewThreadContext[],
  args: {
    path?: string;
    query?: string;
    includeResolved: boolean;
    includeUnresolved: boolean;
    onlyWithHumanReplies: boolean;
    offset: number;
    limit: number;
  }
) {
  const normalizedQuery = args.query?.trim().toLowerCase();
  const filtered = threads.filter((thread) => {
    if (args.path && thread.path !== args.path) {
      return false;
    }

    if (thread.isResolved && !args.includeResolved) {
      return false;
    }

    if (!thread.isResolved && !args.includeUnresolved) {
      return false;
    }

    if (args.onlyWithHumanReplies && !thread.comments.some((comment) => isHumanReviewReply(comment.author))) {
      return false;
    }

    if (normalizedQuery && !thread.comments.some((comment) => comment.body.toLowerCase().includes(normalizedQuery))) {
      return false;
    }

    return true;
  });

  return {
    totalThreads: threads.length,
    totalMatching: filtered.length,
    offset: args.offset,
    limit: args.limit,
    truncated: args.offset + args.limit < filtered.length,
    moreAvailable: args.offset + args.limit < filtered.length,
    threads: filtered.slice(args.offset, args.offset + args.limit)
  };
}

function isHumanReviewReply(author: string): boolean {
  return author !== "github-actions" && !author.endsWith("[bot]");
}

function describePrComments(value: unknown): string {
  const record = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const issueComments = Array.isArray(record.issueComments) ? record.issueComments.length : 0;
  const reviewComments = Array.isArray(record.reviewComments) ? record.reviewComments.length : 0;
  const reviewThreads = Array.isArray(record.reviewThreads) ? record.reviewThreads : [];
  const threadCommentCount = reviewThreads.reduce((sum, thread) => {
    if (thread !== null && typeof thread === "object" && Array.isArray((thread as { comments?: unknown }).comments)) {
      return sum + ((thread as { comments: unknown[] }).comments.length ?? 0);
    }

    return sum;
  }, 0);
  return `${issueComments} issue comment(s), ${reviewComments} review comment(s), ${reviewThreads.length} review thread(s), ${threadCommentCount} thread comment(s)`;
}

function describeReadResult(result: { content: string; truncated: boolean } | { error: string } | { content: string; truncated: boolean; start?: number; end?: number }): string {
  if ("error" in result) {
    return `error="${result.error}"`;
  }

  const range = "start" in result && "end" in result ? ` lines=${result.start}-${result.end}` : "";
  return `chars=${result.content.length}${range} truncated=${result.truncated}`;
}

export function collectRepoInstructions(root: string): string {
  const instructionPaths = [
    "AGENTS.md",
    "CLAUDE.md",
    ".cursor/rules",
    ".cursor/rules.md",
    ".github/copilot-instructions.md"
  ];

  const sections: string[] = [];
  for (const path of instructionPaths) {
    const result = readRepoFile(root, path);
    if ("content" in result) {
      sections.push(`## ${path}\n${result.content}`);
    }
  }

  return sections.join("\n\n");
}

export function readRepoFile(root: string, path: string): { path: string; content: string; truncated: boolean } | { error: string } {
  const resolved = resolveSafePath(root, path);
  if (!resolved) {
    return { error: "Path is outside the repository checkout." };
  }

  if (!existsSync(resolved)) {
    return { error: "File does not exist in the repository checkout." };
  }

  const stats = statSync(resolved);
  if (!stats.isFile()) {
    return { error: "Path is not a file." };
  }

  const raw = readFileSync(resolved);
  const truncated = raw.byteLength > MAX_FILE_BYTES;
  return {
    path: normalizePath(relative(root, resolved)),
    content: raw.subarray(0, MAX_FILE_BYTES).toString("utf8"),
    truncated
  };
}

function readFileAroundLine(root: string, path: string, line: number, radius: number) {
  const result = readRepoFile(root, path);
  if (!("content" in result)) {
    return result;
  }

  const lines = result.content.split("\n");
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const content = lines
    .slice(start - 1, end)
    .map((text, index) => `${start + index}: ${text}`)
    .join("\n");

  return {
    path: result.path,
    start,
    end,
    content,
    truncated: result.truncated
  };
}

function listRepoFiles(root: string, query: string, limit: number) {
  const normalizedQuery = query.toLowerCase();
  const files = walkFiles(root)
    .filter((path) => path.toLowerCase().includes(normalizedQuery))
    .slice(0, limit);

  return { files, truncated: files.length >= limit };
}

function searchRepo(root: string, query: string, limit: number) {
  const needle = query.toLowerCase();
  const results: Array<{ path: string; line: number; text: string }> = [];

  for (const path of walkFiles(root).slice(0, MAX_SEARCH_FILES)) {
    if (!isLikelyText(path)) {
      continue;
    }

    const file = readRepoFile(root, path);
    if (!("content" in file)) {
      continue;
    }

    const lines = file.content.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index] ?? "";
      if (text.toLowerCase().includes(needle)) {
        results.push({ path, line: index + 1, text: text.slice(0, 300) });
        if (results.length >= limit) {
          return { results, truncated: true };
        }
      }
    }
  }

  return { results, truncated: false };
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const ignored = new Set([".git", "node_modules", "dist", "lib", "test-dist", "coverage"]);
  const files: string[] = [];
  const queue = [root];

  while (queue.length > 0 && files.length < MAX_SEARCH_FILES) {
    const dir = queue.shift();
    if (!dir) {
      continue;
    }

    for (const entry of readdirSync(dir)) {
      if (ignored.has(entry)) {
        continue;
      }

      const fullPath = join(dir, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        queue.push(fullPath);
      } else if (stats.isFile()) {
        files.push(normalizePath(relative(root, fullPath)));
      }
    }
  }

  return files;
}

function resolveSafePath(root: string, path: string): string | undefined {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, path);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${sep}`)) {
    return undefined;
  }

  return resolvedPath;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function isLikelyText(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) {
    return true;
  }

  return TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}
