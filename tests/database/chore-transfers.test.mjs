import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { choreTransferFiles } from "./chore-transfer-files.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of choreTransferFiles) db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
let sequence = 1000;
const nextId = () => id(sequence++);
function create(options = {}) {
  const definition = {
    title: "Transfer this turn",
    schedule: { kind: "daily" },
    assignment: { policy: "assigned", memberId: id(1) },
    ...options,
  };
  const routine = JSON.parse(
    db.sql(as(`select public.nest_create_routine('${id(10)}','${nextId()}',${json(definition)})`)),
  );
  const current = JSON.parse(
    db.sql(
      `select row_to_json(o) from public.routine_occurrences o where routine_id='${routine.routineId}' and role='current'`,
    ),
  );
  return { routine, current };
}
const sql = (operation, action, input) =>
  `select public.nest_chore_transfer('${id(10)}','${operation}','${action}',${json(input)})`;
const execute = (action, input, actor = id(1), operation = nextId()) =>
  JSON.parse(db.sql(as(sql(operation, action, input), actor)));
const requestInput = (current) => ({
  occurrenceId: current.id,
  expectedDueDate: current.due_date,
  recipientId: id(2),
});
const request = (current) => execute("request", requestInput(current));
const list = (actor = id(1)) =>
  JSON.parse(db.sql(as(`select public.nest_list_chore_transfers('${id(10)}')`, actor)));
const occurrence = (target) =>
  JSON.parse(
    db.sql(`select row_to_json(o) from public.routine_occurrences o where id='${target}'`),
  );
const respond = (request, action = "accept", actor = id(2), operation = nextId()) =>
  execute(action, { requestId: request.requestId }, actor, operation);

test("a request never transfers responsibility; only its recipient can accept and exact receipts replay", () => {
  const { current } = create(),
    operation = nextId(),
    input = requestInput(current);
  const pending = execute("request", input, id(1), operation);
  assert.equal(occurrence(current.id).nest_accepted_assignee_id, null);
  assert.equal(pending.state, "pending");
  assert.deepEqual(list(), list(id(2)));
  assert.ok(list().some((row) => row.requestId === pending.requestId));
  assert.throws(() => respond(pending, "accept", id(1)), /Only the recipient/);
  const accepted = respond(pending);
  assert.equal(accepted.state, "accepted");
  assert.equal(occurrence(current.id).nest_accepted_assignee_id, id(2));
  assert.equal(occurrence(current.id).planned_assignee_id, id(1));
  assert.ok(!list().some((row) => row.requestId === pending.requestId));
  assert.deepEqual(execute("request", input, id(1), operation), pending);
  assert.deepEqual(respond(pending, "accept", id(2), accepted.operationId), accepted);
  assert.throws(
    () => respond(pending, "decline", id(2), accepted.operationId),
    /operation changed/,
  );
});
test("shared chores and someone else's turn cannot be handed over without that responsible member", () => {
  const shared = create({ assignment: { policy: "shared" } });
  assert.throws(() => request(shared.current), /responsible member/);
  const { current } = create();
  assert.throws(
    () => execute("request", { ...requestInput(current), recipientId: id(1) }, id(2)),
    /responsible member/,
  );
  assert.throws(
    () => execute("request", { ...requestInput(current), recipientId: id(1) }),
    /responsible member/,
  );
  assert.throws(
    () => execute("request", { ...requestInput(current), recipientId: id(3) }),
    /Recipient unavailable/,
  );
});
test("duplicate pending requests converge, decline preserves ownership, and accept/decline races have one winner", async () => {
  const { current } = create(),
    input = requestInput(current);
  const requests = await Promise.all(
    Array.from({ length: 3 }, () => db.concurrent(as(sql(nextId(), "request", input)))),
  );
  const receipts = requests.map((result) => JSON.parse(result.stdout));
  assert.equal(new Set(receipts.map((result) => result.requestId)).size, 1);
  const pending = receipts[0];
  assert.equal(respond(pending, "decline").state, "declined");
  assert.equal(occurrence(current.id).nest_accepted_assignee_id, null);
  const fresh = request(current);
  assert.notEqual(fresh.requestId, pending.requestId);
  const actions = ["accept", "decline"];
  const raced = await Promise.allSettled(
    actions.map((action) =>
      db.concurrent(as(sql(nextId(), action, { requestId: fresh.requestId }), id(2))),
    ),
  );
  assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
  const winner = actions[raced.findIndex((result) => result.status === "fulfilled")];
  assert.equal(
    occurrence(current.id).nest_accepted_assignee_id,
    winner === "accept" ? id(2) : null,
  );
});
test("membership removal and rejoin cannot revive pending handover consent", () => {
  const { current } = create(),
    pending = request(current);
  const before = db.sql(
    `select to_jsonb(m) from public.household_members m where user_id='${id(2)}'`,
  );
  const baseline = JSON.parse(before);
  db.sql(`update public.routine_occurrences set nest_accepted_assignee_id=null where nest_accepted_assignee_id='${id(2)}';
    delete from public.household_members where user_id='${id(2)}'`);
  assert.ok(!list().some((row) => row.requestId === pending.requestId));
  db.sql(
    `insert into public.household_members select * from jsonb_populate_record(null::public.household_members,${json(baseline)})`,
  );
  assert.ok(!list().some((row) => row.requestId === pending.requestId));
  assert.throws(() => respond(pending), /Transfer changed/);
  assert.equal(
    db.sql(`select state from public.nest_chore_transfers where id='${pending.requestId}'`),
    "superseded",
  );
  assert.equal(occurrence(current.id).nest_accepted_assignee_id, null);
  assert.equal(respond(request(current)).state, "accepted");
});
test("accepted turns leave daily and after-completion alternating successors unchanged", () => {
  for (const schedule of [
    { kind: "daily" },
    { kind: "after_completion", every: 3, unit: "days" },
  ]) {
    const { routine, current } = create({
      schedule,
      assignment: { policy: "alternating", anchorMemberId: id(1) },
    });
    respond(request(current));
    db.sql(
      as(
        `select public.nest_complete_chore('${current.id}','${nextId()}','${current.due_date}',(now() at time zone 'Europe/Zurich')::date)`,
        id(2),
      ),
    );
    const successors = JSON.parse(
      db.sql(`select jsonb_agg(jsonb_build_object('role',role,'planned',planned_assignee_id,'accepted',nest_accepted_assignee_id) order by due_date)
      from public.routine_occurrences where routine_id='${routine.routineId}' and status='open'`),
    );
    assert.deepEqual(successors, [
      { role: "current", planned: id(2), accepted: null },
      { role: "preview", planned: id(1), accepted: null },
    ]);
    assert.equal(
      db.sql(
        `select completed_by_member_id::text from public.routine_completions where occurrence_id='${current.id}'`,
      ),
      id(2),
    );
  }
});
test("date/assignment ABA changes invalidate pending consent, while accepted responsibility survives a reschedule", () => {
  const { current } = create(),
    pending = request(current);
  db.sql(
    as(`select public.nest_change_chore('${id(10)}','${nextId()}','${current.id}','${current.due_date}','reschedule','${current.due_date}'::date+1);
    select public.nest_change_chore('${id(10)}','${nextId()}','${current.id}','${current.due_date}'::date+1,'reschedule','${current.due_date}')`),
  );
  assert.ok(!list().some((row) => row.requestId === pending.requestId));
  assert.throws(() => respond(pending), /Transfer changed/);
  const fresh = request(current);
  assert.equal(
    db.sql(`select state from public.nest_chore_transfers where id='${pending.requestId}'`),
    "superseded",
  );
  respond(fresh);
  db.sql(
    as(
      `select public.nest_change_chore('${id(10)}','${nextId()}','${current.id}','${current.due_date}','reschedule','${current.due_date}'::date+1)`,
    ),
  );
  assert.equal(occurrence(current.id).nest_accepted_assignee_id, id(2));
  db.sql(`update public.routine_occurrences set planned_assignee_id='${id(2)}' where id='${current.id}';
    update public.routine_occurrences set planned_assignee_id='${id(1)}' where id='${current.id}'`);
  assert.equal(occurrence(current.id).nest_accepted_assignee_id, null);
  const next = occurrence(current.id),
    newer = request(next);
  db.sql(`update public.routine_occurrences set planned_assignee_id='${id(2)}' where id='${current.id}';
    update public.routine_occurrences set planned_assignee_id='${id(1)}' where id='${current.id}'`);
  assert.throws(() => respond(newer), /Transfer changed/);
});
test("rebuild, completion, archive and pause make old requests inapplicable without authorizing substitution", () => {
  for (const change of ["rebuild", "complete", "archive", "pause"]) {
    const { routine, current } = create(),
      pending = request(current);
    if (change === "rebuild")
      db.sql(
        as(`select public.nest_edit_routine('${id(10)}','${nextId()}','${routine.routineId}','${routine.version}',
      '{"schedule":{"kind":"weekly","weekday":3}}')`),
      );
    else if (change === "complete")
      db.sql(
        as(
          `select public.nest_complete_chore('${current.id}','${nextId()}','${current.due_date}',(now() at time zone 'Europe/Zurich')::date)`,
        ),
      );
    else
      db.sql(
        as(
          `select public.nest_set_routine_state('${id(10)}','${nextId()}','${routine.routineId}','${routine.version}','${change}')`,
        ),
      );
    assert.ok(!list().some((row) => row.requestId === pending.requestId));
    assert.throws(() => respond(pending), /changed/);
    assert.deepEqual(
      execute("request", requestInput(current), id(1), pending.operationId),
      pending,
    );
  }
});
test("tenant RLS, internal helper permissions, direct assignment denial and revoked replay preserve consent", () => {
  const { current } = create(),
    pending = request(current);
  assert.throws(
    () => db.sql(as(sql(nextId(), "accept", { requestId: pending.requestId }), id(3))),
    /Not authorized/,
  );
  assert.equal(db.sql(as("select count(*) from public.nest_chore_transfers", id(3))), "0");
  assert.equal(
    db.sql(
      as(
        `select count(*) from public.nest_chore_transfer_receipts where operation_id='${pending.operationId}'`,
        id(2),
      ),
    ),
    "0",
  );
  assert.throws(
    () => db.sql(`set role anon; select public.nest_list_chore_transfers('${id(10)}')`),
    /permission denied/,
  );
  for (const statement of [
    `update public.routine_occurrences set nest_accepted_assignee_id='${id(2)}' where id='${current.id}'`,
    `update public.nest_chore_transfers set state='accepted',resolved_at=now() where id='${pending.requestId}'`,
    `select private.nest_respond_chore_transfer('${id(10)}','${pending.requestId}','accept')`,
  ])
    assert.throws(() => db.sql(as(statement)), /permission denied/);
  const accepted = respond(pending);
  assert.throws(
    () =>
      db.sql(`begin; delete from public.activity_events; delete from public.routine_completions;
    update public.routine_occurrences set nest_accepted_assignee_id=null,planned_assignee_id=null;
    delete from public.household_members where user_id='${id(2)}';
    ${as(sql(accepted.operationId, "accept", { requestId: pending.requestId }), id(2))}; commit`),
    /Not authorized/,
  );
});
test("receipt failure atomically rolls back request and acceptance including the assignment revision", () => {
  const { current } = create();
  const tables = ["routine_occurrences", "nest_chore_transfers", "nest_chore_transfer_receipts"];
  const snapshot = () =>
    tables.map((table) =>
      db.sql(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t`,
      ),
    );
  const fail = () =>
    db.sql(`create function private.fixture_transfer_fail() returns trigger language plpgsql as $$ begin raise exception 'fixture transfer failure'; end $$;
    create trigger fixture_transfer_fail before insert on public.nest_chore_transfer_receipts for each row execute function private.fixture_transfer_fail()`);
  const clear = () =>
    db.sql(
      "drop trigger fixture_transfer_fail on public.nest_chore_transfer_receipts; drop function private.fixture_transfer_fail()",
    );
  let before = snapshot();
  fail();
  try {
    assert.throws(() => request(current), /fixture transfer failure/);
    assert.deepEqual(snapshot(), before);
  } finally {
    clear();
  }
  const pending = request(current);
  before = snapshot();
  fail();
  try {
    assert.throws(() => respond(pending), /fixture transfer failure/);
    assert.deepEqual(snapshot(), before);
  } finally {
    clear();
  }
  assert.equal(respond(pending).state, "accepted");
});
test("strict command validation rejects hidden identity, unsupported actions and malformed dates/UUIDs", () => {
  const { current } = create(),
    input = requestInput(current);
  for (const patch of [
    { actorId: id(2) },
    { operationId: nextId() },
    { expectedDueDate: null },
    { expectedDueDate: "2026-02-30" },
    { expectedDueDate: "0000-01-01" },
    { expectedDueDate: "2026-09-20\n" },
    { recipientId: id(2) + "\n" },
    { occurrenceId: "bad" },
  ])
    assert.throws(() => execute("request", { ...input, ...patch }), /Invalid/);
  for (const action of ["delete", "cancel", "accept\n"])
    assert.throws(() => execute(action, { requestId: nextId() }), /Invalid/);
});

test("acceptance races with completion, reschedule and definition rebuild without altering successors", async () => {
  for (const change of ["complete", "reschedule", "rebuild"]) {
    for (let iteration = 0; iteration < 4; iteration++) {
      const { routine, current } = create(),
        pending = request(current);
      const commands = {
        complete: `select public.nest_complete_chore('${current.id}','${nextId()}','${current.due_date}',(now() at time zone 'Europe/Zurich')::date)`,
        reschedule: `select public.nest_change_chore('${id(10)}','${nextId()}','${current.id}','${current.due_date}','reschedule','${current.due_date}'::date+1)`,
        rebuild: `select public.nest_edit_routine('${id(10)}','${nextId()}','${routine.routineId}','${routine.version}','{"schedule":{"kind":"weekly","weekday":3}}')`,
      };
      const outcomes = await Promise.allSettled([
        db.concurrent(as(sql(nextId(), "accept", { requestId: pending.requestId }), id(2))),
        db.concurrent(as(commands[change])),
      ]);
      assert.ok(outcomes.some((result) => result.status === "fulfilled"));
      for (const result of outcomes)
        if (result.status === "rejected") assert.match(String(result.reason), /changed|conflict/);
      const accepted = outcomes[0].status === "fulfilled";
      assert.equal(
        db.sql(`select state from public.nest_chore_transfers where id='${pending.requestId}'`),
        accepted ? "accepted" : "pending",
      );
      assert.equal(
        db.sql(
          `select count(*) from public.routine_occurrences where routine_id='${routine.routineId}' and id<>'${current.id}' and nest_accepted_assignee_id is not null`,
        ),
        "0",
      );
      const target = db.sql(
        `select coalesce(nest_accepted_assignee_id::text,'none') from public.routine_occurrences where id='${current.id}'`,
      );
      if (target) assert.equal(target, accepted ? id(2) : "none");
      assert.equal(
        db.sql(
          `select count(*) from public.routine_occurrences where routine_id='${routine.routineId}' and role='current'`,
        ),
        "1",
      );
    }
  }
});
