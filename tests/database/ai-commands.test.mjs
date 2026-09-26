import { aiCommandFiles } from "./ai-command-files.mjs";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of aiCommandFiles) db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  partner = id(2),
  outsider = id(3),
  home = id(10);
const as = (user, sql) => `set role authenticated; set request.jwt.claim.sub='${user}'; ${sql}`;
const json = (value) =>
  value === null ? "null" : `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
let sequence = 1000;
function start() {
  const conversation = id(sequence++),
    turn = id(sequence++);
  const message = { id: turn, role: "user", parts: [{ type: "text", text: "Add groceries" }] };
  const claim = JSON.parse(
    db.sql(
      as(
        actor,
        `select public.nest_begin_ai_turn('${home}','${conversation}','${turn}',0,${json(message)})`,
      ),
    ),
  );
  return { conversation, turn, claim };
}
const add = { name: "Fixture apple", quantity: null, unit: null, categoryId: null };
const command = (r, tool = "addGrocery", input = add, call = "call-1") =>
  `select public.nest_execute_ai_command('${home}','${r.conversation}','${r.turn}','${call}','${tool}',${json(input)})`;
const execute = (r, tool, input, call) =>
  JSON.parse(db.sql(as(actor, command(r, tool, input, call))));
const finishSql = (r, response = null, state = "interrupted") =>
  `select public.nest_finish_ai_turn('${home}','${r.conversation}','${r.turn}','${state}',${json(response)})`;
const finish = (r, response, state) => JSON.parse(db.sql(as(actor, finishSql(r, response, state))));
const history = (r) =>
  JSON.parse(
    db.sql(`select transcript from public.nest_ai_conversations where id='${r.conversation}'`),
  );

test("grocery mutation and exact command replay share one immutable journal result", () => {
  const r = start(),
    first = execute(r),
    second = execute(r);
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.equal(
    db.sql(`select count(*) from public.grocery_items where id='${first.value.target}'`),
    "1",
  );
  assert.equal(
    db.sql(
      `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
    ),
    "1",
  );
  assert.throws(() => execute(r, "addGrocery", { ...add, name: "Changed" }), /AI command changed/);
  finish(r);
  assert.deepEqual(
    execute(r),
    first,
    "terminal replay reads the original receipt without another write",
  );
  assert.throws(() => execute(r, "addGrocery", add, "new-call"), /no longer active/);
});

test("concurrent duplicate tool calls create exactly one grocery", async () => {
  const r = start();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => db.concurrent(as(actor, command(r)))),
  );
  const values = results.map((result) => JSON.parse(result.stdout));
  for (const value of values) assert.deepEqual(value, values[0]);
  assert.equal(
    db.sql(
      `select count(*) from public.nest_grocery_edit_receipts where operation_id='${values[0].value.operation}'`,
    ),
    "1",
  );
});

test("command execution and journal reads reject partner, outsider, anonymous and direct helper access", () => {
  const r = start();
  execute(r);
  for (const user of [partner, outsider]) {
    assert.throws(() => db.sql(as(user, command(r))), /Not authorized/);
    assert.equal(
      db.sql(
        as(
          user,
          `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
        ),
      ),
      "0",
    );
  }
  assert.throws(() => db.sql(`set role anon; ${command(r)}`), /permission denied/);
  assert.throws(
    () =>
      db.sql(
        as(
          actor,
          `select private.nest_dispatch_ai_command('${home}','${id(400)}','addGrocery',${json(add)})`,
        ),
      ),
    /permission denied/,
  );
  assert.throws(
    () => db.sql(as(actor, `delete from public.nest_ai_commands`)),
    /permission denied/,
  );
});

test("deadline expiry blocks new commands but preserves committed receipt replay", () => {
  const r = start(),
    result = execute(r);
  db.sql(
    `update public.nest_ai_turns set deadline_at=now()-interval '1 second' where conversation_id='${r.conversation}'`,
  );
  assert.throws(() => execute(r, "addGrocery", add, "late"), /no longer active/);
  assert.deepEqual(execute(r), result);
});

test("malformed payloads, extra identities and non-finite command vocabulary fail before effects", () => {
  const r = start();
  for (const input of [
    { ...add, operationId: id(90) },
    { ...add, name: {} },
    { ...add, name: null },
    { name: "Missing fields" },
  ])
    assert.throws(() => execute(r, "addGrocery", input), /Invalid/);
  assert.throws(() => execute(r, "transferMoney", {}), /Invalid/);
  assert.throws(
    () => execute(r, "checkGrocery", { itemId: id(100), expectedVersion: 1, checked: true }),
    /Invalid/,
  );
  assert.equal(
    db.sql(
      `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
    ),
    "0",
  );
});

test("grocery edit, check and removal reuse shared command versions and failed conflicts are terminal", () => {
  const r = start(),
    added = execute(r);
  const itemId = added.value.target;
  const edited = execute(
    r,
    "editGrocery",
    { ...add, name: "Pear", itemId, expectedVersion: "1" },
    "edit",
  );
  assert.equal(edited.value.version, "2");
  const staleEdit = { ...add, itemId, expectedVersion: "1", name: "Stale pear" };
  assert.deepEqual(execute(r, "editGrocery", staleEdit, "stale-edit"), {
    ok: false,
    code: "conflict",
  });
  const stale = { itemId, expectedVersion: "1", checked: true };
  assert.deepEqual(execute(r, "checkGrocery", stale, "stale"), { ok: false, code: "conflict" });
  const checked = execute(r, "checkGrocery", { ...stale, expectedVersion: "2" }, "check");
  assert.equal(checked.value.version, "3");
  assert.deepEqual(execute(r, "editGrocery", staleEdit, "stale-edit"), {
    ok: false,
    code: "conflict",
  });
  assert.equal(
    db.sql(`select count(*) from public.nest_ai_commands where tool_call_id='stale-edit'`),
    "1",
  );
  assert.deepEqual(execute(r, "checkGrocery", stale, "stale"), { ok: false, code: "conflict" });
  const removed = execute(r, "removeGrocery", { itemId, expectedVersion: "3" }, "remove");
  assert.equal(removed.value.removed, true);
});

test("chore completion uses the existing authorized receipt and cannot cross the bound household", () => {
  const r = start(),
    input = { occurrenceId: id(100), expectedDueDate: "2026-09-19", completedOn: "2026-09-19" };
  const result = execute(r, "completeChore", input);
  assert.equal(result.ok, true);
  assert.equal(result.value.outcome, "completed");
  assert.deepEqual(execute(r, "completeChore", input), result);
  assert.equal(
    db.sql(`select count(*) from private.fixture_closure_calls where occurrence_id='${id(100)}'`),
    "1",
  );
  assert.deepEqual(execute(r, "completeChore", { ...input, occurrenceId: id(200) }, "other"), {
    ok: false,
    code: "forbidden",
  });
});

test("recovery reconstructs committed tool facts when the streamed assistant response was lost", () => {
  const r = start(),
    result = execute(r);
  finish(r);
  const messages = history(r),
    part = messages[1].parts[0];
  assert.equal(messages[1].id, r.claim.assistantId);
  assert.equal(part.type, "tool-addGrocery");
  assert.equal(part.state, "output-available");
  assert.deepEqual(part.input, add);
  assert.deepEqual(part.output, result);
  assert.deepEqual(finish(r), finish(r), "recovery replay is immutable");
});

test("saved SDK write claims cannot replace journal results or fabricate another mutation", () => {
  const r = start(),
    result = execute(r);
  const response = {
    id: r.claim.assistantId,
    role: "assistant",
    parts: [
      { type: "text", text: "Completed" },
      {
        type: "tool-addGrocery",
        toolCallId: "call-1",
        state: "output-available",
        input: add,
        output: { ok: true, value: "forged" },
      },
      {
        type: "tool-removeGrocery",
        toolCallId: "fake",
        state: "output-available",
        input: {},
        output: { ok: true },
      },
    ],
  };
  finish(r, response, "completed");
  const parts = history(r)[1].parts;
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[1].output, result);
  assert.deepEqual(finish(r, response, "completed").state, "completed");
});

test("a journal failure rolls back the household mutation and its native receipt", () => {
  const r = start();
  db.sql(`create function private.fixture_reject_journal() returns trigger language plpgsql as $$
    begin raise exception 'Fixture journal failure'; end; $$;
    revoke all on function private.fixture_reject_journal() from public,anon,authenticated;
    create trigger fixture_reject_journal before insert on public.nest_ai_commands for each row execute function private.fixture_reject_journal();`);
  const before = db.sql("select count(*) from public.grocery_items");
  const receipts = db.sql("select count(*) from public.nest_grocery_edit_receipts");
  try {
    assert.throws(() => execute(r), /Fixture journal failure/);
    assert.equal(db.sql("select count(*) from public.grocery_items"), before);
    assert.equal(db.sql("select count(*) from public.nest_grocery_edit_receipts"), receipts);
  } finally {
    db.sql(
      "drop trigger fixture_reject_journal on public.nest_ai_commands; drop function private.fixture_reject_journal();",
    );
  }
  assert.equal(execute(r).ok, true);
});

test("turn recovery waits for an in-flight command transaction and includes its committed fact", async () => {
  const r = start();
  const executing = db.concurrent(
    as(
      actor,
      `set application_name='nest-journal-inflight'; begin; ${command(r)}; select pg_sleep(0.3); commit;`,
    ),
  );
  let sleeping = false;
  for (let n = 0; n < 30; n++) {
    sleeping =
      db.sql(
        "select count(*) from pg_stat_activity where application_name='nest-journal-inflight' and wait_event='PgSleep'",
      ) === "1";
    if (sleeping) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(sleeping, true, "the command is uncommitted while holding its conversation lock");
  const recovering = db.concurrent(as(actor, finishSql(r)));
  const [result] = await Promise.all([executing, recovering]);
  const receipt = JSON.parse(result.stdout.trim());
  assert.deepEqual(history(r)[1].parts[0].output, receipt);
  assert.throws(() => execute(r, "addGrocery", add, "after-recovery"), /no longer active/);
});

test("journal history is retained but becomes unreadable and unreplayable after membership revocation", (t) => {
  const r = start();
  execute(r);
  db.sql(
    `delete from public.household_members where household_id='${home}' and user_id='${actor}'`,
  );
  t.after(() => db.sql(`insert into public.household_members values('${home}','${actor}')`));
  assert.equal(
    db.sql(
      as(
        actor,
        `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
      ),
    ),
    "0",
  );
  assert.throws(() => execute(r), /Not authorized/);
  assert.equal(
    db.sql(
      `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
    ),
    "1",
  );
});

test("even a member of two households cannot route a chore into a different bound household", (t) => {
  db.sql(`insert into public.household_members values('${id(20)}','${actor}')`);
  t.after(() =>
    db.sql(
      `delete from public.household_members where household_id='${id(20)}' and user_id='${actor}'`,
    ),
  );
  const r = start();
  const result = execute(r, "completeChore", {
    occurrenceId: id(200),
    expectedDueDate: "2026-09-19",
    completedOn: "2026-09-19",
  });
  assert.deepEqual(result, { ok: false, code: "forbidden" });
  assert.equal(
    db.sql(`select status from public.routine_occurrences where id='${id(200)}'`),
    "open",
  );
});

test("turn command cap rejects further effects but keeps exact replay and recovery", () => {
  const r = start();
  const first = execute(r, "addGrocery", add, "bounded-0");
  for (let n = 1; n < 32; n++) execute(r, "addGrocery", add, `bounded-${n}`);
  const before = db.sql("select count(*) from public.grocery_items");
  assert.throws(() => execute(r, "addGrocery", add, "overflow"), /command limit/);
  assert.equal(db.sql("select count(*) from public.grocery_items"), before);
  assert.deepEqual(execute(r, "addGrocery", add, "bounded-0"), first);
  finish(r);
  assert.equal(history(r)[1].parts.length, 32);
});

test("journal byte overflow rolls back an otherwise valid household command", () => {
  const r = start();
  execute(r);
  db.sql(
    `update public.nest_ai_commands set result=jsonb_build_object('fixture',repeat('x',131000)) where conversation_id='${r.conversation}'`,
  );
  const before = db.sql("select count(*) from public.grocery_items");
  const receipts = db.sql("select count(*) from public.nest_grocery_edit_receipts");
  assert.throws(() => execute(r, "addGrocery", add, "overflow"), /journal full/);
  assert.equal(db.sql("select count(*) from public.grocery_items"), before);
  assert.equal(db.sql("select count(*) from public.nest_grocery_edit_receipts"), receipts);
});

test("new turns reserve transcript space while accepted claims remain recoverable", () => {
  for (const transcript of [
    "(select jsonb_agg(jsonb_build_object('id',n,'role','assistant','parts','[]'::jsonb)) from generate_series(1,999) n)",
    "jsonb_build_array(jsonb_build_object('id','large','role','assistant','parts',jsonb_build_array(jsonb_build_object('type','text','text',repeat('x',1835008)))))",
  ]) {
    const r = start();
    finish(r);
    db.sql(
      `update public.nest_ai_conversations set transcript=${transcript} where id='${r.conversation}'`,
    );
    const turn = id(sequence++);
    const message = { id: turn, role: "user", parts: [{ type: "text", text: "Hello" }] };
    assert.throws(
      () =>
        db.sql(
          as(
            actor,
            `select public.nest_begin_ai_turn('${home}','${r.conversation}','${turn}',2,${json(message)})`,
          ),
        ),
      /capacity reached/,
    );
    assert.equal(
      db.sql(`select count(*) from public.nest_ai_turns where conversation_id='${r.conversation}'`),
      "1",
    );
  }
  const r = start();
  finish(r);
  db.sql(
    `update public.nest_ai_conversations set transcript=(select jsonb_agg(jsonb_build_object('id',n,'role','assistant','parts','[]'::jsonb)) from generate_series(1,998) n) where id='${r.conversation}'`,
  );
  r.turn = id(sequence++);
  const message = { id: r.turn, role: "user", parts: [{ type: "text", text: "Hello" }] };
  const claimSql = `select public.nest_begin_ai_turn('${home}','${r.conversation}','${r.turn}',2,${json(message)})`;
  db.sql(as(actor, claimSql));
  assert.equal(JSON.parse(db.sql(as(actor, claimSql))).claimed, false);
  execute(r);
  finish(r);
  assert.equal(history(r).length, 1000);
  assert.deepEqual(finish(r), finish(r));
});
