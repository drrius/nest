import assert from "node:assert/strict";
import test from "node:test";
import { compareLegacyCatalog } from "../../tools/migration/compare-legacy-catalog.mjs";

const row = {
  signature: "private.example(uuid)",
  schema: "private",
  owner: "postgres",
  definitionSha256: "a".repeat(64),
  securityDefiner: true,
  anonymousExecute: false,
  authenticatedExecute: false,
  serviceRoleExecute: false,
};

test("matching definitions and grants report owner differences without claiming capability parity", () => {
  const result = compareLegacyCatalog([row], [{ ...row, owner: "nest_fixture_owner" }]);
  assert.equal(result.exactFunctionCatalogMatch, true);
  assert.deepEqual(result.ownerDifferences, [
    {
      signature: "private.example(uuid)",
      observed: "postgres",
      fixture: "nest_fixture_owner",
    },
  ]);
  assert.equal(result.ownerCapabilityParityVerified, false);
  assert.equal(result.runtimeSemanticParityVerified, false);
});

test("exact sets distinguish missing signatures, extra overloads, body changes and execution grants", () => {
  const missing = { ...row, signature: "public.missing()", schema: "public" };
  const extra = { ...row, signature: "private.example(text)" };
  const changed = { ...row, definitionSha256: "b".repeat(64), authenticatedExecute: true };
  const result = compareLegacyCatalog([row, missing], [changed, extra]);
  assert.equal(result.exactFunctionCatalogMatch, false);
  assert.deepEqual(result.missing, ["public.missing()"]);
  assert.deepEqual(result.extra, ["private.example(text)"]);
  assert.deepEqual(
    result.mismatches.map(({ signature, fields }) => ({ signature, fields })),
    [
      {
        signature: "private.example(uuid)",
        fields: ["definitionSha256", "authenticatedExecute"],
      },
    ],
  );
});

test("duplicate or malformed catalog evidence fails rather than producing a matching result", () => {
  assert.throws(() => compareLegacyCatalog([row, row], [row]), /Duplicate catalog signature/u);
  assert.throws(
    () => compareLegacyCatalog([row], [{ ...row, securityDefiner: undefined }]),
    /flags/u,
  );
  assert.throws(
    () => compareLegacyCatalog([{ ...row, definitionSha256: "" }], [row]),
    /definition/u,
  );
});
