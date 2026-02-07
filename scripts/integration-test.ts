import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { repoEnsureLocal } from "../src/tools/repoEnsureLocal";

type IntegrationSummary = {
  repo: string;
  cloneRoot: string;
  firstStatus: string;
  secondStatus: string;
  localPath: string;
};

function assertValidStatus(value: string): void {
  const valid = new Set(["cloned", "updated", "already-current", "fetched"]);
  if (!valid.has(value)) {
    throw new Error(`Unexpected repo_ensure_local status: ${value}`);
  }
}

async function main(): Promise<void> {
  const repo = Bun.argv[2] || process.env.OPENCODE_REPO_INTEGRATION_REPO || "https://github.com/anomalyco/opencode.git";
  const keep = process.env.OPENCODE_REPO_INTEGRATION_KEEP === "true";
  const providedRoot = process.env.OPENCODE_REPO_INTEGRATION_ROOT;

  const createdTempRoot = !providedRoot;
  const cloneRoot = providedRoot || (await mkdtemp(path.join(os.tmpdir(), "opencode-repo-local-plugin-")));

  try {
    const first = await repoEnsureLocal({
      repo,
      clone_root: cloneRoot,
      update_mode: "fetch-only",
      allow_ssh: true
    });

    const second = await repoEnsureLocal({
      repo,
      clone_root: cloneRoot,
      update_mode: "fetch-only",
      allow_ssh: true
    });

    assertValidStatus(first.status);
    assertValidStatus(second.status);

    if (!first.local_path.startsWith(path.resolve(cloneRoot))) {
      throw new Error("local_path does not resolve under clone root");
    }

    const summary: IntegrationSummary = {
      repo,
      cloneRoot,
      firstStatus: first.status,
      secondStatus: second.status,
      localPath: first.local_path
    };

    console.log("Integration test passed");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (createdTempRoot && !keep) {
      await rm(cloneRoot, { recursive: true, force: true });
    }
  }
}

await main();
