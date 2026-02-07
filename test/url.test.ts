import { describe, expect, test } from "bun:test";

import { parseRepoUrl } from "../src/lib/url";

describe("parseRepoUrl", () => {
  test("parses https repository URLs", () => {
    const parsed = parseRepoUrl("https://github.com/anomalyco/opencode.git", false);
    expect(parsed.host).toBe("github.com");
    expect(parsed.pathSegments).toEqual(["anomalyco", "opencode"]);
    expect(parsed.canonicalUrl).toBe("https://github.com/anomalyco/opencode.git");
  });

  test("parses ssh repository URLs when enabled", () => {
    const parsed = parseRepoUrl("git@github.com:anomalyco/opencode.git", true);
    expect(parsed.host).toBe("github.com");
    expect(parsed.pathSegments).toEqual(["anomalyco", "opencode"]);
  });

  test("rejects ssh repository URLs when disabled", () => {
    expect(() => parseRepoUrl("git@github.com:anomalyco/opencode.git", false)).toThrow();
  });
});
