import test from "node:test";
import assert from "node:assert/strict";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { fixture, id, run, Effect } from "./legacy-adoption-native-fixture.mjs";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import {
  initialLegacyAdoption,
  prepareLegacyAdoption,
  legacyAdoptionGuard,
} from "../../apps/mobile/src/money/legacy-adoption-draft.ts";
import {
  adoptionFormContext,
  adoptionPreviewCurrent,
} from "../../apps/mobile/src/money/legacy-adoption-context.ts";
import { adoptionConfirmationText } from "../../apps/mobile/src/money/legacy-adoption-summary.ts";
async function choices(f) {
  const client = moneyClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const options = {
    members: (await run(client.balance())).members,
    categories: await run(client.categories(null)),
  };
  return { client, options };
}
test("native adoption defaults to variable, preserves missing splits, and computes the exact non-overlapping fixed mandate", async (t) => {
  const f = await fixture(t),
    { options } = await choices(f);
  f.db.sql("update public.expense_drafts set occurred_on='9998-12-31'");
  const context = {
    review: await run(f.native.legacyAdoptionContext(id(800))),
    today: f.command.input.configuration.startDate,
    options,
  };
  const initial = initialLegacyAdoption(context);
  assert.equal(initial.mode, "variable");
  assert.equal(initial.firstExact, "");
  assert.equal(initial.secondExact, "");
  const prepare = (value) => prepareLegacyAdoption(value, context, context, id(870));
  const variable = prepare(initial);
  assert.equal(variable.ok, true);
  assert.equal(variable.command.input.configuration.amountCentimes, null);
  assert.equal(prepare({ ...initial, mode: "fixed" }).ok, false);
  const fixed = {
    ...initial,
    mode: "fixed",
    amount: "90071992547409.91",
    firstExact: "90071992547409.90",
    secondExact: "0.01",
  };
  const parsed = prepare(fixed);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.input.configuration.amountCentimes, "9007199254740991");
  assert.ok(parsed.command.input.firstDueOn > context.review.coveredThrough);
  const preview = adoptionConfirmationText(parsed.command, id(1), context.review.coveredThrough);
  assert.ok(preview.includes(parsed.command.input.firstDueOn));
  assert.ok(preview.includes(context.review.coveredThrough));
  const save = await f.mount();
  await save.save(parsed.command);
  assert.equal(save.getSnapshot().result.status, "recorded");
  assert.deepEqual(save.getSnapshot().result.receipt.input, parsed.command.input);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select occurred_on from public.expense_drafts"), "9998-12-31");
});
test("source, member order, fields and lifecycle changes invalidate native adoption review", async (t) => {
  const f = await fixture(t),
    { client, options } = await choices(f),
    save = await f.mount();
  const read = new RecurringReadRuntime(
    recurringReadOperations({ store: f.local.store, session: f.session }, client),
    { kind: "legacy-adoption", ruleId: id(800) },
  );
  t.after(() => read.dispose());
  await read.setOnline(true);
  await read.setActive(true);
  const current = () =>
    adoptionFormContext(read.getSnapshot(), save.getSnapshot(), {
      value: options,
      fresh: true,
      verify: false,
    });
  const context = current(),
    draft = initialLegacyAdoption(context);
  const parsed = prepareLegacyAdoption(draft, context, context, id(870));
  assert.equal(parsed.ok, true);
  const expected = { context, serialized: JSON.stringify(draft) };
  const valid = (input = draft) =>
    adoptionPreviewCurrent(expected, {
      context: current(),
      input,
      read: read.getSnapshot(),
      save: save.getSnapshot(),
    });
  assert.equal(valid(), true);
  assert.equal(valid({ ...draft, mode: "fixed" }), false);
  assert.equal(
    prepareLegacyAdoption(
      draft,
      { ...context, options: { ...options, members: [...options.members].reverse() } },
      context,
      id(870),
    ).ok,
    false,
  );
  const guard = legacyAdoptionGuard(),
    captured = guard.prepare(parsed.command);
  assert.equal(captured.consume(), true);
  assert.equal(captured.consume(), false);
  const invalidated = guard.prepare(parsed.command);
  guard.invalidate();
  assert.equal(invalidated.consume(), false);
  await read.refresh();
  assert.equal(valid(), false);
  await save.setOnline(false);
  assert.equal(current(), null);
  await save.setOnline(true);
  await read.setActive(false);
  assert.equal(current(), null);
  await read.setActive(true);
  f.db.sql("update public.recurring_expense_rules set description='Changed source'");
  await read.refresh();
  assert.equal(prepareLegacyAdoption(draft, current(), context, id(870)).ok, false);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
});
