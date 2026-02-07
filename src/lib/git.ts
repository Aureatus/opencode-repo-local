import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { RepoPluginError } from "./errors";

interface RunGitOptions {
  cwd?: string;
  timeoutMs?: number;
}

interface RunGitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function runGitRaw(
  args: string[],
  options: RunGitOptions = {}
): Promise<RunGitResult> {
  const cwd = options.cwd;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const processRef = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        processRef.kill("SIGTERM");
      }, timeoutMs);
    }

    processRef.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    processRef.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    processRef.on("error", (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new RepoPluginError("GIT_NOT_FOUND", "git binary not found on PATH")
        );
        return;
      }

      reject(
        new RepoPluginError(
          "GIT_FAILURE",
          "Failed to start git command",
          String(error)
        )
      );
    });

    processRef.on("close", (exitCode) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? 1,
      });
    });
  });
}

async function runGit(
  args: string[],
  options: RunGitOptions = {}
): Promise<string> {
  const result = await runGitRaw(args, options);
  if (result.exitCode !== 0) {
    const details = [`git ${args.join(" ")}`, result.stderr || result.stdout]
      .filter(Boolean)
      .join("\n");
    throw new RepoPluginError("GIT_FAILURE", "git command failed", details);
  }
  return result.stdout;
}

export async function ensureGitAvailable(): Promise<void> {
  await runGit(["--version"]);
}

export async function directoryExists(target: string): Promise<boolean> {
  try {
    const info = await stat(target);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  const result = await runGitRaw(["rev-parse", "--is-inside-work-tree"], {
    cwd,
  });
  return result.exitCode === 0 && result.stdout === "true";
}

export async function cloneRepo(
  repoUrl: string,
  targetPath: string,
  depth?: number
): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const args = ["clone", "--origin", "origin"];
  if (depth !== undefined) {
    args.push("--depth", String(depth));
  }
  args.push(repoUrl, targetPath);
  await runGit(args);
}

export async function fetchOrigin(cwd: string): Promise<void> {
  await runGit(["fetch", "--prune", "origin"], { cwd });
}

export async function checkoutRef(cwd: string, ref: string): Promise<void> {
  await runGit(["checkout", ref], { cwd });
}

export async function pullFfOnlyForBranch(
  cwd: string,
  branch: string
): Promise<void> {
  await runGit(["pull", "--ff-only", "--prune", "origin", branch], { cwd });
}

export async function hardResetToOriginBranch(
  cwd: string,
  branch: string
): Promise<void> {
  await runGit(["reset", "--hard", `origin/${branch}`], { cwd });
  await runGit(["clean", "-fd"], { cwd });
}

export function getHeadSha(cwd: string): Promise<string> {
  return runGit(["rev-parse", "HEAD"], { cwd });
}

export function getCurrentRef(cwd: string): Promise<string> {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
}

export async function getDefaultBranch(cwd: string): Promise<string | null> {
  const result = await runGitRaw(
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    { cwd }
  );
  if (result.exitCode !== 0 || !result.stdout) {
    return null;
  }

  const prefix = "origin/";
  return result.stdout.startsWith(prefix)
    ? result.stdout.slice(prefix.length)
    : result.stdout;
}

export function getOriginUrl(cwd: string): Promise<string> {
  return runGit(["remote", "get-url", "origin"], { cwd });
}

export async function isWorktreeDirty(cwd: string): Promise<boolean> {
  const output = await runGit(["status", "--porcelain"], { cwd });
  return output.length > 0;
}
