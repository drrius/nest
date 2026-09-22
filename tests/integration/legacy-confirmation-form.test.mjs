import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect } from "./legacy-confirmation-native-fixture.mjs";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import {
  initialLegacyConfirmation,
  prepareLegacyConfirmation,
  legacyConfirmationGuard,
} from "../../apps/mobile/src/money/legacy-confirmation-draft.ts";
import {
  legacyConfirmationContext,
  legacyConfirmationPreviewCurrent,
} from "../../apps/mobile/src/money/legacy-confirmation-context.ts";
async function options(f) {
  const client = moneyClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  return {
    members: (await run(client.balance())).members,
    categories: await run(client.categories(null)),
  };
}
test("retained missing or unsupported values require explicit complete terms; original data and maximum centimes survive native preparation", async (t) => {
  const f = await fixture(t),
    choices = await options(f);
  f.db.sql("update public.expense_drafts set occurred_on='infinity'");
  const context = { review: await run(f.native.legacyDraftContext(id(900))), options: choices };
  const initial = initialLegacyConfirmation(context);
  assert.equal(initial.amount, "");
  assert.equal(initial.payerId, "");
  assert.equal(initial.split, "exact");
  assert.equal(initial.firstExact, "");
  assert.equal(initial.secondExact, "");
  assert.equal(initial.date, "");
  const prepare = (draft) => prepareLegacyConfirmation(draft, context, context, id(700));
  assert.match(prepare(initial).message, /date is unsupported/);
  let draft = { ...initial, date: "2026-09-22" };
  assert.match(prepare(draft).message, /payer/);
  draft = { ...draft, payerId: id(1) };
  assert.match(prepare(draft).message, /CHF amount/);
  draft = { ...draft, amount: "90071992547409.91" };
  assert.match(prepare(draft).message, /exact shares/);
  draft = {
    ...draft,
    firstExact: "90071992547409.90",
    secondExact: "0.01",
    note: "Explicit review",
  };
  const parsed = prepare(draft);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.input.expense.amountCentimes, "9007199254740991");
  const save = await f.mount();
  await save.save(parsed.command);
  assert.equal(save.getSnapshot().result.status, "recorded");
  const receipt = save.getSnapshot().result.receipt;
  assert.equal(receipt.reviewed.draft.occurredOn.kind, "unsupported");
  assert.equal(receipt.reviewed.draft.amountCentimes, null);
  assert.equal(receipt.input.expense.note, "Explicit review");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
});
test("reviewed source and member order bind the form; reload, edited fields, offline and background invalidate captured confirmation", async (t) => {
  const f = await fixture(t),
    save = await f.mount(),
    value = await options(f);
  const read = new RecurringReadRuntime(
    recurringReadOperations({ store: f.local.store, session: f.session }, f.client),
    { kind: "legacy-review", draftId: id(900) },
  );
  t.after(() => read.dispose());
  await read.setOnline(true);
  await read.setActive(true);
  const current = () =>
    legacyConfirmationContext(read.getSnapshot(), save.getSnapshot(), {
      value,
      fresh: true,
      verify: false,
    });
  const context = current(),
    draft = {
      ...initialLegacyConfirmation(context),
      amount: "1.01",
      payerId: id(1),
      split: "equal",
    };
  const parsed = prepareLegacyConfirmation(draft, context, context, id(700));
  assert.equal(parsed.ok, true);
  const expected = { context, serialized: JSON.stringify(draft) };
  const valid = (input = draft) =>
    legacyConfirmationPreviewCurrent(expected, {
      context: current(),
      input,
      read: read.getSnapshot(),
      save: save.getSnapshot(),
    });
  assert.equal(valid(), true);
  assert.equal(valid({ ...draft, note: "Changed" }), false);
  const changedMembers = {
    ...context,
    options: { ...value, members: [...value.members].reverse() },
  };
  assert.equal(prepareLegacyConfirmation(draft, changedMembers, context, id(700)).ok, false);
  const guard = legacyConfirmationGuard(),
    preview = guard.prepare(parsed.command);
  const stop = read.subscribe(guard.invalidate);
  t.after(stop);
  await read.refresh();
  assert.equal(valid(), false);
  assert.equal(preview.consume(), false);
  const once = guard.prepare(parsed.command);
  assert.equal(once.consume(), true);
  assert.equal(once.consume(), false);
  f.db.sql("update public.expense_drafts set description='Changed source'");
  await read.refresh();
  assert.equal(prepareLegacyConfirmation(draft, current(), context, id(700)).ok, false);
  await read.setActive(false);
  assert.equal(current(), null);
  await read.setActive(true);
  await save.setOnline(false);
  assert.equal(current(), null);
  await save.save(parsed.command);
  assert.equal(f.sends(), 0);
});
