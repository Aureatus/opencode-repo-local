import type { Plugin } from "@opencode-ai/plugin";

import { repoEnsureLocalTool } from "./tools/repoEnsureLocal";

export const RepoLocalPlugin: Plugin = async () => {
  return {
    tool: {
      repo_ensure_local: repoEnsureLocalTool
    }
  };
};

export default RepoLocalPlugin;
