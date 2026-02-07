import { tool } from "@opencode-ai/plugin";

import { RepoPluginError, toRepoPluginError } from "../lib/errors";
import {
  checkoutRef,
  cloneRepo,
  directoryExists,
  ensureGitAvailable,
  fetchOrigin,
  getCurrentRef,
  getDefaultBranch,
  getHeadSha,
  getOriginUrl,
  hardResetToOriginBranch,
  isGitRepository,
  isWorktreeDirty,
  pullFfOnlyForBranch
} from "../lib/git";
import { buildRepoPath, resolveCloneRoot } from "../lib/paths";
import type { RepoEnsureResult, UpdateMode } from "../lib/types";
import { parseRepoUrl } from "../lib/url";

const UPDATE_MODES: ReadonlySet<string> = new Set(["ff-only", "fetch-only", "reset-clean"]);

const REPO_TOOL_ARGS = {
  repo: tool.schema.string().describe("Repository URL to clone or update."),
  ref: tool.schema.string().optional().describe("Optional branch/tag/sha to checkout after clone/fetch."),
  clone_root: tool.schema.string().optional().describe("Optional absolute clone root path override."),
  depth: tool.schema.number().int().positive().optional().describe("Optional shallow clone depth."),
  update_mode: tool.schema
    .string()
    .optional()
    .describe("Update policy: ff-only (default), fetch-only, or reset-clean."),
  allow_ssh: tool.schema
    .boolean()
    .optional()
    .describe("Allow git@host:owner/repo.git URLs. Defaults to false unless OPENCODE_REPO_ALLOW_SSH=true.")
} as const;

const ALLOWED_KEYS = new Set(Object.keys(REPO_TOOL_ARGS));

function normalizeUpdateMode(value: string | undefined): UpdateMode {
  const mode = (value ?? "ff-only").trim();
  if (!UPDATE_MODES.has(mode)) {
    throw new RepoPluginError("INVALID_UPDATE_MODE", `Unsupported update_mode: ${mode}`);
  }
  return mode as UpdateMode;
}

function formatFailure(error: unknown): never {
  const parsed = toRepoPluginError(error);
  const detailSuffix = parsed.details ? `\n${parsed.details}` : "";
  throw new Error(`[${parsed.code}] ${parsed.message}${detailSuffix}`);
}

function toResultText(result: RepoEnsureResult): string {
  return JSON.stringify(result, null, 2);
}

export const repoEnsureLocalTool = tool({
  description: "Clone or update a repository locally and return its absolute path for OpenCode built-in tools.",
  args: REPO_TOOL_ARGS,
  async execute(args) {
    try {
      const extraKeys = Object.keys(args ?? {}).filter((key) => !ALLOWED_KEYS.has(key));
      if (extraKeys.length > 0) {
        throw new RepoPluginError("INVALID_ARGS", `Unknown arguments: ${extraKeys.join(", ")}`);
      }

      const repoInput = args.repo?.trim();
      if (!repoInput) {
        throw new RepoPluginError("INVALID_URL", "repo argument cannot be empty");
      }

      const ref = args.ref?.trim() || undefined;
      const mode = normalizeUpdateMode(args.update_mode);
      const allowSsh = args.allow_ssh ?? process.env.OPENCODE_REPO_ALLOW_SSH === "true";
      const parsedRepo = parseRepoUrl(repoInput, allowSsh);

      await ensureGitAvailable();

      const cloneRoot = await resolveCloneRoot(args.clone_root);
      const localPath = buildRepoPath(cloneRoot, parsedRepo);
      const actions: string[] = [];

      let status: RepoEnsureResult["status"];
      if (!(await directoryExists(localPath))) {
        await cloneRepo(parsedRepo.raw, localPath, args.depth);
        actions.push("cloned_repository");

        if (ref) {
          await checkoutRef(localPath, ref);
          actions.push(`checked_out_${ref}`);
        }

        status = "cloned";
      } else {
        if (!(await isGitRepository(localPath))) {
          throw new RepoPluginError("NOT_GIT_REPO", `Target path exists but is not a git repository: ${localPath}`);
        }

        const originUrl = await getOriginUrl(localPath);
        const existingOrigin = parseRepoUrl(originUrl, true);
        if (existingOrigin.key !== parsedRepo.key) {
          throw new RepoPluginError(
            "REPO_URL_MISMATCH",
            "Existing clone origin does not match requested repository",
            `requested=${parsedRepo.canonicalUrl}\nexisting=${existingOrigin.canonicalUrl}`
          );
        }

        const beforeSha = await getHeadSha(localPath);

        await fetchOrigin(localPath);
        actions.push("fetched_origin");

        if (ref) {
          await checkoutRef(localPath, ref);
          actions.push(`checked_out_${ref}`);
        }

        if (mode === "ff-only") {
          if (await isWorktreeDirty(localPath)) {
            throw new RepoPluginError(
              "DIRTY_WORKTREE",
              "Cannot fast-forward because working tree has local changes",
              "Commit/stash changes or use update_mode=fetch-only"
            );
          }

          const currentRef = await getCurrentRef(localPath);
          if (currentRef !== "HEAD") {
            await pullFfOnlyForBranch(localPath, currentRef);
            actions.push(`fast_forwarded_${currentRef}`);
          } else {
            actions.push("detached_head_no_pull");
          }
        }

        if (mode === "reset-clean") {
          const currentRef = await getCurrentRef(localPath);
          if (currentRef === "HEAD") {
            throw new RepoPluginError(
              "DETACHED_HEAD",
              "Cannot use reset-clean while repository is in detached HEAD state"
            );
          }

          await hardResetToOriginBranch(localPath, currentRef);
          actions.push(`reset_clean_${currentRef}`);
        }

        const afterSha = await getHeadSha(localPath);
        if (mode === "fetch-only") {
          status = "fetched";
        } else {
          status = beforeSha === afterSha ? "already-current" : "updated";
        }
      }

      const result: RepoEnsureResult = {
        status,
        repo_url: parsedRepo.canonicalUrl,
        local_path: localPath,
        current_ref: await getCurrentRef(localPath),
        default_branch: await getDefaultBranch(localPath),
        head_sha: await getHeadSha(localPath),
        actions,
        instructions: [
          `Use built-in tools with local_path: ${localPath}`,
          `Example: run Grep/Read/Glob with files under ${localPath}`
        ]
      };

      return toResultText(result);
    } catch (error) {
      formatFailure(error);
    }
  }
});
