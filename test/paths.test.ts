import { describe, expect, test } from "bun:test";

import { buildRepoPath } from "../src/lib/paths";
import type { ParsedRepoUrl } from "../src/lib/types";

describe("buildRepoPath", () => {
  test("builds deterministic local paths", () => {
    const parsed: ParsedRepoUrl = {
      raw: "https://github.com/anomalyco/opencode.git",
      host: "github.com",
      pathSegments: ["anomalyco", "opencode"],
      canonicalUrl: "https://github.com/anomalyco/opencode.git",
      key: "github.com/anomalyco/opencode"
    };

    const output = buildRepoPath("/tmp/opencode-repos", parsed);
    expect(output).toBe("/tmp/opencode-repos/github.com/anomalyco/opencode");
  });
});
