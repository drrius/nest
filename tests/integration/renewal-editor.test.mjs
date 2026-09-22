import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect } from "./renewal-native-fixture.mjs";
import { recurringClient } from "../../apps/mobile/src/money/recurring-client.ts";
import { routineClient } from "../../apps/mobile/src/routines/client.ts";
import { renewalEditorContext } from "../../apps/mobile/src/renewals/editor-context.ts";
import { renewalDraft, parseRenewalDraft } from "../../apps/mobile/src/renewals/form.ts";
import { renewalConfirmation } from "../../apps/mobile/src/renewals/confirmation.ts";
function clients(f) {
  const account = { actor: id(1), household: id(10) };
  const credentials = Effect.succeed({ user: { id: id(1) }, access_token: f.bearer });
  return {
    renewals: f.native,
    money: recurringClient(f.url, account, credentials),
    routines: routineClient(f.url, account, credentials),
  };
}
test("renewal editor loads real choices, confirms a save and removes only the loaded revision", async (t) => {
  const f = await fixture(t),
    api = clients(f),
    account = { store: f.local.store, session: f.session };
  const context = await run(renewalEditorContext(account, api, { renewalId: null, after: null }));
  assert.equal(context.members.length, 2);
  assert.ok(context.rules.rules.length > 0);
  const draft = {
    ...renewalDraft(null, context.rules.today),
    title: "Internet",
    responsibleId: id(2),
    recurringRuleId: context.rules.rules[0].ruleId,
  };
  const runtime = await f.mount();
  const dialog = renewalConfirmation(
    {
      operationId: id(940),
      renewalId: id(941),
      expectedRevision: null,
      fields: parseRenewalDraft(draft),
    },
    () => true,
    runtime.save,
  );
  assert.equal(await dialog.confirm(), true);
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  const loaded = await run(
    renewalEditorContext(account, api, {
      renewalId: id(941),
      after: context.rules.rules[0].ruleId,
    }),
  );
  assert.equal(loaded.linked.rule.ruleId, draft.recurringRuleId);
  assert.equal(loaded.renewal.fields.title, draft.title);
  runtime.acknowledge();
  await runtime.save({
    operationId: id(942),
    renewalId: id(941),
    expectedRevision: loaded.renewal.revision,
  });
  assert.equal(runtime.getSnapshot().result.receipt.action, "removed");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("renewal editor context refuses stale leases and removal refuses a changed revision", async (t) => {
  const f = await fixture(t),
    api = clients(f),
    account = { store: f.local.store, session: f.session };
  const original = await run(f.native.save(f.command));
  await run(
    f.native.save({
      ...f.command,
      operationId: id(945),
      expectedRevision: original.renewal.revision,
      fields: { ...f.command.fields, title: "Changed" },
    }),
  );
  await assert.rejects(
    run(
      f.native.remove({
        operationId: id(946),
        renewalId: f.command.renewalId,
        expectedRevision: original.renewal.revision,
      }),
    ),
  );
  await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  await assert.rejects(
    run(renewalEditorContext(account, api, { renewalId: f.command.renewalId, after: null })),
  );
});
