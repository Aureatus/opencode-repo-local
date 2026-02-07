export type UpdateMode = "ff-only" | "fetch-only" | "reset-clean";

export type RepoEnsureStatus =
  | "cloned"
  | "updated"
  | "already-current"
  | "fetched";

export interface RepoEnsureLocalArgs {
  repo: string;
  ref?: string;
  clone_root?: string;
  depth?: number;
  update_mode?: string;
  allow_ssh?: boolean;
}

export interface ParsedRepoUrl {
  raw: string;
  host: string;
  pathSegments: string[];
  canonicalUrl: string;
  key: string;
}

export interface RepoEnsureResult {
  status: RepoEnsureStatus;
  repo_url: string;
  local_path: string;
  current_ref: string;
  default_branch: string | null;
  head_sha: string;
  actions: string[];
  instructions: string[];
}
