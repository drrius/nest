import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { recurringApprovalOperations } from "../../apps/mobile/src/money/recurring-approval-operations.ts";
import { recurringApprovalOwner } from "../../apps/mobile/src/money/recurring-approval-owner.ts";
import {
  recurringApprovalActions,
  recurringApprovalText,
} from "../../apps/mobile/src/money/recurring-approval-display.ts";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
test("native approval owner reviews real category, invalidates on archive and allows explicit denial", async (t) => {
  const f = await recurringApiFixture(t, [
    "supabase/migrations/20260921201455_native_recurring_approval.sql",
    "supabase/migrations/20260921123952_native_expense_category_read.sql",
  ]);
  f.db.sql(
    `insert into public.expense_categories(id,household_id,name,sort_order) values('${id(500)}','${id(10)}','Household',0)`,
  );
  const local = await sqlite(t),
    account = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(account, id(900)));
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: id(700),
    p_command: "recurring.create",
    p_version: 1,
    p_payload: {
      ...f.rule,
      configuration: { ...f.rule.configuration, categoryId: id(500), note: "Annual service" },
    },
  });
  const raw = moneyClient(
    f.url,
    account,
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const client = Object.fromEntries(
    [
      "recurringApproval",
      "recurringRules",
      "recurringRule",
      "balance",
      "category",
      "decideRecurring",
    ].map((name) => [
      name,
      (...args) => raw[name](...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    ]),
  );
  const owner = recurringApprovalOwner(
    recurringApprovalOperations({ store: local.store, session }, client),
    approvalId,
  );
  assert.equal(owner.getSnapshot(), null);
  const stop = owner.subscribe(() => {}),
    runtime = owner.getSnapshot();
  await runtime.setOnline(true);
  await runtime.setActive(true);
  const first = runtime.getSnapshot();
  assert.equal(first.context.category.name, "Household");
  assert.equal(recurringApprovalActions(first, Date.now()).confirm, true);
  assert.match(recurringApprovalText(first.approval, first.context, id(1)), /Category: Household/);
  assert.match(recurringApprovalText(first.approval, first.context, id(1)), /Annual service/);
  f.db.sql(`update public.expense_categories set archived_at=now() where id='${id(500)}'`);
  await runtime.refresh();
  const changed = runtime.getSnapshot();
  assert.equal(changed.context.category.archived, true);
  assert.equal(recurringApprovalActions(changed, Date.now()).confirm, false);
  assert.equal(recurringApprovalActions(changed, Date.now()).deny, true);
  await runtime.decide(first.approval, true);
  await runtime.decide(changed.approval, true);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "0");
  await runtime.decide(changed.approval, false);
  assert.equal(runtime.getSnapshot().approval.status, "denied");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  stop();
  assert.equal(owner.getSnapshot(), null);
  assert.equal(runtime.getSnapshot().approval, null);
});
