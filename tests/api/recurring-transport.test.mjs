import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { recurringCommands } from "../../apps/api/src/money/recurring.ts";
import { recurringReads } from "../../apps/api/src/money/recurring-read.ts";
import { recurringClient } from "../../apps/mobile/src/money/recurring-client.ts";
import { id, input, receipt, row, list, detail } from "./recurring-transport-fixture.mjs";
import { canonicalRecurring } from "../../packages/contracts/src/recurring.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const config = { url: "https://fixture.supabase.co/", publishableKey: "sb_publishable_fixture" };
const caller = { member: { userId: id(1), householdId: id(10) }, token: "fixture" };
const commands = recurringCommands(config, caller),
  reads = recurringReads(config, caller);
const client = recurringClient(
  "https://api.example/",
  { actor: id(1), household: id(10) },
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
);
const run = (effect, response) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(response))),
  );
const command = { operationId: id(200), rule: input() };
test("native and API canonicalize UUIDs before dispatch without changing the caller's approved input", async () => {
  const upper = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  const rule = {
    ...input(),
    ruleId: upper,
    expectedRevision: upper,
    configuration: { ...input().configuration, categoryId: upper },
  };
  const normalized = canonicalRecurring(rule),
    expected = { ...receipt, rule: normalized };
  assert.equal(normalized.ruleId, upper.toLowerCase());
  assert.equal(normalized.expectedRevision, upper.toLowerCase());
  assert.equal(normalized.configuration.categoryId, upper.toLowerCase());
  for (const [effect, key] of [
    [commands.save({ ...command, rule }), "p_input"],
    [client.saveRecurring({ ...command, rule }), "rule"],
  ]) {
    const result = await Effect.runPromise(
      effect.pipe(
        Effect.provideService(Fetch.Fetch, async (url, init) => {
          const sent = await new Request(url, init).json();
          assert.deepEqual(sent[key], normalized);
          return Response.json(expected);
        }),
      ),
    );
    assert.deepEqual(result, expected);
  }
  assert.equal(rule.ruleId, upper);
  assert.equal(rule.configuration.categoryId, upper);
});
test("API and native recurring writes reject substituted actor, operation, approval and authorized payload", async () => {
  for (const effect of [() => commands.save(command), () => client.saveRecurring(command)]) {
    assert.deepEqual(await run(effect(), receipt), receipt);
    for (const patch of [
      { actorId: id(2) },
      { householdId: id(20) },
      { operationId: id(201) },
      { approvalId: id(400) },
      { rule: { ...input(), firstDueOn: "2026-11-30" } },
      { rule: { ...input(), configuration: { ...input().configuration, description: "Changed" } } },
    ])
      await assert.rejects(run(effect(), { ...receipt, ...patch }), { code: "unavailable" });
  }
  await assert.rejects(run(commands.save({ ...command, origin: "ui" }), receipt), {
    code: "invalid_request",
  });
  await assert.rejects(run(commands.execute(command), receipt), { code: "invalid_request" });
  await assert.rejects(run(client.saveRecurring({ ...command, approvalId: id(400) }), receipt), {
    code: "invalid",
  });
  assert.deepEqual(
    await run(commands.execute({ ...command, approvalId: id(400) }), {
      ...receipt,
      approvalId: id(400),
    }),
    { ...receipt, approvalId: id(400) },
  );
});
test("API and native snapshots reject foreign household, target/cursor substitutions and invalid pages", async () => {
  for (const effect of [() => reads.list({ after: null }), () => client.recurringRules()]) {
    assert.deepEqual(await run(effect(), list), list);
    for (const patch of [
      { householdId: id(20) },
      { after: id(99) },
      { next: id(100) },
      { rules: [row, row] },
      { rules: [{ ...row, authorizedAt: "invalid" }] },
    ])
      await assert.rejects(run(effect(), { ...list, ...patch }), { code: "unavailable" });
  }
  for (const effect of [
    () => reads.detail({ ruleId: id(100) }),
    () => client.recurringRule(id(100)),
  ]) {
    assert.deepEqual(await run(effect(), detail), detail);
    await assert.rejects(run(effect(), { ...detail, rule: { ...row, ruleId: id(101) } }), {
      code: "unavailable",
    });
  }
  await assert.rejects(run(reads.list({ after: null, owner: id(1) }), list), {
    code: "invalid_request",
  });
});
test("due-variable reads reject forged due state and cursor/household substitution at both boundaries", async () => {
  const dueRule = {
    ...row,
    nextDueOn: list.today,
    configuration: {
      ...row.configuration,
      mode: "variable",
      amountCentimes: null,
      allocations: null,
      startDate: list.today,
      schedule: { kind: "weekly", weekday: 1 },
    },
  };
  const page = { ...list, rules: [dueRule] };
  for (const effect of [
    () => reads.dueVariable({ after: null }),
    () => client.dueVariableRules(),
  ]) {
    assert.deepEqual(await run(effect(), page), page);
    for (const patch of [
      { householdId: id(99) },
      { after: id(99) },
      { next: dueRule.ruleId },
      { rules: [{ ...dueRule, status: "paused" }] },
      { rules: [{ ...dueRule, nextDueOn: "2026-09-22" }] },
      { rules: [{ ...dueRule, nextDueOn: null }] },
      { rules: [{ ...dueRule, coveredThrough: list.today }] },
      { rules: [{ ...dueRule, configuration: row.configuration }] },
    ])
      await assert.rejects(run(effect(), { ...page, ...patch }), { code: "unavailable" });
  }
});
