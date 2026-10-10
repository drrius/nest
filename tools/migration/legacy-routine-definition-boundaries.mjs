import assert from "node:assert/strict";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const routine = id(9836);
const payload = {
  title: "Legacy definition boundary",
  areaId: id(1200),
  assignmentPolicy: "shared",
  scheduleKind: "calendar",
  scheduleRule: { kind: "daily" },
};
const literal = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

function fixture() {
  return `insert into auth.users(id) values('${id(9831)}'),('${id(9832)}'),('${id(9833)}');
    insert into public.households(id,name) values('${id(9830)}','Foreign definition household');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9830)}','${id(9831)}','Foreign A'),('${id(9830)}','${id(9832)}','Foreign B');
    insert into public.areas(id,household_id,name,sort_order)
      values('${id(9834)}','${id(9830)}','Foreign area',0);
    insert into public.pets(id,household_id,name) values('${id(9835)}','${id(9830)}','Foreign pet');
    insert into public.routines(id,household_id,title,instructions,area_id,assignment_policy,schedule_kind,schedule_rule)
      values('${routine}','${id(10)}','Original definition','Original instructions','${id(1200)}',
        'shared','calendar','{"kind":"daily"}');
    insert into public.routine_occurrences(id,household_id,routine_id,due_date,original_due_date,status,role)
      values('${id(9837)}','${id(10)}','${routine}',private.household_today(),private.household_today(),'open','current'),
      ('${id(9838)}','${id(10)}','${routine}',private.household_today()+1,private.household_today()+1,'open','preview');`;
}

function create(name, patch = {}) {
  const next = { ...payload, ...patch };
  if (name === "create_routine_once")
    return `public.create_routine_once('${id(10)}','definition-create',${literal(next)})`;
  return `public.create_routine(p_household_id=>'${id(10)}',p_title=>'${next.title}',
    p_area_id=>'${next.areaId}',p_assignment_policy=>'${next.assignmentPolicy}',
    p_schedule_kind=>'${next.scheduleKind}',p_schedule_rule=>${literal(next.scheduleRule)},
    p_assigned_member_id=>${next.assignedMemberId ? `'${next.assignedMemberId}'` : "null"},
    p_rotation_anchor_member_id=>${next.rotationAnchorMemberId ? `'${next.rotationAnchorMemberId}'` : "null"},
    p_pet_id=>${next.petId ? `'${next.petId}'` : "null"})`;
}

function edit(patch, version = `(select updated_at from public.routines where id='${routine}')`) {
  return `public.edit_routine_definition('${routine}',${version},'definition-edit',${literal(patch)})`;
}

function run(db, actor, sql, { role = "authenticated", setup = "" } = {}) {
  return db.sql(`begin; ${fixture()} ${setup} set local role ${role};
    set local request.jwt.claim.sub='${actor === null ? "" : id(actor)}'; ${sql}; rollback;`);
}

function denied(db, cases, input) {
  assert.throws(() => run(db, input.actor, `select ${input.expression}`, input), input.expected);
  const { name, actor, reason, role = "authenticated" } = input;
  cases.push({ function: name, actor, role, reason, denied: true });
}

function retained(db) {
  return db.sql(`select jsonb_build_object(
    'routines',(select jsonb_agg(to_jsonb(r) order by id) from public.routines r),
    'occurrences',(select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o),
    'completions',(select jsonb_agg(to_jsonb(c) order by occurrence_id) from public.routine_completions c),
    'creationReceipts',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key)
      from private.routine_creation_receipts r),
    'editReceipts',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key)
      from private.routine_edit_receipts r),
    'clearIntents',(select jsonb_agg(to_jsonb(i) order by routine_id) from private.routine_edit_clear_intents i),
    'activity',(select jsonb_agg(to_jsonb(a) order by id) from public.activity_events a),
    'reminders',(select jsonb_agg(to_jsonb(r) order by id) from public.reminder_candidates r),
    'notices',(select jsonb_agg(to_jsonb(n) order by id) from public.inbox_notifications n),
    'finance',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'ledger',(select jsonb_agg(to_jsonb(e) order by id) from public.ledger_entries e))`);
}

export function verifyLegacyRoutineDefinitions(db) {
  const before = retained(db),
    cases = [];
  const calls = [
    ["create_routine", create("create_routine")],
    ["create_routine_once", create("create_routine_once")],
    ["edit_routine_definition", edit({ title: "Edited definition" })],
  ];
  for (const [name, expression] of calls) {
    for (const actor of [9831, 9833, null])
      denied(db, cases, {
        name,
        expression,
        actor,
        reason: "foreign-or-absent-member",
        expected: /membership required|not a member|cannot edit/,
      });
    denied(db, cases, {
      name,
      expression,
      actor: 1,
      role: "anon",
      reason: "anonymous-execution",
      expected: /permission denied/,
    });
  }
  verifyReferences(db, cases);
  verifyCreates(db, cases);
  verifyEdits(db, cases);
  assert.equal(
    retained(db),
    before,
    "Rolled-back definition probes must preserve all original rows",
  );
  return {
    passed: true,
    cases,
    definitions: definitions(db),
    originalRowsUnchanged: true,
    disposableOnly: true,
  };
}

function verifyReferences(db, cases) {
  const references = [
    { reason: "area", creation: { areaId: id(9834) }, patch: { area_id: id(9834) } },
    { reason: "pet", creation: { petId: id(9835) }, patch: { pet_id: id(9835) } },
    {
      reason: "assignee",
      creation: { assignmentPolicy: "assigned", assignedMemberId: id(9831) },
      patch: { assignment_policy: "assigned", assigned_member_id: id(9831) },
    },
    {
      reason: "rotation",
      creation: { assignmentPolicy: "alternating", rotationAnchorMemberId: id(9831) },
      patch: { assignment_policy: "alternating", rotation_anchor_member_id: id(9831) },
    },
  ];
  for (const actor of [1, 2]) {
    for (const { reason, creation, patch } of references) {
      for (const name of ["create_routine", "create_routine_once"])
        denied(db, cases, {
          name,
          actor,
          expression: create(name, creation),
          reason: `foreign-${reason}`,
          expected: /foreign key constraint/,
        });
      denied(db, cases, {
        name: "edit_routine_definition",
        actor,
        expression: edit(patch),
        reason: `foreign-${reason}`,
        expected: /foreign key constraint/,
      });
    }
    denied(db, cases, {
      name: "edit_routine_definition",
      actor,
      expression: edit({ household_id: id(9830) }),
      reason: "tenant-field-injection",
      expected: /Invalid routine edit fields/,
    });
    denied(db, cases, {
      name: "update_routine_definition",
      actor,
      expression: `public.update_routine_definition('${routine}',p_title=>'Bypass edit baseline')`,
      reason: "revoked-unversioned-primitive",
      expected: /permission denied/,
    });
  }
}

function verifyCreates(db, cases) {
  for (const actor of [1, 2]) {
    for (const name of ["create_routine", "create_routine_once"]) {
      const expression = create(name);
      const actual = JSON.parse(
        run(
          db,
          actor,
          `do $probe$ declare r jsonb; initial_count bigint; begin
        r := ${expression}; select count(*) into initial_count from public.routines;
        ${name === "create_routine_once" ? `if ${expression} <> r or (select count(*) from public.routines) <> initial_count then raise exception 'Creation replay duplicated a routine'; end if;` : ""}
        if (select count(*) from public.routine_occurrences where routine_id=(r->>'routine_id')::uuid
          and status='open' and role in ('current','preview')) <> 2 then raise exception 'Invalid created window'; end if;
        end $probe$;
        select jsonb_build_object('newRoutines',count(*),'title',min(title)) from public.routines
          where title='${payload.title}'`,
        ),
      );
      assert.equal(actual.newRoutines, 1);
      cases.push({
        function: name,
        actor,
        createdOneRoutineWithTwoOpenOccurrences: true,
        exactReplayVerified: name === "create_routine_once",
      });
    }
    const setup = `set local role authenticated; set local request.jwt.claim.sub='${id(actor)}'; select ${create("create_routine_once")};`;
    denied(db, cases, {
      name: "create_routine_once",
      actor,
      setup,
      expression: create("create_routine_once", { title: "Changed creation" }),
      reason: "changed-retry-payload",
      expected: /creation request changed/,
    });
    denied(db, cases, {
      name: "create_routine_once",
      actor: actor === 1 ? 2 : 1,
      setup,
      expression: create("create_routine_once"),
      reason: "other-member-retry-identity",
      expected: /creation request changed/,
    });
  }
}

function verifyEdits(db, cases) {
  for (const actor of [1, 2]) {
    const expression = edit({ title: "Edited definition", instructions: null }, "expected");
    const actual = JSON.parse(
      run(
        db,
        actor,
        `do $probe$ declare expected timestamptz; r jsonb; activity_count bigint; begin
      select updated_at into expected from public.routines where id='${routine}';
      r := ${expression}; select count(*) into activity_count from public.activity_events;
      if ${expression} <> r or (select count(*) from public.activity_events) <> activity_count then
        raise exception 'Edit replay duplicated activity'; end if;
      end $probe$;
      reset role;
      select jsonb_build_object('title',title,'instructions',instructions,
        'clearIntents',(select count(*) from private.routine_edit_clear_intents),
        'openOccurrences',(select count(*) from public.routine_occurrences where routine_id='${routine}' and status='open'))
        from public.routines where id='${routine}'`,
      ),
    );
    assert.equal(actual.title, "Edited definition");
    assert.equal(actual.instructions, null);
    assert.equal(actual.clearIntents, 0);
    assert.equal(actual.openOccurrences, 2);
    cases.push({
      function: "edit_routine_definition",
      actor,
      exactReplayAndExplicitClearPassed: true,
    });
    denied(db, cases, {
      name: "edit_routine_definition",
      actor,
      expression: edit({ title: "Stale edit" }, "'2000-01-01T00:00:00Z'::timestamptz"),
      reason: "stale-version",
      expected: /This routine changed/,
    });
  }
}

function definitions(db) {
  return JSON.parse(
    db.sql(`select jsonb_agg(jsonb_build_object(
    'function',p.oid::regprocedure::text,'bodySHA256',encode(sha256(convert_to(btrim(p.prosrc),'UTF8')),'hex'),
    'securityDefiner',p.prosecdef,'configuration',p.proconfig,
    'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p where p.oid in (
      'public.create_routine(uuid,text,uuid,text,text,jsonb,uuid,uuid,text,uuid,text,date,date)'::regprocedure,
      'public.create_routine_once(uuid,text,jsonb)'::regprocedure,
      'public.edit_routine_definition(uuid,timestamptz,text,jsonb)'::regprocedure,
      'public.update_routine_definition(uuid,text,text,uuid,uuid,text,uuid,uuid,text,jsonb,text,date,date,boolean)'::regprocedure)`),
  );
}
