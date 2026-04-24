const BASE = "/api";

export interface FileItem {
  name: string;
  isDirectory: boolean;
  path: string;
  ext: string | null;
}

export interface Commit {
  hash: string;
  subject: string;
  author: string;
  date: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Client-side logger
const log = {
  info:   (...a: unknown[]) => console.log (`%c[API] ℹ️`, "color:#6b7280", ...a),
  ok:     (...a: unknown[]) => console.log (`%c[API] ✅`, "color:#10b981", ...a),
  error:  (...a: unknown[]) => console.error(`%c[API] ❌`, "color:#ef4444", ...a),
  stream: (...a: unknown[]) => console.log (`%c[API] 〰️`, "color:#8b5cf6", ...a),
};

export const api = {
  async listFiles(dirPath: string): Promise<{ path: string; items: FileItem[] }> {
    log.info(`listFiles: ${dirPath}`);
    const res = await fetch(`${BASE}/files?path=${encodeURIComponent(dirPath)}`);
    if (!res.ok) {
      const err = await res.json();
      log.error(`listFiles failed:`, err);
      throw new Error(err.error);
    }
    const data = await res.json();
    log.ok(`listFiles: ${data.items.length} items`);
    return data;
  },

  async readFile(filePath: string): Promise<{ content: string }> {
    log.info(`readFile: ${filePath}`);
    const res = await fetch(`${BASE}/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) {
      const err = await res.json();
      log.error(`readFile failed:`, err);
      throw new Error(err.error);
    }
    const data = await res.json();
    log.ok(`readFile: ${data.content.length} chars`);
    return data;
  },

  async gitDiff(repoPath: string, target = "HEAD"): Promise<{ diff: string }> {
    log.info(`gitDiff: ${repoPath} target=${target}`);
    const res = await fetch(`${BASE}/git/diff?path=${encodeURIComponent(repoPath)}&target=${target}`);
    if (!res.ok) { const err = await res.json(); log.error("gitDiff failed:", err); throw new Error(err.error); }
    const data = await res.json();
    log.ok(`gitDiff: ${data.diff.length} chars`);
    return data;
  },

  async gitStaged(repoPath: string): Promise<{ diff: string }> {
    log.info(`gitStaged: ${repoPath}`);
    const res = await fetch(`${BASE}/git/staged?path=${encodeURIComponent(repoPath)}`);
    if (!res.ok) { const err = await res.json(); log.error("gitStaged failed:", err); throw new Error(err.error); }
    const data = await res.json();
    log.ok(`gitStaged: ${data.diff.length} chars`);
    return data;
  },

  async gitLog(repoPath: string): Promise<{ commits: Commit[] }> {
    log.info(`gitLog: ${repoPath}`);
    const res = await fetch(`${BASE}/git/log?path=${encodeURIComponent(repoPath)}`);
    if (!res.ok) { const err = await res.json(); log.error("gitLog failed:", err); throw new Error(err.error); }
    const data = await res.json();
    log.ok(`gitLog: ${data.commits.length} commits`);
    return data;
  },

  async gitCommit(repoPath: string, hash: string): Promise<{ diff: string }> {
    log.info(`gitCommit: ${hash}`);
    const res = await fetch(`${BASE}/git/commit?path=${encodeURIComponent(repoPath)}&hash=${hash}`);
    if (!res.ok) { const err = await res.json(); log.error("gitCommit failed:", err); throw new Error(err.error); }
    const data = await res.json();
    log.ok(`gitCommit: ${data.diff.length} chars`);
    return data;
  },

  async *streamReview(
    messages: Message[],
    reviewContext: { files?: string[]; diff?: string }
  ): AsyncGenerator<string> {
    log.info(`streamReview: ${messages.length} messages, ${reviewContext.files?.length ?? 0} files, diff: ${reviewContext.diff ? reviewContext.diff.length + " chars" : "none"}`);
    log.info(`Last message: ${messages[messages.length - 1]?.content?.slice(0, 80)}…`);

    const res = await fetch(`${BASE}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, reviewContext }),
    });

    log.info(`POST /api/review → HTTP ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      log.error(`Review request failed (${res.status}):`, text);
      throw new Error(`Review request failed: ${res.status} ${text}`);
    }

    if (!res.body) {
      log.error("No response body from /api/review");
      throw new Error("No response body");
    }

    log.stream("SSE stream open, reading…");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let chunkCount = 0;
    let charCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        log.ok(`Stream ended — ${chunkCount} events, ${charCount} chars`);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "text") {
            chunkCount++;
            charCount += event.text.length;
            if (chunkCount === 1) log.stream("First token received ✨");
            yield event.text;
          }
          if (event.type === "done") {
            log.ok(`Stream done event received`);
          }
          if (event.type === "error") {
            log.error("Stream error event:", event.error);
            throw new Error(event.error);
          }
        } catch (parseErr) {
          // Ignore JSON parse errors on non-data lines
        }
      }
    }
  },
};
