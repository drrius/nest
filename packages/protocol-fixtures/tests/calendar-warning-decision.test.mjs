import assert from "node:assert/strict";
import { test } from "node:test";
import { warningDecision } from "../src/calendar/warning-decision.ts";
import { calendarReadScope } from "../src/calendar/day-check-scope.ts";

test("native calendar warning waits for a choice and treats dismissal as cancellation", async () => {
  const controller = new AbortController();
  let decide,
    finished = false;
  const pending = warningDecision(controller.signal, (callback) => {
    decide = callback;
  });
  void pending.then(() => {
    finished = true;
  });
  await Promise.resolve();
  assert.equal(finished, false);
  decide(true);
  decide(false);
  assert.equal(await pending, true);
  assert.equal(await warningDecision(controller.signal, (choose) => choose(false)), false);
});

test("abandoned calendar warnings cannot save after navigation, scope loss or late acceptance", async () => {
  const controller = new AbortController();
  let decide;
  const pending = warningDecision(controller.signal, (callback) => {
    decide = callback;
  });
  controller.abort();
  decide(true);
  assert.equal(await pending, false);
  assert.equal(
    await warningDecision(controller.signal, () => assert.fail("shown after abort")),
    false,
  );
  assert.equal(
    await warningDecision(new AbortController().signal, () => {
      throw new Error("Native alert unavailable");
    }),
    false,
  );
});

test("calendar checks require a loaded ready selection bound to current consent", () => {
  const consent = { enabled: true, incarnation: "account-a", version: "1" };
  const selection = { status: "active", consent, calendarIds: ["local-only"] };
  const state = { loaded: true, stage: "ready", consent, selection };
  assert.equal(calendarReadScope(state), selection);
  assert.equal(calendarReadScope(undefined), null);
  for (const change of [
    { loaded: false },
    { stage: "verify" },
    { stage: "uncertain" },
    { stage: "reload" },
    { consent: null },
    { selection: null },
    { selection: { status: "pending" } },
    { consent: { ...consent, enabled: false } },
    { consent: { ...consent, version: "2" } },
    { consent: { ...consent, incarnation: "account-b" } },
  ])
    assert.equal(calendarReadScope({ ...state, ...change }), null);
});
