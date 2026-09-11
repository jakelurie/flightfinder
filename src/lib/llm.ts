import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

// Two ways to reach Claude:
//  - "claude-cli" (default): the locally logged-in Claude Code CLI in headless print mode, so it runs on
//    your Claude subscription. No API key.
//  - "anthropic": the API, only when ANTHROPIC_API_KEY is set.
// LLM_PROVIDER=claude-cli|anthropic|none overrides the automatic choice.

type Backend = "claude-cli" | "anthropic" | "none";

const CLI_MODEL = process.env.CLAUDE_MODEL || "opus";
const API_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

function findClaude(): string | null {
  if (process.env.CLAUDE_BIN) return existsSync(process.env.CLAUDE_BIN) ? process.env.CLAUDE_BIN : null;
  const dirs = [...(process.env.PATH ?? "").split(path.delimiter), path.join(os.homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  for (const dir of dirs) {
    const bin = dir && path.join(dir, "claude");
    if (bin && existsSync(bin)) return bin;
  }
  return null;
}

export function llmBackend(): Backend {
  const pref = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (pref === "none") return "none";
  if (pref === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : "none";
  if (pref === "claude-cli") return findClaude() ? "claude-cli" : "none";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return findClaude() ? "claude-cli" : "none";
}

export function hasLLM(): boolean {
  return llmBackend() !== "none";
}

export function llmLabel(): string | null {
  const backend = llmBackend();
  if (backend === "claude-cli") return `Claude ${CLI_MODEL} (your subscription)`;
  if (backend === "anthropic") return `${API_MODEL} (API key)`;
  return null;
}

interface CallOpts {
  schema: z.ZodType;
  system: string;
  user: string;
  effort?: "low" | "medium" | "high";
}

/**
 * One structured-output call to Claude. The response is constrained to the JSON shape of `schema`,
 * but enum/number constraints are only hints, so this returns the raw parsed JSON and leaves strict
 * validation (and repair of near-misses) to the caller.
 */
export async function structuredCall(opts: CallOpts): Promise<unknown> {
  const backend = llmBackend();
  if (backend === "claude-cli") return viaClaudeCli(opts);
  if (backend === "anthropic") return viaApi(opts);
  throw new Error("No LLM configured");
}

/** JSON Schema for --json-schema; the CLI's validator doesn't resolve the draft 2020-12 meta-schema URL. */
function cliSchema(schema: z.ZodType): object {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function viaClaudeCli(opts: CallOpts): Promise<unknown> {
  const bin = findClaude();
  if (!bin) return Promise.reject(new Error("claude CLI not found"));
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(cliSchema(opts.schema)),
    "--system-prompt", opts.system,
    "--model", CLI_MODEL,
    "--effort", opts.effort ?? "low",
    // A pure text-in, JSON-out call: no tools, no settings/MCP/CLAUDE.md, nothing saved.
    "--tools", "",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
  // Drop variables that would make the CLI think it's nested inside another Claude Code session.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_.*|CLAUDE_PID|CLAUDE_EFFORT)$/.test(k)) delete env[k];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: os.tmpdir(), env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("claude CLI timed out"));
    }, 150_000);
    child.stdout.on("data", (d: Buffer) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const out = JSON.parse(stdout) as { is_error?: boolean; result?: string; structured_output?: unknown };
        if (out.is_error) return reject(new Error(`claude CLI: ${out.result ?? "error"}`));
        if (out.structured_output !== undefined) return resolve(out.structured_output);
        return resolve(JSON.parse(out.result ?? ""));
      } catch {
        reject(new Error(`claude CLI exited ${code}: ${(stderr || stdout).slice(0, 300)}`));
      }
    });
    child.stdin.end(opts.user);
  });
}

let client: Anthropic | null = null;

async function viaApi(opts: CallOpts): Promise<unknown> {
  client ??= new Anthropic();
  const response = await client.beta.messages.create(
    {
      model: API_MODEL,
      max_tokens: 8000,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? "low" },
      // Server-side refusal fallbacks: if the primary model declines, the API re-runs on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { timeout: 90_000 },
  );
  if (response.stop_reason === "refusal") throw new Error("The model declined this request");
  if (response.stop_reason === "max_tokens") throw new Error("Model output was truncated");
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return JSON.parse(text);
}
