import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarTools } from "../../apps/api/src/calendar/tools.ts";
import { calendarChoreFixture as setup } from "./calendar-chore-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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
