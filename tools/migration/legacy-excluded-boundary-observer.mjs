import assert from "node:assert/strict";
import { runExcludedBoundary as run } from "./legacy-excluded-boundary-runner.mjs";
import { excludedBoundaryId as id } from "./legacy-excluded-boundary-calls.mjs";

export function excludedRows(table, predicate = "true") {
  return `(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from ${table} r where ${predicate})`;
}

function financialState() {
  const tables = [
    "public.financial_events",
    "public.financial_allocations",
    "public.ledger_entries",
    "public.household_attachment_uploads",
    "storage.objects",
    "storage.buckets",
  ];
  return `jsonb_build_array(${tables.map((table) => excludedRows(table)).join(",")})`;
}

function foreignState() {
  const tables = [
    "public.household_projects",
    "public.project_tasks",
    "public.household_decisions",
    "public.decision_options",
    "public.areas",
    "private.project_starter_selections",
  ];
  return `jsonb_build_array(${tables.map((table) => excludedRows(table, `household_id='${id(10020)}'`)).join(",")})`;
}

export function excludedFlow(db, cases, { actor, name, reason, body, observation, setup = "" }) {
  const value = JSON.parse(
    run(
      db,
      actor,
      `${body} reset role;
    select jsonb_build_object('state',${observation},
      'foreignUnchanged',(select body=${foreignState()} from excluded_boundary_foreign),
      'financialAndStorageUnchanged',(select body=${financialState()} from excluded_boundary_finance))`,
      {
        setup: `${setup}
      create temporary table excluded_boundary_foreign as select ${foreignState()} body;
      create temporary table excluded_boundary_finance as select ${financialState()} body;`,
      },
    ),
  );
  assert.equal(value.foreignUnchanged, true);
  assert.equal(value.financialAndStorageUnchanged, true);
  cases.push({ function: name, actor, reason, ...value });
  return value.state;
}

export function excludedAssert(expression, expected) {
  return `do $$ begin if (${expression}) is distinct from (${expected}) then
    raise exception 'Excluded boundary assertion failed'; end if; end $$;`;
}

export function excludedPerform(expression) {
  return `do $$ begin perform ${expression}; end $$;`;
}

export function excludedSnapshot(name, expression) {
  return `reset role; create temporary table ${name} as select ${expression} body; set local role authenticated;`;
}
