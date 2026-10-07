import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function requiresSourceChecks(paths, baseVerified = false) {
  return (
    baseVerified !== true ||
    !paths?.length ||
    !paths.every((path) => /^(docs|evidence)\/.+\.md$/u.test(path))
  );
}

export function changedPaths(base, cwd = process.cwd()) {
  if (!/^[a-f0-9]{40}$/iu.test(base ?? "") || /^0+$/u.test(base)) return null;
  try {
    return execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", base, "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    return null;
  }
}

export function checkDocumentLinks(paths, cwd = process.cwd()) {
  for (const path of paths) {
    const file = resolve(cwd, path);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8").replace(/^(```|~~~)[\s\S]*?^\1.*$/gmu, "");
    for (const match of text.matchAll(/\]\(([^)]+)\)/gu)) {
      const target = match[1].replace(/^<|>$/gu, "").split("#")[0];
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(target)) continue;
      const destination = resolve(file, "..", decodeURI(target));
      if (relative(cwd, destination).startsWith("..")) continue;
      if (!existsSync(destination)) throw new Error(`${path}: missing linked file ${target}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = changedPaths(process.env.NEST_CI_DIFF_BASE);
  const docsOnly = !requiresSourceChecks(paths, true);
  const source = requiresSourceChecks(paths, process.env.NEST_CI_BASE_VERIFIED === "true");
  if (docsOnly) checkDocumentLinks(paths);
  process.stdout.write(`source=${source}\n`);
}
