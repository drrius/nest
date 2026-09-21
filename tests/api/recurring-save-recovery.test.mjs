import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { recurringSaveRecovery } from "../../apps/api/src/money/recurring-save-read.ts";
import { recurringRecoveryClient } from "../../apps/mobile/src/money/recurring-recovery-client.ts";
import { id, input, receipt } from "./recurring-transport-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const caller = { member: { userId: id(1), householdId: id(10) }, token: "fixture" };
const api = recurringSaveRecovery(
  { url: "https://fixture.supabase.co/", publishableKey: "sb_publishable_fixture" },
  caller,
);
const client = recurringRecoveryClient(
  "https://api.example/",
  { actor: id(1), household: id(10) },
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
);
const run = (effect, value) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value))),
  );
const result = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(200),
  status: "recorded",
  receipt,
};
test("API/native recovery reject contradictory receipts and uncertain cancellation responses", async () => {
  const command = { operationId: id(200), rule: input() };
  for (const effect of [
    () => api.read({ operationId: id(200) }),
    () => client.recoverRecurring(command),
  ]) {
    assert.deepEqual(await run(effect(), result), result);
    for (const patch of [
      { actorId: id(2) },
      { householdId: id(20) },
      { operationId: id(201) },
      { status: "cancelled" },
      { receipt: null },
      { receipt: { ...receipt, approvalId: id(300) } },
    ])
      await assert.rejects(run(effect(), { ...result, ...patch }), { code: "unavailable" });
  }
  const unresolved = { ...result, status: "unresolved", receipt: null };
  assert.deepEqual(await run(api.read({ operationId: id(200) }), unresolved), unresolved);
  await assert.rejects(run(api.cancel({ operationId: id(200) }), unresolved), {
    code: "unavailable",
  });
  await assert.rejects(run(client.cancelRecurringSave(command), unresolved), {
    code: "unavailable",
  });
  await assert.rejects(
    run(client.recoverRecurring(command), {
      ...result,
      receipt: { ...receipt, rule: { ...input(), firstDueOn: "2099-01-01" } },
    }),
    { code: "unavailable" },
  );
  await assert.rejects(run(api.cancel({ operationId: id(200), ruleId: id(100) }), result), {
    code: "invalid_request",
  });
});
