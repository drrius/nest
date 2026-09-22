import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run } from "./renewal-fixture.mjs";
import { renewalReminderReadTools } from "../../apps/api/src/renewal-reminders/tools.ts";
const invocation = { toolCallId: "renewal-read", messages: [] };
function tools(f, token = f.bearer) {
  return renewalReminderReadTools(
    new Request("http://localhost/", {
      headers: {
        authorization: `Bearer ${token}`,
        "x-nest-household": id(10),
      },
    }),
    { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" },
  );
}
test("real SDK reminder reads return current authorized records and no writes", async (t) => {
  const f = await fixture(t, [
    "supabase/migrations/20260922213246_native_renewal_reminder_storage.sql",
  ]);
  await run(f.native.save(f.command));
  const ai = tools(f);
  const detail = await ai.readRenewalReminder.execute(
    { renewalId: f.command.renewalId },
    invocation,
  );
  assert.equal(detail.ok, true);
  assert.equal(detail.value.reminder, null);
  const foreign = await tools(f, f.otherBearer).readRenewalReminder.execute(
    { renewalId: f.command.renewalId },
    invocation,
  );
  assert.equal(foreign.ok, false);
  const injected = await ai.readRenewalReminder.execute(
    { renewalId: f.command.renewalId, householdId: id(20) },
    invocation,
  );
  assert.equal(injected.ok, false);
  assert.equal(f.db.sql("select count(*) from private.nest_renewal_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
