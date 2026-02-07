import type { Plugin } from "@opencode-ai/plugin";

import { repoEnsureLocalTool } from "./tools/repo-ensure-local";

export const RepoLocalPlugin: Plugin = () => {
  return Promise.resolve({
    tool: {
      repo_ensure_local: repoEnsureLocalTool,
    },
  });
};

export default RepoLocalPlugin;
