import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { calendarTools } from "../../apps/api/src/calendar/tools.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { choreTransferFiles } from "../database/chore-transfer-files.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function setup(t) {
  const f = await postgrestFixture(t, [
    ...choreTransferFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" };
  const handler = createHandler(config);
  const request = (query, bearer = f.bearer) =>
    new Request(`http://localhost/v1/calendar/chores?${query}`, {
      headers: { authorization: `Bearer ${bearer}`, "x-nest-household": id(10) },
    });
  const read = (query, bearer) => handler(request(query, bearer));
  const definition = {
    title: "Kitchen",
    schedule: { kind: "daily" },
    assignment: { policy: "assigned", memberId: id(1) },
  };
  const created = JSON.parse(
    f.db.sql(
      `set role authenticated; set request.jwt.claims='{"sub":"${id(1)}"}'; select public.nest_create_routine('${id(10)}','${id(100)}','${JSON.stringify(definition)}'::jsonb)`,
    ),
  );
  const rows = JSON.parse(
    f.db.sql(
      `select json_agg(o order by role) from public.routine_occurrences o where routine_id='${created.routineId}'`,
    ),
  );
  return { f, config, request, read, created, rows };
}
test("calendar API and AI share real current/preview reads, hide inactive work and enforce membership", async (t) => {
  const { f, config, request, read, created, rows } = await setup(t);
  for (const row of rows) {
    const response = await read(`date=${row.due_date}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.deepEqual(body.chores, [
      {
        occurrenceId: row.id,
        routineId: created.routineId,
        role: row.role,
        title: "Kitchen",
        dueDate: row.due_date,
        assigneeId: id(1),
      },
    ]);
    assert.deepEqual(await (await read(`date=${row.due_date}`, f.partnerBearer)).json(), body);
    const tool = calendarTools(request(""), config).readCalendarChores;
    assert.deepEqual(
      await tool.execute({ date: row.due_date }, { toolCallId: "read", messages: [] }),
      { ok: true, value: body },
    );
  }
  const query = `date=${rows[0].due_date}`;
  assert.equal((await read(query, f.otherBearer)).status, 403);
  assert.equal((await read(`${query}&date=2026-01-01`)).status, 400);
  for (const column of ["paused_at", "archived_at"]) {
    f.db.sql(`update public.routines set ${column}=now() where id='${created.routineId}'`);
    assert.deepEqual((await (await read(query)).json()).chores, []);
    f.db.sql(`update public.routines set ${column}=null where id='${created.routineId}'`);
  }
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.equal((await read(query, f.partnerBearer)).status, 403);
  assert.deepEqual(
    await calendarTools(request("", f.partnerBearer), config).readCalendarChores.execute(
      { date: rows[0].due_date },
      { toolCallId: "revoked", messages: [] },
    ),
    { ok: false, code: "forbidden" },
  );
});
