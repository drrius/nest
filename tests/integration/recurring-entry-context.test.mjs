import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { recurringEntryContext } from "../../apps/mobile/src/money/recurring-entry-context.ts";
import {
  initialRecurringDraft,
  editRecurringDraft,
} from "../../apps/mobile/src/money/recurring-draft.ts";
import { prepareRecurringConfirmation } from "../../apps/mobile/src/money/recurring-confirmation.ts";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect");
test("native entry context and previews save prospective exact configurations through the actual API", async (t) => {
  const f = await recurringApiFixture(t),
    local = await sqlite(t),
    account = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(account, id(900)));
  const client = moneyClient(
    f.url,
    account,
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const owner = { store: local.store, session },
    target = { ruleId: id(800), editing: false };
  const initial = await run(recurringEntryContext(owner, client, target));
  assert.equal(initial.context.current, null);
  assert.equal(
    initial.context.today,
    f.db.sql("select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')"),
  );
  const draft = {
    ...initialRecurringDraft(id(1), initial.context.today),
    description: "Shared subscription",
    mode: "fixed",
    amount: "12.01",
  };
  const first = prepareRecurringConfirmation(draft, initial.context, initial.context, id(801));
  assert.equal(first.ok, true);
  const saved = await run(client.saveRecurring(first.command));
  const editing = await run(recurringEntryContext(owner, client, { ...target, editing: true }));
  assert.equal(editing.context.current.revision, saved.revision);
  const update = prepareRecurringConfirmation(
    { ...editRecurringDraft(editing.context), amount: "14.01", split: "equal" },
    editing.context,
    editing.context,
    id(802),
  );
  assert.equal(update.ok, true);
  const updated = await run(client.saveRecurring(update.command));
  const fresh = await run(recurringEntryContext(owner, client, { ...target, editing: true }));
  assert.equal(fresh.context.current.revision, updated.revision);
  assert.equal(
    prepareRecurringConfirmation(draft, fresh.context, editing.context, id(803)).ok,
    false,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "2");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  await run(local.store.activate(account, id(901)));
  await assert.rejects(run(recurringEntryContext(owner, client, target)));
});
