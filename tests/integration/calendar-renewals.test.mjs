import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect } from "./renewal-fixture.mjs";
import { calendarClient } from "../../apps/mobile/src/calendar/client.ts";
import { renewalReadTools } from "../../apps/api/src/renewals/tools.ts";
test("native calendar renewal query uses real authorization, exact dates and SDK read tool", async (t) => {
  const f = await fixture(t, ["supabase/migrations/20260923012644_native_calendar_renewals.sql"]);
  await run(f.native.save(f.command));
  const client = calendarClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const query = { date: "2028-02-29", after: null };
  const page = await run(client.renewals(query));
  assert.equal(page.renewals[0].renewalId, id(900));
  assert.equal((await run(client.renewals({ ...query, date: "2028-02-28" }))).renewals.length, 0);
  const tools = renewalReadTools(
    new Request("http://localhost", { headers: { authorization: `Bearer ${f.bearer}` } }),
    { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" },
  );
  const ai = await tools.readRenewalsOnDate.execute(query, {
    toolCallId: "calendar-renewals",
    messages: [],
  });
  assert.deepEqual(ai, { ok: true, value: page });
  const outsider = calendarClient(
    f.url,
    { actor: id(3), household: id(10) },
    Effect.succeed({ user: { id: id(3) }, access_token: f.otherBearer }),
  );
  await assert.rejects(run(outsider.renewals(query)));
  const response = await fetch(
    `${f.url}/v1/calendar/renewals?date=2028-02-29&householdId=${id(10)}`,
    {
      headers: { authorization: `Bearer ${f.bearer}` },
    },
  );
  assert.equal(response.status, 400);
});
