import assert from "node:assert/strict";
import { test } from "node:test";
import { mealWeek, adjacentMealWeek } from "../../../packages/domain/src/meal-week.ts";
import { fixture, account, lease, run } from "./offline-fixture.mjs";
const snapshot = (weekStart = "2026-09-21", revision = "0") => ({
  version: 1,
  householdId: account.household,
  weekStart,
  revision,
  entries: [],
});

test("meal weeks survive restart and older replies cannot replace a newer exact bigint revision", async (t) => {
  const f = await fixture(t);
  const latest = snapshot(undefined, "9007199254740993");
  await run(f.store.saveMealWeek(f.session, latest));
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readMealWeek(f.session, latest.weekStart)), latest);
  assert.deepEqual(
    await run(reopened.store.saveMealWeek(f.session, snapshot(undefined, "9007199254740992"))),
    latest,
  );
  assert.deepEqual(await run(reopened.store.readMealWeek(f.session, latest.weekStart)), latest);
});

test("cache retains eight most recently saved weeks without touching another account", async (t) => {
  const f = await fixture(t);
  const other = { ...account, actor: "10000000-0000-4000-8000-000000000002" };
  const foreign = await run(f.store.activate(other, lease));
  await run(f.store.saveMealWeek(foreign, snapshot()));
  const own = await run(f.store.activate(account, "30000000-0000-4000-8000-000000000002"));
  assert.equal(await run(f.store.readMealWeek(own, "2026-09-21")), null);
  let week = mealWeek("2026-09-21")[0];
  for (let index = 0; index < 10; index++) {
    await run(f.store.saveMealWeek(own, snapshot(week)));
    week = adjacentMealWeek(week, 1)[0];
  }
  assert.equal(
    f.connection
      .prepare("select count(*) n from offline_meal_weeks where actor=?")
      .get(account.actor).n,
    8,
  );
  assert.equal(await run(f.store.readMealWeek(own, "2026-09-21")), null);
  assert.deepEqual(await run(f.store.readMealWeek(own, "2026-11-23")), snapshot("2026-11-23"));
  await assert.rejects(run(f.store.saveMealWeek(foreign, snapshot())), {
    reason: "session_changed",
  });
  const selected = await run(f.store.activate(other, lease));
  assert.deepEqual(await run(f.store.readMealWeek(selected, "2026-09-21")), snapshot());
});

test("malformed or misbound snapshots cannot become a saved empty week", async (t) => {
  const f = await fixture(t);
  for (const value of [
    { ...snapshot(), householdId: "20000000-0000-4000-8000-000000000002" },
    { ...snapshot(), weekStart: "2026-09-22" },
    { ...snapshot(), entries: [{}] },
  ]) {
    await assert.rejects(run(f.store.saveMealWeek(f.session, value)), { reason: "invalid_input" });
  }
  await run(f.store.saveMealWeek(f.session, snapshot()));
  f.connection
    .prepare("update offline_meal_weeks set data=?")
    .run(JSON.stringify(snapshot("2026-09-28")));
  await assert.rejects(run(f.store.readMealWeek(f.session, "2026-09-21")), {
    reason: "invalid_input",
  });
  f.connection.prepare("update offline_meal_weeks set data='{' ").run();
  await assert.rejects(run(f.store.readMealWeek(f.session, "2026-09-21")), { reason: "storage" });
  await run(f.store.saveMealWeek(f.session, snapshot(undefined, "1")));
  assert.deepEqual(
    await run(f.store.readMealWeek(f.session, "2026-09-21")),
    snapshot(undefined, "1"),
  );
});

test("failed cache retention rolls back the entire replacement", async (t) => {
  const f = await fixture(t);
  let week = "2026-09-21";
  for (let index = 0; index < 8; index++) {
    await run(f.store.saveMealWeek(f.session, snapshot(week)));
    week = adjacentMealWeek(week, 1)[0];
  }
  f.connection.exec(
    "create trigger fail_meal_cleanup before delete on offline_meal_weeks begin select raise(abort,'fixture failure'); end",
  );
  await assert.rejects(run(f.store.saveMealWeek(f.session, snapshot(week))), { reason: "storage" });
  assert.equal(await run(f.store.readMealWeek(f.session, week)), null);
  assert.deepEqual(await run(f.store.readMealWeek(f.session, "2026-09-21")), snapshot());
});
