#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const server = new McpServer({
  name: "code-reviewer",
  version: "1.0.0",
});

// Path boundary — restrict to HOME or ALLOWED_BASE_PATH
const ALLOWED_BASE = path.resolve(process.env.ALLOWED_BASE_PATH || process.env.HOME || "/");
function isPathAllowed(target: string): boolean {
  const resolved = path.resolve(target);
  return resolved === ALLOWED_BASE || resolved.startsWith(ALLOWED_BASE + path.sep);
}
function guardPath(target: string): string {
  const resolved = path.resolve(target);
  if (!isPathAllowed(resolved)) throw new Error(`Access denied: path outside allowed directory`);
  return resolved;
}

function isValidGitRef(ref: string): boolean {
  return /^[a-zA-Z0-9._/~^@{}:!-]+$/.test(ref) && ref.length < 256;
}
function isValidCommitHash(hash: string): boolean {
  return /^[a-f0-9]{7,40}$/i.test(hash);
}

async function findGitRoot(fromPath: string): Promise<string> {
  const resolved = path.resolve(fromPath);
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: resolved });
  return stdout.trim();
}

// ─── list_files ───────────────────────────────────────────────────────────────

server.tool(
  "list_files",
  "List files and directories at a given path. Directories come first, hidden files (except .git) are excluded.",
  { dir_path: z.string().describe("Absolute or relative directory path to list") },
  async ({ dir_path }) => {
    const resolved = guardPath(dir_path);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith(".") || e.name === ".git")
      .map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(resolved, e.name),
        ext: e.isDirectory() ? null : path.extname(e.name).slice(1),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const lines = items.map((i) =>
      `${i.isDirectory ? "📁" : "📄"} ${i.name}${i.ext ? ` (.${i.ext})` : ""}  →  ${i.path}`
    );

    return {
      content: [{ type: "text", text: `## ${resolved}\n\n${lines.join("\n")}` }],
    };
  }
);

// ─── read_file ────────────────────────────────────────────────────────────────

server.tool(
  "read_file",
  "Read the contents of a file. Returns full text content.",
  {
    file_path: z.string().describe("Absolute or relative path to the file"),
    max_chars: z
      .number()
      .optional()
      .describe("Truncate output to this many characters (default: unlimited)"),
  },
  async ({ file_path, max_chars }) => {
    const resolved = guardPath(file_path);
    let content = fs.readFileSync(resolved, "utf-8");
    const truncated = max_chars && content.length > max_chars;
    if (truncated) content = content.slice(0, max_chars) + "\n\n… [truncated]";
    return {
      content: [
        {
          type: "text",
          text: `## ${resolved}${truncated ? ` (truncated to ${max_chars} chars)` : ""}\n\n\`\`\`\n${content}\n\`\`\``,
        },
      ],
    };
  }
);

// ─── git_diff ─────────────────────────────────────────────────────────────────

server.tool(
  "git_diff",
  "Get the unstaged git diff for a repository. Use target='HEAD' to see all uncommitted changes.",
  {
    repo_path: z.string().describe("Path to the git repository root"),
    target: z.string().optional().describe("Diff target, e.g. 'HEAD' (default) or a branch name"),
  },
  async ({ repo_path, target = "HEAD" }) => {
    if (!isValidGitRef(target)) throw new Error("Invalid git ref");
    const gitRoot = await findGitRoot(guardPath(repo_path));
    const { stdout } = await execFileAsync("git", ["diff", target], { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 });
    if (!stdout.trim()) {
      return { content: [{ type: "text", text: "No unstaged changes." }] };
    }
    return {
      content: [{ type: "text", text: `## git diff ${target}\n\n\`\`\`diff\n${stdout}\n\`\`\`` }],
    };
  }
);

// ─── git_staged ───────────────────────────────────────────────────────────────

server.tool(
  "git_staged",
  "Get the staged (index) git diff for a repository — changes that are ready to commit.",
  { repo_path: z.string().describe("Path to the git repository root") },
  async ({ repo_path }) => {
    const gitRoot = await findGitRoot(guardPath(repo_path));
    const { stdout } = await execFileAsync("git", ["diff", "--staged"], { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 });
    if (!stdout.trim()) {
      return { content: [{ type: "text", text: "No staged changes." }] };
    }
    return {
      content: [{ type: "text", text: `## git diff --staged\n\n\`\`\`diff\n${stdout}\n\`\`\`` }],
    };
  }
);

// ─── git_log ──────────────────────────────────────────────────────────────────

server.tool(
  "git_log",
  "Get the last 20 commits for a repository.",
  { repo_path: z.string().describe("Path to the git repository root") },
  async ({ repo_path }) => {
    const gitRoot = await findGitRoot(guardPath(repo_path));
    const { stdout } = await execFileAsync(
      "git", ["log", "--oneline", "-20", "--pretty=format:%H|%s|%an|%ar"],
      { cwd: gitRoot }
    );
    const commits = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, subject, author, date] = line.split("|");
        return `- \`${hash?.slice(0, 8)}\` ${subject}  —  ${author}, ${date}`;
      });
    return {
      content: [{ type: "text", text: `## Recent commits\n\n${commits.join("\n")}` }],
    };
  }
);

// ─── git_show ─────────────────────────────────────────────────────────────────

server.tool(
  "git_show",
  "Show the diff for a specific git commit by hash.",
  {
    repo_path: z.string().describe("Path to the git repository root"),
    hash: z.string().describe("Full or short commit hash"),
  },
  async ({ repo_path, hash }) => {
    if (!isValidCommitHash(hash)) throw new Error("Invalid commit hash");
    const gitRoot = await findGitRoot(guardPath(repo_path));
    const { stdout } = await execFileAsync("git", ["show", hash], { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 });
    return {
      content: [{ type: "text", text: `## git show ${hash}\n\n\`\`\`diff\n${stdout}\n\`\`\`` }],
    };
  }
);

// ─── review_code ──────────────────────────────────────────────────────────────

server.tool(
  "review_code",
  "Prepare a code review by reading specified files and/or a git diff, then return a structured prompt for Claude to review. No API key needed — Claude performs the review as the MCP host.",
  {
    repo_path: z.string().describe("Path to the git repository root"),
    files: z
      .array(z.string())
      .optional()
      .describe("List of file paths to include in the review"),
    diff_type: z
      .enum(["unstaged", "staged", "none"])
      .optional()
      .describe("Which diff to include: 'unstaged', 'staged', or 'none' (default: unstaged)"),
    focus: z
      .string()
      .optional()
      .describe("Optional focus area, e.g. 'security', 'performance', 'test coverage'"),
  },
  async ({ repo_path, files = [], diff_type = "unstaged", focus }) => {
    const resolved = guardPath(repo_path);

    const fileSections = await Promise.all(
      files.map(async (f) => {
        try {
          const filePath = guardPath(f);
          let content = fs.readFileSync(filePath, "utf-8");
          if (content.length > 4000) content = content.slice(0, 4000) + "\n… [truncated]";
          return `### ${f}\n\`\`\`\n${content}\n\`\`\``;
        } catch {
          return `### ${f}\n_Could not read file_`;
        }
      })
    );

    let diff = "";
    if (diff_type !== "none") {
      try {
        const gitRoot = await findGitRoot(resolved);
        const args = diff_type === "staged" ? ["diff", "--staged"] : ["diff", "HEAD"];
        const { stdout } = await execFileAsync("git", args, { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 });
        diff = stdout.slice(0, 8000);
      } catch {
        diff = "";
      }
    }

    const focusLine = focus ? `\nPay particular attention to: **${focus}**.\n` : "";

    const prompt = [
      `You are an expert code reviewer. Review the following code and provide structured feedback.`,
      focusLine,
      `Categorize issues as 🔴 Critical / 🟡 Warning / 🟢 Suggestion. Be specific — reference file names and line numbers. Explain *why*, not just *what*. Acknowledge what's done well.`,
      `\nFormat your response with: **Summary**, **Issues**, **Suggestions**, **Verdict** (✅ Approve / ⚠️ Approve with comments / ❌ Request changes).`,
      fileSections.length ? `\n---\n## Files\n\n${fileSections.join("\n\n")}` : "",
      diff ? `\n---\n## Git Diff\n\n\`\`\`diff\n${diff}\n\`\`\`` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { content: [{ type: "text", text: prompt }] };
  }
);

// ─── start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("code-reviewer MCP server running on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
