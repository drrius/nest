import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, run } from "../../packages/protocol-fixtures/tests/offline-fixture.mjs";
import { calendarClient } from "../../packages/protocol-fixtures/src/calendar/client.ts";
import { calendarChoreOperations } from "../../packages/protocol-fixtures/src/calendar/chore-operations.ts";
import { CalendarChoreRuntime } from "../../packages/protocol-fixtures/src/calendar/chore-runtime.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { calendarChoreFixture as setup } from "./calendar-chore-fixture.mjs";
const require = createRequire(
  new URL("../../packages/protocol-fixtures/package.json", import.meta.url),
);
const Effect = await import(require.resolve("effect/Effect"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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
