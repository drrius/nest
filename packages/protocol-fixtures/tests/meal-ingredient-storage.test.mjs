import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, account, lease, run } from "./offline-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const weekStart = "2030-01-07";
const choices = [true, false].map((selected, n) => ({
  entryId: id(100),
  ingredientId: id(300 + n),
  quantity: n ? null : " ½ ",
  unit: n ? null : "cups",
  selected,
}));
const draft = { weekStart, weekRevision: "9007199254740993", choices };
const command = {
  operationId: id(800),
  weekStart,
  expectedRevision: draft.weekRevision,
  selected: choices
    .filter((row) => row.selected)
    .map(({ entryId, ingredientId, quantity, unit }) => ({
      entryId,
      ingredientId,
      quantity,
      unit,
    })),
};
const receipt = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  weekStart,
  weekRevision: draft.weekRevision,
  ingredients: command.selected.map(({ entryId, ingredientId }) => ({
    entryId,
    ingredientId,
    itemId: id(500),
    outcome: "added",
  })),
};
const save = (f, value = draft, sequence = null) =>
  run(f.store.saveIngredientDraft(f.session, { draft: value, expectedSequence: sequence }));
const stage = (f, value = command, expectedSequence = 1) =>
  run(f.store.stageIngredientAddition(f.session, { command: value, expectedSequence }));

test("ingredient selections and exact pending request survive SQLite restart without an offline queue entry", async (t) => {
  const f = await fixture(t);
  assert.equal(await run(f.store.readIngredientAttempt(f.session, weekStart)), null);
  await save(f);
  const staged = await stage(f);
  assert.equal(staged.sequence, 2);
  const reopened = f.reopen();
  const session = await run(reopened.store.activate(account, lease));
  assert.deepEqual(await run(reopened.store.readIngredientAttempt(session, weekStart)), staged);
  assert.equal(
    reopened.connection.prepare("select count(*) as n from offline_operations").get().n,
    0,
  );
  const done = await run(reopened.store.recordIngredientAddition(session, receipt));
  assert.equal(done.pending, null);
  assert.deepEqual(
    done.choices.map((row) => row.selected),
    [false, false],
  );
  assert.equal(done.choices[0].quantity, " ½ ");
});

test("stale review controllers cannot overwrite a saved exclusion or replace an uncertain operation", async (t) => {
  const f = await fixture(t);
  await save(f);
  const edited = await save(
    f,
    { ...draft, choices: choices.map((row) => ({ ...row, selected: false })) },
    1,
  );
  await assert.rejects(stage(f), (e) => e.reason === "operation_reused");
  await assert.rejects(stage(f, command, edited.sequence), (e) => e.reason === "invalid_input");
  await save(f, draft, edited.sequence);
  await stage(f, command, 3);
  await assert.rejects(save(f, draft, 4), (e) => e.reason === "pending_edit");
  await assert.rejects(
    stage(f, { ...command, operationId: id(801) }, 4),
    (e) => e.reason === "pending_edit",
  );
  await assert.rejects(
    run(f.store.clearIngredientAddition(f.session, { weekStart, operationId: id(801) })),
    (e) => e.reason === "operation_reused",
  );
  assert.deepEqual(
    (await run(f.store.readIngredientAttempt(f.session, weekStart))).pending,
    command,
  );
});

test("ingredient receipt failures and mismatches preserve the original pending request", async (t) => {
  const f = await fixture(t);
  await save(f);
  await stage(f);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(801) },
    { weekRevision: "1" },
    { ingredients: [{ ...receipt.ingredients[0], ingredientId: id(301) }] },
  ])
    await assert.rejects(
      run(f.store.recordIngredientAddition(f.session, { ...receipt, ...patch })),
      (e) => e.reason === "invalid_receipt",
    );
  f.connection.exec(
    "CREATE TRIGGER reject_ingredient_receipt BEFORE INSERT ON meal_ingredient_attempts BEGIN SELECT RAISE(FAIL,'disk full'); END",
  );
  await assert.rejects(
    run(f.store.recordIngredientAddition(f.session, receipt)),
    (e) => e.reason === "storage",
  );
  assert.deepEqual(
    (await run(f.store.readIngredientAttempt(f.session, weekStart))).pending,
    command,
  );
});

test("ingredient drafts are actor/household/lease scoped and conflict clearance retains reviewed choices", async (t) => {
  const f = await fixture(t);
  await save(f);
  await stage(f);
  const other = await run(f.store.activate({ ...account, actor: id(2) }, id(900)));
  assert.equal(await run(f.store.readIngredientAttempt(other, weekStart)), null);
  await assert.rejects(
    run(f.store.readIngredientAttempt(f.session, weekStart)),
    (e) => e.reason === "session_changed",
  );
  const current = await run(f.store.activate(account, id(901)));
  const cleared = await run(
    f.store.clearIngredientAddition(current, { weekStart, operationId: command.operationId }),
  );
  assert.equal(cleared.pending, null);
  assert.deepEqual(cleared.choices, choices);
  await assert.rejects(
    save(
      { ...f, session: current },
      { ...draft, choices: [...choices, choices[0]] },
      cleared.sequence,
    ),
  );
});
