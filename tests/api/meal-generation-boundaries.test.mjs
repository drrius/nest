import assert from "node:assert/strict";
import { test } from "node:test";
import {
  input,
  model,
  run,
  id,
  recipe,
  response,
  MockLanguageModelV4,
  Effect,
} from "./meal-generation-fixture.mjs";
import { generateMealContent } from "../../apps/api/src/meal-planning/generate.ts";
import { prepareGeneration } from "../../apps/api/src/meal-planning/generation-input.ts";
import { householdDayWindow } from "../../packages/domain/src/calendar.ts";

test("busy projection uses exact Zurich days, explicit freshness and only sanitized intervals", () => {
  const value = input(),
    start = householdDayWindow("2030-01-07"),
    end = householdDayWindow("2030-01-13");
  const now = start.start + 3600000,
    tuesday = householdDayWindow("2030-01-08");
  const row = (actorId, intervals) => ({
    actorId,
    schemaVersion: 1,
    consent: "1",
    generation: "1",
    capturedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 900000).toISOString(),
    covered: { start: start.start, end: end.end },
    intervals,
  });
  value.busy.snapshots = [
    row(id(1), [{ start: tuesday.start + 3600000, end: tuesday.start + 7200000 }]),
    row(id(2), []),
  ];
  const prepared = prepareGeneration(value, now);
  assert.deepEqual(
    prepared.availability[0].members.map((member) => member.status),
    ["free", "free"],
  );
  assert.deepEqual(
    prepared.availability[1].members.map((member) => member.status),
    ["busy", "free"],
  );
  assert.ok(
    prepareGeneration(value, now + 900000).availability.every((day) =>
      day.members.every((member) => member.status === "unknown"),
    ),
  );
  value.busy.snapshots[0].covered.end = tuesday.start;
  value.busy.snapshots[0].intervals = [];
  assert.equal(prepareGeneration(value, now).availability[1].members[0].status, "unknown");
  const spring = householdDayWindow("2030-03-31"),
    autumn = householdDayWindow("2030-10-27");
  assert.equal(spring.end - spring.start, 23 * 3600000);
  assert.equal(autumn.end - autumn.start, 25 * 3600000);
});

test("generation captures all authorized inputs before asynchronous provider calls", async () => {
  const value = input();
  const f = model((output, n) => {
    if (n === 1) {
      value.library.recipes[0].ingredients[0].quantity = "999";
      value.context.members[1].profile.restrictions = [];
      value.context.requesterCalorieGoal = 1;
    }
    return output;
  });
  const content = await run(f, value);
  assert.deepEqual(content.entries[0].source.recipe, recipe);
  assert.deepEqual(f.calls[1].data.members[1].restrictions, ["Vegetarian"]);
});

test("SDK failures and truncated output are sanitized without automatic retries or an approval-shaped result", async () => {
  for (const truncated of [false, true]) {
    let calls = 0;
    const instance = new MockLanguageModelV4({
      doGenerate: async (options) => {
        calls++;
        if (!truncated) throw new Error("secret provider prompt and private preferences");
        return {
          ...response({
            meals: JSON.parse(options.prompt.at(-1).content[0].text).slots.map((slot) => ({
              ...slot,
              choice: { kind: "saved", definitionId: id(200) },
              estimatedCaloriesPerServing: 300,
            })),
          }),
          finishReason: { unified: "length", raw: undefined },
        };
      },
    });
    await assert.rejects(run({ instance }), (error) => {
      assert.equal(error.reason, "unavailable");
      assert.equal(JSON.stringify(error).includes("secret provider"), false);
      return true;
    });
    assert.equal(calls, 1);
  }
  const f = model();
  await assert.rejects(Effect.runPromise(generateMealContent(f.instance, input(), () => id(500))), {
    reason: "unavailable",
  });
});

test("oversized authorized context fails before a provider call and cancellation aborts the single active call", async () => {
  const value = input();
  value.library.recipes = Array.from({ length: 50 }, (_, n) => ({
    ...recipe,
    definitionId: id(200 + n),
    instructions: "x".repeat(4000),
  }));
  const oversized = model();
  await assert.rejects(run(oversized, value), { reason: "unavailable" });
  assert.equal(oversized.calls.length, 0);
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let calls = 0,
    aborted = false;
  const instance = new MockLanguageModelV4({
    doGenerate: (options) =>
      new Promise((_resolve, reject) => {
        calls++;
        started();
        options.abortSignal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      }),
  });
  const controller = new AbortController(),
    pending = run({ instance }, input(), { signal: controller.signal });
  const rejected = assert.rejects(pending);
  await ready;
  controller.abort();
  await rejected;
  assert.equal(calls, 1);
  assert.equal(aborted, true);
});
