import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

test("audited legacy recurring writers retain their pinned fixture hashes", () => {
  const root = new URL("./legacy-recurring/", import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL("writer-provenance.json", root)));
  assert.equal(provenance.commit, "4a528c96caf41515a70291ccecbba9d7b35e3349");
  for (const file of provenance.files) {
    const source = readFileSync(new URL(file.fixture, root));
    assert.equal(createHash("sha256").update(source).digest("hex"), file.fixtureSha256);
    assert.ok(source.toString().includes(`function ${file.function}(`));
  }
});
