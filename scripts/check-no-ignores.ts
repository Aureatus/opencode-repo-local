import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

interface Violation {
  file: string;
  line: number;
  text: string;
}

const ROOT_DIR = process.cwd();

const SKIP_DIRS = new Set([
  ".git",
  "dist",
  "node_modules",
  ".vscode",
  ".zed",
  ".claude",
]);

const SCAN_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

const TS_DIRECTIVES = [
  "@ts-ignore",
  "@ts-expect-error",
  "@ts-nocheck",
] as const;

const BIOME_DIRECTIVE = "biome-ignore";

function shouldSkipFile(relativePath: string): boolean {
  return relativePath === "scripts/check-no-ignores.ts";
}

function checkLine(
  file: string,
  line: string,
  lineNumber: number,
  violations: Violation[]
): void {
  if (line.includes(BIOME_DIRECTIVE)) {
    violations.push({ file, line: lineNumber, text: line.trim() });
    return;
  }

  for (const directive of TS_DIRECTIVES) {
    if (line.includes(directive)) {
      violations.push({ file, line: lineNumber, text: line.trim() });
      return;
    }
  }
}

async function scanFile(relativePath: string): Promise<Violation[]> {
  if (shouldSkipFile(relativePath)) {
    return [];
  }

  const fullPath = path.join(ROOT_DIR, relativePath);
  const content = await readFile(fullPath, "utf8");
  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (const [index, line] of lines.entries()) {
    checkLine(relativePath, line, index + 1, violations);
  }

  return violations;
}

async function walk(relativeDir: string): Promise<string[]> {
  const fullDir = path.join(ROOT_DIR, relativeDir);
  const entries = await readdir(fullDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = relativeDir
      ? path.join(relativeDir, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const nested = await walk(relativePath);
      files.push(...nested);
      continue;
    }

    const extension = path.extname(entry.name);
    if (!SCAN_EXTENSIONS.has(extension)) {
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

async function main(): Promise<void> {
  const files = await walk("");
  const violations: Violation[] = [];

  for (const file of files) {
    const fileViolations = await scanFile(file);
    violations.push(...fileViolations);
  }

  if (violations.length === 0) {
    return;
  }

  console.error("Found forbidden ignore directives:");
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} ${violation.text}`);
  }

  throw new Error(
    "Do not commit biome-ignore or @ts-ignore/@ts-expect-error/@ts-nocheck directives"
  );
}

await main();
