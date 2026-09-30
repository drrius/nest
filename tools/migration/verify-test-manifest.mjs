import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = resolve(root, "docs/native-rewrite/nest-test-migration-manifest.csv");

export function parseTestMigrationManifest(text) {
  const [header, ...lines] = text.trimEnd().split(/\r?\n/u);
  if (header !== "source,file,sha256,test_adjustment")
    throw new Error("Invalid migration manifest header");
  const seen = new Set();
  return lines.map((line, index) => {
    const cells = line.split(",");
    const [source, file, sha256, testAdjustment] = cells;
    if (
      cells.length !== 4 ||
      !["legacy", "native"].includes(source) ||
      !/^\d{14}_[a-z0-9_]+\.sql$/u.test(file) ||
      !/^[a-f0-9]{64}$/u.test(sha256) ||
      !testAdjustment ||
      line.includes('"')
    )
      throw new Error(`Invalid migration manifest row ${index + 2}`);
    const key = `${source}:${file}`;
    if (seen.has(key)) throw new Error(`Duplicate migration manifest row ${index + 2}`);
    seen.add(key);
    return { source, file, sha256, testAdjustment };
  });
}

export function auditNativeMigrationManifest(entries, sources) {
  const native = new Map(
    entries.filter((entry) => entry.source === "native").map((entry) => [entry.file, entry]),
  );
  const missing = [...sources.keys()]
    .filter((file) => !native.has(file))
    .sort((a, b) => a.localeCompare(b));
  const unexpected = [...native.keys()]
    .filter((file) => !sources.has(file))
    .sort((a, b) => a.localeCompare(b));
  const changed = [...native.values()]
    .filter((entry) => sources.has(entry.file) && sources.get(entry.file) !== entry.sha256)
    .map((entry) => entry.file)
    .sort((a, b) => a.localeCompare(b));
  return {
    complete: missing.length === 0 && unexpected.length === 0 && changed.length === 0,
    legacyCount: entries.filter((entry) => entry.source === "legacy").length,
    nativeCount: native.size,
    sourceCount: sources.size,
    missing,
    unexpected,
    changed,
  };
}

export function readTestMigrationManifest() {
  const directory = resolve(root, "supabase/migrations");
  const sources = new Map(
    readdirSync(directory)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(resolve(directory, file)))
          .digest("hex"),
      ]),
  );
  return { entries: parseTestMigrationManifest(readFileSync(manifestPath, "utf8")), sources };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2)
    throw new Error("This read-only audit accepts no database or path arguments");
  const { entries, sources } = readTestMigrationManifest();
  const report = auditNativeMigrationManifest(entries, sources);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.complete) process.exitCode = 1;
}
