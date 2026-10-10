import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  changedPaths,
  requiresSourceChecks,
  checkDocumentLinks,
} from "../../scripts/ci-change-scope.mjs";

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), "nest-ci-scope-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  return { cwd, git };
}

test("only repository documentation markdown can omit application checks", () => {
  assert.equal(requiresSourceChecks(["docs/progress.md", "evidence/day/README.md"], true), false);
  for (const path of [
    "apps/ios/Nest/View.swift",
    "apps/api/src/index.ts",
    "supabase/migrations/a.sql",
    "pnpm-lock.yaml",
    ".github/workflows/ci.yml",
    "scripts/ci-change-scope.mjs",
    "tests/fixture.md",
    "docs/native-rewrite/manifest.csv",
    "docs/prototypes/index.html",
    "evidence/result.json",
    "evidence/result.log",
    "README.md",
  ])
    assert.equal(requiresSourceChecks(["docs/progress.md", path], true), true, path);
  assert.equal(requiresSourceChecks([]), true);
  assert.equal(requiresSourceChecks(null), true);
});

test("documentation cannot hide unverified, pending or failed source checks", () => {
  const paths = ["docs/progress.md"];
  assert.equal(requiresSourceChecks(paths), true);
  assert.equal(requiresSourceChecks(paths, false), true);
  assert.equal(requiresSourceChecks(paths, true), false);
  assert.equal(requiresSourceChecks([], true), true);
  assert.equal(requiresSourceChecks(null, true), true);
});

test("real git diff catches deleted or renamed source even when its destination is markdown", (t) => {
  const { cwd, git } = repository(t);
  mkdirSync(join(cwd, "docs"));
  writeFileSync(join(cwd, "source.ts"), "export const value=1;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "source");
  const base = git("rev-parse", "HEAD");
  git("mv", "source.ts", "docs/moved.md");
  git("commit", "--quiet", "-m", "rename");
  assert.deepEqual(changedPaths(base, cwd), ["docs/moved.md", "source.ts"]);
  assert.equal(requiresSourceChecks(changedPaths(base, cwd)), true);
  for (const invalid of [undefined, "", "0".repeat(40), "1".repeat(40), "--help"])
    assert.equal(changedPaths(invalid, cwd), null);
});

test("docs-only diffs retain relative-link checks and refuse broken links", (t) => {
  const { cwd, git } = repository(t);
  mkdirSync(join(cwd, "docs"));
  writeFileSync(join(cwd, "docs/target.md"), "Target\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, "docs/progress.md"), "[Target](target.md#heading)\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "docs");
  const paths = changedPaths(base, cwd);
  assert.deepEqual(paths, ["docs/progress.md"]);
  assert.equal(requiresSourceChecks(paths, true), false);
  assert.doesNotThrow(() => checkDocumentLinks(paths, cwd));
  const script = fileURLToPath(new URL("../../scripts/ci-change-scope.mjs", import.meta.url));
  const run = (verified) =>
    execFileSync(process.execPath, [script], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, NEST_CI_DIFF_BASE: base, NEST_CI_BASE_VERIFIED: verified },
    });
  assert.equal(run("true"), "source=false\n");
  assert.equal(run("false"), "source=true\n");
  writeFileSync(join(cwd, "docs/progress.md"), "[Broken](missing.md)\n");
  assert.throws(() => checkDocumentLinks(paths, cwd), /missing linked file missing.md/);
});
