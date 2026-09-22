import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, run } from "./legacy-adoption-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const headers = (f) => ({
  authorization: `Bearer ${f.bearer}`,
  "x-nest-household": id(10),
  "content-type": "application/json",
});
test("lost adoption reply recovers the original mandate and exact retained review without duplication", async (t) => {
  const f = await fixture(t);
  const lost = async (input, init) => {
    const response = await fetch(input, init);
    if (String(input).includes("/legacy-adoption/save"))
      throw new TypeError("lost committed response");
    return response;
  };
  await assert.rejects(
    run(f.native.saveLegacyAdoption(f.command).pipe(Effect.provideService(Fetch.Fetch, lost))),
  );
  const result = await run(f.native.recoverLegacyAdoption(f.command));
  assert.equal(result.status, "recorded");
  assert.deepEqual(result.receipt.reviewed, f.context);
  assert.deepEqual(result.receipt.input, f.command.input);
  assert.deepEqual(await run(f.native.saveLegacyAdoption(f.command)), result.receipt);
  assert.deepEqual(await run(f.native.cancelLegacyAdoption(f.command)), result);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("cancelled or stale adoption fails without a mandate and forged recovery cannot replace reviewed terms", async (t) => {
  const f = await fixture(t);
  assert.equal((await run(f.native.cancelLegacyAdoption(f.command))).status, "cancelled");
  await assert.rejects(run(f.native.saveLegacyAdoption(f.command)));
  f.db.sql("update public.recurring_expense_rules set description='Changed'");
  await assert.rejects(run(f.native.saveLegacyAdoption({ ...f.command, operationId: id(851) })));
  const fresh = await run(f.native.legacyAdoptionContext(id(800)));
  const command = {
    operationId: id(852),
    input: { ...f.command.input, reviewToken: fresh.reviewToken },
  };
  await run(f.native.saveLegacyAdoption(command));
  const recovery = await run(f.native.recoverLegacyAdoption(command));
  for (const forged of [
    { ...recovery, actorId: id(2) },
    {
      ...recovery,
      receipt: {
        ...recovery.receipt,
        input: {
          ...command.input,
          configuration: { ...command.input.configuration, note: "Substitution" },
        },
      },
    },
  ]) {
    const injected = async () =>
      new Response(JSON.stringify(forged), { headers: { "content-type": "application/json" } });
    await assert.rejects(
      run(
        f.native.recoverLegacyAdoption(command).pipe(Effect.provideService(Fetch.Fetch, injected)),
      ),
    );
  }
});
test("finite adoption endpoints enforce household, query and explicit approval requirements", async (t) => {
  const f = await fixture(t),
    outsider = f.client(f.url, 3, f.otherBearer);
  await assert.rejects(run(outsider.saveLegacyAdoption(f.command)));
  await assert.rejects(run(outsider.recoverLegacyAdoption(f.command)));
  for (const suffix of [
    `receipt?operationId=${id(850)}&operationId=${id(850)}`,
    `receipt?operationId=${id(850)}&extra=1`,
  ]) {
    assert.equal(
      (
        await fetch(`${f.url}/v1/money/recurring/legacy-adoption/${suffix}`, {
          headers: headers(f),
        })
      ).status,
      400,
    );
  }
  const endpoint = `${f.url}/v1/money/recurring/legacy-adoption/execute`;
  assert.equal(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: headers(f),
        body: JSON.stringify(f.command),
      })
    ).status,
    400,
  );
  const approvalId = approve(f);
  const approvedCommand = { ...f.command, approvalId };
  const receipt = await run(f.native.executeLegacyAdoption(approvedCommand));
  assert.equal(receipt.approvalId, approvalId);
  for (const forged of [
    { ...receipt, approvalId: id(999) },
    { ...receipt, operationId: id(999) },
    { ...receipt, actorId: id(2) },
    { ...receipt, householdId: id(20) },
    {
      ...receipt,
      input: {
        ...receipt.input,
        configuration: { ...receipt.input.configuration, note: "Substituted approved terms" },
      },
    },
  ]) {
    const injected = async () =>
      new Response(JSON.stringify(forged), { headers: { "content-type": "application/json" } });
    await assert.rejects(
      run(
        f.native
          .executeLegacyAdoption(approvedCommand)
          .pipe(Effect.provideService(Fetch.Fetch, injected)),
      ),
    );
  }
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "1");
  await assert.rejects(run(f.native.recoverLegacyAdoption(f.command)));
});
function approve(f) {
  const claims = JSON.stringify({ sub: id(1), role: "authenticated" }),
    input = JSON.stringify(f.command.input).replaceAll("'", "''");
  const auth = `set role authenticated; set request.jwt.claims='${claims}';`;
  const approval = f.db.sql(
    `${auth} select public.nest_propose_action('${id(10)}','${id(850)}','recurring.adopt-legacy',1,'${input}'::jsonb)`,
  );
  f.db.sql(
    `${auth} select public.nest_decide_action('${approval}','${id(850)}','recurring.adopt-legacy',1,'${input}'::jsonb,true)`,
  );
  return approval;
}
