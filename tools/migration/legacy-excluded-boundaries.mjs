import assert from "node:assert/strict";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";
import { captureExcludedHistory } from "./excluded-rehearsal.mjs";
import { denyExcludedBoundary as denied } from "./legacy-excluded-boundary-runner.mjs";
import { excludedFlows } from "./legacy-excluded-boundary-flows.mjs";
import {
  excludedBoundaryId as id,
  excludedTask,
  excludedBatch,
  excludedChoose,
  excludedConvert,
  excludedStatus,
  excludedArchive,
  excludedOrder,
  excludedInvalidTasks,
} from "./legacy-excluded-boundary-calls.mjs";

const calls = [
  ["add_project_task_batch", excludedBatch()],
  ["choose_household_decision_option", excludedChoose()],
  ["convert_household_decision", excludedConvert()],
  ["set_household_decision_status", excludedStatus()],
  ["archive_household_decision_option", excludedArchive()],
  ["reorder_household_areas", excludedOrder()],
];

export function verifyLegacyExcludedBoundaries(db) {
  const financial = captureRehearsal(db),
    excluded = captureExcludedHistory(db),
    state = captureState(db),
    cases = [];
  accessRefusals(db, cases);
  inputRefusals(db, cases);
  stateRefusals(db, cases);
  excludedFlows(db, cases);
  assert.equal(compareRehearsal(financial, captureRehearsal(db)).passed, true);
  assert.equal(captureExcludedHistory(db), excluded);
  assert.equal(captureState(db), state);
  return {
    passed: true,
    cases,
    compiledFunctions: metadata(db),
    disposableOnly: true,
    originalFinancialExcludedAreasAndReceiptsRetained: true,
    excludedFeaturesAddedToNative: false,
  };
}

function accessRefusals(db, cases) {
  for (const [name, expression] of calls) {
    for (const actor of [10021, 10023, null])
      denied(db, cases, {
        name,
        expression,
        actor,
        reason: "other-household-or-absent-member",
        expected:
          /authentication required|project unavailable|Decision not found|Option not found|not a household member|area list has changed/i,
      });
    denied(db, cases, {
      name,
      expression,
      role: "anon",
      reason: "anonymous-execution",
      expected: /permission denied/,
    });
  }
  const foreign = [
    [calls[0][0], excludedBatch({ project: 10024 })],
    [calls[1][0], excludedChoose({ decision: 10026, option: 10027 })],
    [calls[2][0], excludedConvert({ decision: 10026 })],
    [calls[3][0], excludedStatus({ decision: 10026 })],
    [calls[4][0], excludedArchive({ option: 10027 })],
    [calls[5][0], excludedOrder([10028])],
  ];
  for (const actor of [1, 2]) {
    for (const [name, expression] of foreign)
      denied(db, cases, {
        name,
        expression,
        actor,
        reason: "known-foreign-record",
        expected: /unavailable|not found|area list has changed/i,
      });
    denied(db, cases, {
      name: "private.project_starter_selections",
      expression: "count(*) from private.project_starter_selections",
      actor,
      reason: "private-receipt-read",
      expected: /permission denied/,
    });
  }
}

function inputRefusals(db, cases) {
  const variants = [
    [calls[1][0], excludedChoose({ option: 10002 }), /Option not found/, "other-decision-option"],
    [calls[1][0], excludedChoose({ option: 10027 }), /Option not found/, "foreign-option"],
    [calls[2][0], excludedConvert({ kind: "asset" }), /Invalid project kind/, "invalid-kind"],
    [calls[2][0], excludedConvert({ kind: null }), /null value/, "missing-kind"],
    [
      calls[3][0],
      excludedStatus({ status: "unknown" }),
      /Invalid decision status/,
      "invalid-status",
    ],
    [calls[3][0], excludedStatus({ status: null }), /Invalid decision status/, "missing-status"],
    [
      calls[4][0],
      excludedArchive({ archived: "null" }),
      /Choose an archive state/,
      "missing-archive-state",
    ],
  ];
  for (const actor of [1, 2]) {
    for (const [tasks, expected, reason] of excludedInvalidTasks())
      denied(db, cases, {
        name: calls[0][0],
        expression: excludedBatch({ tasks }),
        actor,
        expected,
        reason,
      });
    for (const [name, expression, expected, reason] of variants)
      denied(db, cases, { name, expression, actor, expected, reason });
    for (const ids of [
      null,
      [],
      [1200],
      [1200, 1200],
      [1200, null],
      [1200, 10028],
      [1200, 10005],
      [1200, 9999],
    ])
      denied(db, cases, {
        name: calls[5][0],
        expression: excludedOrder(ids),
        actor,
        expected: /area list has changed/,
        reason: "incomplete-duplicate-null-foreign-or-stale-area-list",
      });
  }
}

function stateRefusals(db, cases) {
  for (const actor of [1, 2]) {
    denied(db, cases, {
      name: calls[0][0],
      expression: excludedBatch(),
      actor,
      expected: /Restore this plan/,
      reason: "archived-project",
      setup: `update public.household_projects set archived_at=now() where id='${id(1300)}';`,
    });
    denied(db, cases, {
      name: calls[1][0],
      expression: excludedChoose(),
      actor,
      expected: /Option not found/,
      reason: "archived-option",
      setup: `update public.decision_options set archived_at=now() where id='${id(10003)}';`,
    });
    const setup = `set local request.jwt.claim.sub='${id(actor)}'; select ${excludedBatch()};`;
    denied(db, cases, {
      name: calls[0][0],
      expression: excludedBatch({ tasks: [excludedTask({ title: "Changed selection" })] }),
      actor,
      setup,
      expected: /another selection/,
      reason: "changed-retry-payload",
    });
    denied(db, cases, {
      name: calls[0][0],
      expression: excludedBatch({ project: 10000 }),
      actor,
      setup,
      expected: /task identity unavailable/,
      reason: "same-household-other-project-retry",
    });
  }
}

function captureState(db) {
  return db.sql(`select jsonb_build_object(
    'areas',(select jsonb_agg(to_jsonb(r) order by id) from public.areas r),
    'selections',(select coalesce(jsonb_agg(to_jsonb(r) order by task_id),'[]') from private.project_starter_selections r))`);
}

function metadata(db) {
  const names = [
    ...calls.map(([name]) => name),
    "advance_home_record_version",
    "append_household_area",
    "guard_household_record_identity",
  ];
  const rows = JSON.parse(
    db.sql(String.raw`select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,
    'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex'),
    'securityDefiner',p.prosecdef,'config',p.proconfig,
    'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in (${names.map((n) => `'${n}'`).join(",")})`),
  );
  assert.equal(rows.length, 9);
  for (const row of rows) {
    assert.deepEqual(row.config, ['search_path=""']);
    assert.equal(row.anonymousExecute, false);
    assert.equal(row.authenticatedExecute, row.schema === "public");
    assert.equal(
      row.securityDefiner,
      !["advance_home_record_version", "guard_household_record_identity"].includes(row.name),
    );
  }
  return rows;
}
