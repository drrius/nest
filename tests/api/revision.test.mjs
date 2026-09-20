import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { Revision } from "../../packages/contracts/src/revision.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
test("shared revisions accept canonical bigint values and reject whitespace/coercion", () => {
  const valid = Schema.is(Revision);
  for (const revision of [
    "0",
    "1",
    "9223372036854775807",
    ...Array.from({ length: 1000 }, (_, n) => String(BigInt(n) * 9007199254740991n)),
  ]) {
    assert.equal(valid(revision), true);
    for (const suffix of ["\n", "\r", "\u2028", "\u2029", " "])
      assert.equal(valid(revision + suffix), false);
  }
  for (const value of [0, 1, null, "", "01", "-1", "1.0", "1e3", " 1", "9223372036854775808"])
    assert.equal(valid(value), false);
});
