import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readCalendarChores, calendarChoreQuery } from "../../apps/api/src/calendar/chores.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "First" },
  token: "fixture",
};
const date = "2026-09-21";
const row = {
  id: id(100),
  household_id: id(10),
  routine_id: id(200),
  role: "current",
  due_date: date,
  planned_assignee_id: id(1),
  nest_accepted_assignee_id: id(2),
  routines: { title: "Kitchen", household_id: id(10) },
};
const response = (rows, range) => Response.json(rows, { headers: { "content-range": range } });
const run = (fetch, input = { date }) =>
  Effect.runPromise(
    readCalendarChores(config, caller, input).pipe(
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    ),
  );

test("calendar chores require complete date-bound tenant-safe unique records", async () => {
  for (const [rows, range] of [
    [[row], "0-0/2"],
    [[], "*/1"],
    [[row, row], "0-1/2"],
    ...[
      { household_id: id(20) },
      { routines: { title: "Foreign", household_id: id(20) } },
      { due_date: "2026-09-22" },
      { role: "historical" },
      { title: "unexpected" },
      { due_date: "infinity" },
    ].map((patch) => [[{ ...row, ...patch }], "0-0/1"]),
    [Array.from({ length: 201 }, (_, n) => ({ ...row, id: id(1000 + n) })), "0-200/201"],
  ])
    await assert.rejects(
      run(async () => response(rows, range)),
      { code: "unavailable" },
    );
  const result = await run(async (url) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("due_date"), `eq.${date}`);
    assert.equal(query.get("routines.household_id"), `eq.${id(10)}`);
    assert.equal(query.get("role"), "in.(current,preview)");
    return response([row], "0-0/1");
  });
  assert.equal(result.chores[0].assigneeId, id(2));
  assert.equal(result.chores[0].role, "current");
  assert.deepEqual((await run(async () => response([], "*/0"))).chores, []);
});
test("calendar chore query rejects ambiguous dates and identity injection before IO", async () => {
  let calls = 0;
  for (const input of [
    {},
    { date: "2026-02-30" },
    { date, householdId: id(20) },
    { date: "0000-01-01" },
  ])
    await assert.rejects(
      run(async () => {
        calls++;
        return response([], "*/0");
      }, input),
      { code: "invalid_request" },
    );
  for (const query of ["", `date=${date}&date=${date}`, `date=${date}&actorId=${id(2)}`])
    await assert.rejects(
      Effect.runPromise(calendarChoreQuery(new Request(`http://localhost/?${query}`))),
      { code: "invalid_request" },
    );
  assert.equal(calls, 0);
});
