import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { recurringStateApprovalOperations } from "../../apps/mobile/src/money/recurring-state-approval-operations.ts";
import { RecurringStateApprovalRuntime } from "../../apps/mobile/src/money/recurring-state-approval-runtime.ts";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
async function setup(t, action) {
  const f = await recurringApiFixture(t, [
    "supabase/migrations/20260921210444_native_recurring_state_command.sql",
    "supabase/migrations/20260921213056_native_recurring_state_approval.sql",
  ]);
  const local = await sqlite(t),
    account = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(account, id(900)));
  const saved = await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
  const rule = { ...f.rule, expectedRevision: saved.revision };
  const change = {
    ruleId: rule.ruleId,
    expectedRevision: saved.revision,
    expectedStatus: "active",
    action,
  };
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: id(700),
    p_command: `recurring.${action}`,
    p_version: 1,
    p_payload: change,
  });
  const raw = moneyClient(
    f.url,
    account,
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const client = Object.fromEntries(
    [
      "recurringStateApproval",
      "recurringRules",
      "recurringRule",
      "balance",
      "decideRecurringState",
    ].map((name) => [
      name,
      (...args) => raw[name](...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    ]),
  );
  return { f, local, session, rule, approvalId, client };
}
for (const action of ["pause", "cancel"]) {
  test(`staged recurring ${action} retires only after authoritative supersession recovery`, async (t) => {
    const { f, local, session, rule, approvalId, client } = await setup(t, action);
    const operations = recurringStateApprovalOperations({ store: local.store, session }, client);
    let sends = 0,
      reads = 0,
      failRead = false;
    const wrapped = {
      ...operations,
      stage: (attempt, current) =>
        operations.stage(attempt, current).pipe(
          Effect.tap(() =>
            Effect.promise(() =>
              run(
                f.client(f.url, 2, f.partnerBearer).saveRecurring({
                  operationId: id(701),
                  rule: { ...rule, configuration: { ...rule.configuration, note: "Partner edit" } },
                }),
              ),
            ),
          ),
        ),
      decide: (input) => {
        sends++;
        return operations.decide(input);
      },
      read: (target) => {
        reads++;
        return failRead && reads === 2
          ? Effect.fail(new Error("Authoritative reread unavailable"))
          : operations.read(target);
      },
    };
    const runtime = new RecurringStateApprovalRuntime(wrapped, approvalId);
    await runtime.setOnline(true);
    await runtime.setActive(true);
    await runtime.decide(runtime.getSnapshot().approval, true);
    assert.equal(sends, 1);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal((await run(client.recurringStateApproval(approvalId))).status, "pending");
    reads = 0;
    failRead = true;
    await runtime.refresh();
    assert.equal(reads, 2);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(
      (await run(local.store.readRecurringStateApproval(session, approvalId))).approved,
      true,
    );
    runtime.dispose();
    const reopened = local.reopen();
    const recovered = new RecurringStateApprovalRuntime(
      recurringStateApprovalOperations({ store: reopened.store, session }, client),
      approvalId,
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(recovered.getSnapshot().approval.status, "pending");
    assert.match(recovered.getSnapshot().notice, /rule changed/);
    assert.equal(await run(reopened.store.readRecurringStateApproval(session, approvalId)), null);
    await recovered.decide(recovered.getSnapshot().approval, true);
    assert.equal((await run(client.recurringStateApproval(approvalId))).status, "pending");
    await recovered.decide(recovered.getSnapshot().approval, false);
    assert.equal(recovered.getSnapshot().approval.status, "denied");
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "2");
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    recovered.dispose();
  });
}
