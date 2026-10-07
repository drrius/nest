import { createServer, request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { fixture } from "./recurring-variable-fixture.mjs";

export async function variableCycleRaceFixture(t, first) {
  assert.ok(["save", "cancel"].includes(first));
  const f = await fixture(t);
  const table =
    first === "save" ? "nest_recurring_cycle_receipts" : "nest_recurring_cycle_save_cancellations";
  f.db
    .sql(`create function public.fixture_variable_race_gate() returns trigger language plpgsql as $$
    begin perform pg_advisory_xact_lock(90171); return new; end $$;
    create trigger fixture_variable_race_gate after insert on public.${table}
    for each row execute function public.fixture_variable_race_gate()`);
  const { server, releaseSave, requests } = await proxy(f.url, first);
  let released = false;
  const holder = f.db
    .concurrent(`set application_name='nest-variable-race-gate';
    set statement_timeout='10s'; begin; select pg_advisory_xact_lock(90171);
    select pg_sleep(8); commit`)
    .then(
      () => ({ unexpectedCompletion: true }),
      (error) => ({ error }),
    );
  const state = () => ({
    ...requests(),
    gateHeld:
      f.db.sql(
        "select count(*) from pg_stat_activity where application_name='nest-variable-race-gate' and wait_event='PgSleep'",
      ) === "1",
    saveBlocked:
      f.db.sql(
        "select count(*) from pg_stat_activity where wait_event='advisory' and query like '%nest_save_variable_cycle%'",
      ) === "1",
    cancelBlocked:
      f.db.sql(
        "select count(*) from pg_stat_activity where wait_event='advisory' and query like '%nest_cancel_recurring_cycle_save%'",
      ) === "1",
  });
  const release = async () => {
    assert.equal(released, false);
    assert.equal(state().gateHeld, true, "Actual holder must still own the gate");
    released = true;
    f.db.sql(
      "select pg_cancel_backend(pid) from pg_stat_activity where application_name='nest-variable-race-gate'",
    );
    const result = await holder;
    assert.match(String(result.error), /canceling statement due to user request/);
  };
  t.after(async () => {
    releaseSave();
    if (!released && state().gateHeld) await release();
    await holder;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const wait = async (key) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (state()[key]) return;
      await delay(10);
    }
    assert.fail(`Actual race barrier not reached: ${key}`);
  };
  await wait("gateHeld");
  return {
    ...f,
    raceURL: `http://127.0.0.1:${server.address().port}`,
    state,
    wait,
    release,
    releaseSave,
  };
}

async function proxy(upstream, first) {
  let releaseSave;
  const saveGate = new Promise((resolve) => {
    releaseSave = resolve;
  });
  let saves = 0,
    cancels = 0;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.url.endsWith("/save")) {
      saves++;
      if (first === "cancel") await saveGate;
    }
    if (request.url.endsWith("/cancel-save")) cancels++;
    const forwarded = httpRequest(
      new URL(request.url, upstream),
      {
        method: request.method,
        headers: request.headers,
      },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      },
    );
    forwarded.once("error", () => response.destroy());
    forwarded.end(Buffer.concat(chunks));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, releaseSave, requests: () => ({ saves, cancels }) };
}
