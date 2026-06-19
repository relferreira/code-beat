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
  repoInstructions: string;
}

export function createReviewTools(context: RepoToolContext) {
  return {
    getPrDetails: tool({
      description: "Return pull request metadata, changed files, and patches.",
      inputSchema: z.object({}),
      execute: async () => context.prDetails
    }),
    getPrComments: tool({
      description:
        "Return existing pull request issue comments, review comments, and review thread state including resolved threads and replies.",
      inputSchema: z.object({}),
      execute: async () => context.prComments
    }),
    getRepoInstructions: tool({
      description: "Return repository-level agent/review instructions discovered in the checkout.",
      inputSchema: z.object({}),
      execute: async () => ({
        instructions: context.repoInstructions || "No repository instruction files were found."
      })
    }),
    readFile: tool({
      description: "Read a UTF-8 text file from the checked-out repository.",
      inputSchema: z.object({
        path: z.string().describe("Repository-relative file path.")
      }),
      execute: async ({ path }) => readRepoFile(context.root, path)
    }),
    readFileAroundLine: tool({
      description: "Read a window of lines around a specific line in a repository file.",
      inputSchema: z.object({
        path: z.string().describe("Repository-relative file path."),
        line: z.number().int().positive(),
        radius: z.number().int().min(1).max(80).default(30)
      }),
      execute: async ({ path, line, radius }) => readFileAroundLine(context.root, path, line, radius)
    }),
    listFiles: tool({
      description: "List repository files whose path includes a query string.",
      inputSchema: z.object({
        query: z.string().default("").describe("Case-insensitive substring to match against file paths."),
        limit: z.number().int().min(1).max(200).default(80)
      }),
      execute: async ({ query, limit }) => listRepoFiles(context.root, query, limit)
    }),
    searchRepo: tool({
      description: "Search text files in the repository for a literal query.",
      inputSchema: z.object({
        query: z.string().min(2).describe("Literal case-insensitive text to search for."),
        limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(40)
      }),
      execute: async ({ query, limit }) => searchRepo(context.root, query, limit)
    })
  };
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
