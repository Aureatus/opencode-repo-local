import { RepoPluginError } from "./errors";
import type { ParsedRepoUrl } from "./types";

const SSH_PATTERN = /^git@([^:/]+):(.+)$/;
const GIT_SUFFIX_PATTERN = /\.git$/i;

function splitPathSegments(input: string): string[] {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    return [];
  }

  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [];
  }

  const lastIndex = segments.length - 1;
  segments[lastIndex] = segments[lastIndex].replace(GIT_SUFFIX_PATTERN, "");
  return segments;
}

function validateSegments(segments: string[]): void {
  if (segments.length < 2) {
    throw new RepoPluginError(
      "INVALID_URL",
      "Repository URL must include owner and repository name"
    );
  }

  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new RepoPluginError(
        "INVALID_URL",
        "Repository URL contains an invalid path segment"
      );
    }
  }
}

function makeRepoKey(host: string, segments: string[]): string {
  return `${host.toLowerCase()}/${segments.join("/").toLowerCase()}`;
}

function buildParsed(
  raw: string,
  host: string,
  segmentsInput: string[] | string,
  protocol: "https" | "ssh"
): ParsedRepoUrl {
  const segments = Array.isArray(segmentsInput)
    ? segmentsInput
    : splitPathSegments(segmentsInput);
  validateSegments(segments);

  const normalizedHost = host.toLowerCase();
  const canonicalPath = segments.join("/");
  const canonicalUrl =
    protocol === "https"
      ? `https://${normalizedHost}/${canonicalPath}.git`
      : `git@${normalizedHost}:${canonicalPath}.git`;

  return {
    raw,
    host: normalizedHost,
    pathSegments: segments,
    canonicalUrl,
    key: makeRepoKey(normalizedHost, segments),
  };
}

export function parseRepoUrl(repo: string, allowSsh: boolean): ParsedRepoUrl {
  const raw = repo.trim();
  if (!raw) {
    throw new RepoPluginError("INVALID_URL", "Repository URL is required");
  }

  if (raw.startsWith("https://")) {
    const url = new URL(raw);
    return buildParsed(
      raw,
      url.hostname,
      splitPathSegments(url.pathname),
      "https"
    );
  }

  if (allowSsh) {
    const match = raw.match(SSH_PATTERN);
    if (match) {
      const host = match[1];
      const path = match[2] ?? "";
      return buildParsed(raw, host, splitPathSegments(path), "ssh");
    }
  }

  throw new RepoPluginError(
    "INVALID_URL",
    allowSsh
      ? "Repository URL must use https:// or git@host:owner/repo.git format"
      : "Repository URL must use https:// format"
  );
}
