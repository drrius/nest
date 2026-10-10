import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  auditNativeMigrationManifest,
  parseTestMigrationManifest,
  readTestMigrationManifest,
} from "../../tools/migration/verify-test-manifest.mjs";

test("test migration manifest covers every current native source with its exact hash", () => {
  const { entries, sources } = readTestMigrationManifest();
  assert.ok(sources.size > 0);
  assert.deepEqual(auditNativeMigrationManifest(entries, sources), {
    complete: true,
    legacyCount: entries.filter((entry) => entry.source === "legacy").length,
    nativeCount: sources.size,
    sourceCount: sources.size,
    missing: [],
    unexpected: [],
    changed: [],
  });
});

test("a newly added source without a manifest entry refuses the gate", () => {
  const { entries, sources } = readTestMigrationManifest();
  sources.set("20990101000000_native_new_guard.sql", "a".repeat(64));
  const result = auditNativeMigrationManifest(entries, sources);
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["20990101000000_native_new_guard.sql"]);
});

test("changed migration bytes and nonexistent manifest sources both refuse the gate", () => {
  const { entries, sources } = readTestMigrationManifest();
  const current = entries.find((entry) => entry.source === "native");
  sources.set(current.file, "0".repeat(64));
  entries.push({
    source: "native",
    file: "20990101000000_native_absent.sql",
    sha256: "b".repeat(64),
    testAdjustment: "none",
  });
  const result = auditNativeMigrationManifest(entries, sources);
  assert.equal(result.complete, false);
  assert.deepEqual(result.changed, [current.file]);
  assert.deepEqual(result.unexpected, ["20990101000000_native_absent.sql"]);
});

test("duplicate entries and invalid manifest paths cannot hide missing sources", () => {
  const text = readFileSync(
    new URL("../../docs/native-rewrite/nest-test-migration-manifest.csv", import.meta.url),
    "utf8",
  );
  const row = text.split("\n")[1];
  assert.throws(() => parseTestMigrationManifest(text.trimEnd() + "\n" + row), /Duplicate/u);
  assert.throws(
    () => parseTestMigrationManifest(text.replace(row.split(",")[1], "../outside.sql")),
    /Invalid/u,
  );
});
