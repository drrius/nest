import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  MealProposalContent,
  MealProposal,
  MealProposalEnvelope,
  GenerateMealProposalInput,
  ReplaceProposalMealInput,
  ChooseProposalRecipeInput,
  ApproveMealProposal,
  MealProposalGenerationReceipt,
  MealProposalChangeReceipt,
  MealProposalApprovalReceipt,
} from "../../packages/contracts/src/meal-proposals.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const domainRequire = createRequire(new URL("../../packages/domain/package.json", import.meta.url));
const Schema = require("effect/Schema"),
  fc = domainRequire("fast-check");
const id = (n) => `abcdef00-0000-4000-8000-${String(n).padStart(12, "0")}`;
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
const recipe = {
  title: "Soup",
  servings: 2,
  instructions: "Simmer until tender.",
  recipeUrl: null,
  notes: null,
  ingredients: [{ name: "Carrots", quantity: "200", unit: "g", categoryId: null, note: null }],
};
const entry = (n = 1, date = "2030-01-07", slot = "dinner") => ({
  entryId: id(n),
  date,
  slot,
  source: { kind: "suggested", recipe },
  estimatedCaloriesPerServing: 350,
});
const content = { weekStart: "2030-01-07", familiarOnly: false, entries: [entry()] };
const proposal = {
  ...content,
  proposalId: id(50),
  revision: "2",
  weekRevision: "9007199254740993",
  status: "ready",
  expiresAt: 2000000000000,
  failure: null,
};
const owner = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  proposalId: id(50),
};
function saved() {
  return {
    kind: "saved",
    libraryRevision: "9007199254740993",
    recipe: {
      ...recipe,
      definitionId: id(20),
      ingredients: recipe.ingredients.map((i, order) => ({
        ...i,
        ingredientId: id(200 + order),
        order,
      })),
    },
  };
}

test("proposal content preserves full recipes, retained saved provenance and explicitly estimated calories", () => {
  assert.deepEqual(decode(MealProposalContent, content), content);
  const familiar = {
    ...content,
    familiarOnly: true,
    entries: [{ ...entry(), source: saved(), estimatedCaloriesPerServing: null }],
  };
  assert.deepEqual(decode(MealProposalContent, familiar), familiar);
  for (const patch of [
    { entries: [] },
    { familiarOnly: true },
    { entries: [entry(1, "2030-01-14")] },
    { entries: [entry(), entry(2)] },
    { entries: [entry(), { ...entry(1, "2030-01-08"), entryId: id(1).toUpperCase() }] },
    { entries: [{ ...entry(), estimatedCaloriesPerServing: -1 }] },
    {
      entries: [
        { ...entry(), source: { kind: "suggested", recipe: { ...recipe, instructions: "" } } },
      ],
    },
    { partnerCalorieGoal: 2500 },
  ])
    assert.throws(() => decode(MealProposalContent, { ...content, ...patch }));
});

test("private proposal states distinguish incomplete generation, failure, readiness and retained terminal content", () => {
  for (const status of ["ready", "approved", "discarded"])
    assert.equal(decode(MealProposal, { ...proposal, status }).status, status);
  assert.equal(
    decode(MealProposal, { ...proposal, status: "generating", entries: null }).entries,
    null,
  );
  assert.equal(
    decode(MealProposal, {
      ...proposal,
      status: "failed",
      entries: null,
      failure: "no_suitable_meals",
    }).status,
    "failed",
  );
  for (const patch of [
    { status: "generating" },
    { status: "failed" },
    { entries: null },
    { revision: "0" },
    { failure: "unavailable" },
    { expiresAt: NaN },
    { constraints: ["Private partner preference"] },
  ])
    assert.throws(() => decode(MealProposal, { ...proposal, ...patch }));
  assert.throws(() =>
    decode(MealProposalEnvelope, {
      version: 1,
      actorId: id(1),
      householdId: id(10),
      proposal,
      stateHash: "a".repeat(64),
    }),
  );
});

test("generation and single-slot changes cannot carry approval, private identity or alternate plan payloads", () => {
  const generate = {
    weekStart: content.weekStart,
    expectedWeekRevision: proposal.weekRevision,
    familiarOnly: false,
  };
  assert.deepEqual(decode(GenerateMealProposalInput, generate), generate);
  const target = { proposalId: id(50), expectedRevision: "2", entryId: id(1) };
  assert.deepEqual(decode(ReplaceProposalMealInput, target), target);
  const choice = { ...target, definitionId: id(20), expectedLibraryRevision: "3" };
  assert.deepEqual(decode(ChooseProposalRecipeInput, choice), choice);
  for (const [schema, value] of [
    [GenerateMealProposalInput, generate],
    [ReplaceProposalMealInput, target],
    [ChooseProposalRecipeInput, choice],
  ]) {
    for (const patch of [
      { approved: true },
      { actorId: id(2) },
      { householdId: id(20) },
      { entries: [entry()] },
      { operationId: id(9) },
    ])
      assert.throws(() => decode(schema, { ...value, ...patch }));
  }
  const approve = { proposalId: id(50), expectedRevision: "2", operationId: id(100) };
  assert.deepEqual(decode(ApproveMealProposal, approve), approve);
  assert.throws(() => decode(ApproveMealProposal, { ...approve, content }));
  assert.deepEqual(
    decode(MealProposalGenerationReceipt, { ...owner, revision: "1", ...generate }),
    { ...owner, revision: "1", ...generate },
  );
});

test("generated full-week approvals bind distinct slots and exact bigint revision deltas", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 400000 }),
      fc.integer({ min: 1, max: 21 }),
      fc.bigInt({ min: 0n, max: 9223372036854775786n }),
      (week, count, baseline) => {
        const start = Date.parse("1970-01-05T00:00:00Z") + week * 7 * 86400000;
        const weekStart = new Date(start).toISOString().slice(0, 10);
        const entries = Array.from({ length: count }, (_, index) =>
          entry(
            index + 1,
            new Date(start + Math.floor(index / 3) * 86400000).toISOString().slice(0, 10),
            ["breakfast", "lunch", "dinner"][index % 3],
          ),
        );
        assert.equal(
          decode(MealProposalContent, { weekStart, familiarOnly: false, entries }).entries.length,
          count,
        );
        const receipt = {
          ...owner,
          approvedRevision: "9007199254740993",
          revision: "9007199254740994",
          weekStart,
          previousWeekRevision: String(baseline),
          weekRevision: String(baseline + BigInt(count)),
          entries: entries.map((e, i) => ({
            proposalEntryId: e.entryId,
            entryId: id(300 + i),
            date: e.date,
            slot: e.slot,
          })),
        };
        assert.deepEqual(decode(MealProposalApprovalReceipt, receipt), receipt);
        assert.throws(() =>
          decode(MealProposalApprovalReceipt, { ...receipt, weekRevision: String(baseline) }),
        );
        assert.throws(() =>
          decode(MealProposalApprovalReceipt, { ...receipt, revision: receipt.approvedRevision }),
        );
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});

test("slot change receipts retain the action and exact saved recipe selection", () => {
  const base = {
    ...owner,
    previousRevision: "9007199254740993",
    revision: "9007199254740994",
    entryId: id(1),
  };
  const replace = { ...base, action: "replace" };
  const choose = {
    ...base,
    action: "choose",
    definitionId: id(20),
    expectedLibraryRevision: "9007199254740993",
  };
  assert.deepEqual(decode(MealProposalChangeReceipt, replace), replace);
  assert.deepEqual(decode(MealProposalChangeReceipt, choose), choose);
  const alternate = {
    ...choose,
    definitionId: id(21),
    expectedLibraryRevision: "9007199254740994",
  };
  assert.notDeepEqual(
    decode(MealProposalChangeReceipt, choose),
    decode(MealProposalChangeReceipt, alternate),
  );
  const { definitionId: _id, ...missingDefinition } = choose;
  const { expectedLibraryRevision: _revision, ...missingLibrary } = choose;
  for (const invalid of [
    base,
    missingDefinition,
    missingLibrary,
    { ...choose, action: "replace" },
    { ...replace, action: "choose" },
    { ...choose, definitionId: "invalid" },
    { ...choose, expectedLibraryRevision: -1 },
    { ...choose, revision: base.previousRevision },
    { ...choose, revision: "9007199254740995" },
  ]) {
    assert.throws(() => decode(MealProposalChangeReceipt, invalid));
  }
});
