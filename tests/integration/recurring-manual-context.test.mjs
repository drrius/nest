import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fixture, id, run } from "./recurring-manual-approval-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
test("manual context is private and binds the exact approval, source and recurring rule", async (t) => {
  const { f, approvalId } = await fixture(t),
    client = f.client();
  const approval = await run(client.manualCycleApproval(approvalId));
  const context = await run(client.manualCycleContext(approval));
  assert.equal(context.linked, false);
  assert.equal(context.detail.event.eventId, f.command.input.sourceEventId);
  assert.equal(context.target.rule.ruleId, f.command.input.ruleId);
  await assert.rejects(run(f.client(f.url, 2, f.partnerBearer).manualCycleContext(approval)));
  await assert.rejects(run(f.client(f.url, 3, f.otherBearer).manualCycleContext(approval)));
  await assert.rejects(
    run(
      client.manualCycleContext({
        ...approval,
        input: { ...approval.input, sourceEventId: id(999) },
      }),
    ),
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(99) },
    { approvalId: id(98) },
    { detail: { ...context.detail, event: { ...context.detail.event, eventId: id(97) } } },
    { target: { ...context.target, rule: { ...context.target.rule, ruleId: id(96) } } },
  ]) {
    await assert.rejects(
      Effect.runPromise(
        client.manualCycleContext(approval).pipe(
          Effect.provideService(
            Fetch.Fetch,
            async () =>
              new Response(JSON.stringify({ ...context, ...patch }), {
                headers: { "content-type": "application/json" },
              }),
          ),
        ),
      ),
    );
  }
  const response = await fetch(
    `${f.url}/v1/money/recurring/manual/approval/context?approvalId=${approvalId}&extra=1`,
    { headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) } },
  );
  assert.equal(response.status, 400);
});
