import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { createRequire } from "node:module";
import { fixture, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { calendarClient } from "../../apps/mobile/src/calendar/client.ts";
import { calendarChoreOperations } from "../../apps/mobile/src/calendar/chore-operations.ts";
import { CalendarChoreRuntime } from "../../apps/mobile/src/calendar/chore-runtime.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { calendarTools } from "../../apps/api/src/calendar/tools.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { choreTransferFiles } from "../database/chore-transfer-files.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
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

test("native chore layer reads the real API, changes date and hides revoked access", async (t) => {
  const { f, config, rows } = await setup(t);
  const local = await fixture(t);
  const session = await run(local.store.activate({ actor: id(2), household: id(10) }, id(800)));
  const server = nodeServer(createHandler(config));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const proxy = await lostResponseProxy(
    t,
    `http://127.0.0.1:${server.address().port}/`,
    `/v1/calendar/chores?date=${rows[0].due_date}`,
  );
  const client = calendarClient(
    proxy.url,
    session,
    Effect.succeed({ user: { id: session.actor }, access_token: f.partnerBearer }),
  );
  const runtime = new CalendarChoreRuntime(
    calendarChoreOperations({ store: local.store, session }, client),
    rows[0].due_date,
  );
  t.after(() => runtime.dispose());
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().rows, null);
  await runtime.setEnabled(true);
  assert.equal(proxy.dropped(), 1);
  assert.equal(runtime.getSnapshot().rows, null);
  assert.equal(runtime.getSnapshot().access, true);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().rows[0].role, "current");
  await runtime.changeDate(rows[1].due_date);
  assert.equal(runtime.getSnapshot().rows[0].role, "preview");
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().access, false);
  assert.equal(runtime.getSnapshot().rows, null);
});
