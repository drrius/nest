import assert from "node:assert/strict";
import {
  excludedBoundaryId as id,
  excludedChoose,
  excludedConvert,
  excludedStatus,
  excludedArchive,
} from "./legacy-excluded-boundary-calls.mjs";
import {
  excludedFlow as flow,
  excludedRows as rows,
  excludedAssert as check,
  excludedPerform as perform,
  excludedSnapshot as snapshot,
} from "./legacy-excluded-boundary-observer.mjs";
import { excludedTaskFlows } from "./legacy-excluded-task-flows.mjs";

export function excludedFlows(db, cases) {
  for (const actor of [1, 2]) {
    excludedTaskFlows(db, cases, actor);
    choiceFlows(db, cases, actor);
    statusFlows(db, cases, actor);
    archiveFlow(db, cases, actor);
    conversionFlows(db, cases, actor);
    areaFlow(db, cases, actor);
  }
}

function choiceFlows(db, cases, actor) {
  for (const clear of [false, true]) {
    const command = excludedChoose({ option: clear ? null : 10003 });
    const state = `jsonb_build_array(${rows("public.household_decisions", `id='${id(1311)}'`)},
      ${rows("public.decision_options", `decision_id='${id(1311)}'`)})`;
    const value = flow(db, cases, {
      actor,
      name: "choose_household_decision_option",
      reason: clear
        ? "clear-choice-repeat-preserves-complete-rows"
        : "choose-one-repeat-preserves-complete-rows",
      body: `${perform(command)} ${snapshot("decision_choice", state)} ${perform(command)}`,
      observation: `jsonb_build_object('unchanged',(select body=${state} from decision_choice),
        'chosen',(select coalesce(jsonb_agg(id order by id),'[]') from public.decision_options where decision_id='${id(1311)}' and chosen),
        'status',(select status from public.household_decisions where id='${id(1311)}'))`,
    });
    assert.deepEqual(value, {
      unchanged: true,
      chosen: clear ? [] : [id(10003)],
      status: clear ? "considering" : "decided",
    });
  }
}

function statusFlows(db, cases, actor) {
  for (const status of ["considering", "decided", "dismissed"]) {
    const command = excludedStatus({ status });
    const value = flow(db, cases, {
      actor,
      name: "set_household_decision_status",
      reason: `${status}-repeat-consistent-choice`,
      body: `${perform(command)} ${perform(command)}`,
      observation: `jsonb_build_object('status',(select status from public.household_decisions where id='${id(1311)}'),
        'chosen',(select count(*) from public.decision_options where decision_id='${id(1311)}' and chosen))`,
    });
    assert.deepEqual(value, { status, chosen: status === "decided" ? 1 : 0 });
  }
}

function archiveFlow(db, cases, actor) {
  const value = flow(db, cases, {
    actor,
    name: "archive_household_decision_option",
    reason: "archive-clears-choice-unarchive-does-not-rechoose",
    setup: `update public.household_decisions set status='decided' where id='${id(1311)}';`,
    body: `${perform(excludedArchive())} ${perform(excludedArchive())}
      ${check(`(select archived_at is not null and not chosen from public.decision_options where id='${id(1312)}')`, "true")}
      ${perform(excludedArchive({ archived: "false" }))} ${perform(excludedArchive({ archived: "false" }))}`,
    observation: `jsonb_build_object('restored',(select archived_at is null and not chosen from public.decision_options where id='${id(1312)}'),
      'status',(select status from public.household_decisions where id='${id(1311)}'))`,
  });
  assert.deepEqual(value, { restored: true, status: "considering" });
}

function conversionFlows(db, cases, actor) {
  for (const kind of ["project", "trip"]) {
    const value = flow(db, cases, {
      actor,
      name: "convert_household_decision",
      reason: `retained-${kind}-conversion-single-project-exact-retry`,
      body: `${perform(excludedConvert({ kind }))}
        ${snapshot("converted_decision", rows("public.household_decisions", `id='${id(1311)}'`))}
        ${check(excludedConvert({ kind }), `(select converted_project_id from public.household_decisions where id='${id(1311)}')`)}
        ${check(excludedConvert({ kind: kind === "trip" ? "project" : "trip" }), `(select converted_project_id from public.household_decisions where id='${id(1311)}')`)}`,
      observation: `jsonb_build_object('unchanged',(select body=${rows("public.household_decisions", `id='${id(1311)}'`)} from converted_decision),
        'created',(select count(*) from public.household_projects where title='Retained decision' and household_id='${id(10)}'
          and kind='${kind}' and description='' and created_by='${id(actor)}'),
        'status',(select status from public.household_decisions where id='${id(1311)}'))`,
    });
    assert.deepEqual(value, { unchanged: true, created: 1, status: "decided" });
  }
}

function areaFlow(db, cases, actor) {
  const command = `public.reorder_household_areas(array['${id(10004)}','${id(1200)}']::uuid[] ||
    coalesce((select array_agg(id order by id) from public.areas where household_id='${id(10)}'
      and archived_at is null and id not in ('${id(10004)}','${id(1200)}')), '{}'::uuid[]))`;
  const value = flow(db, cases, {
    actor,
    name: "reorder_household_areas",
    reason: "exact-active-area-order-repeat-retains-archived-and-foreign",
    setup: `create temporary table archived_area as select ${rows("public.areas", `id='${id(10005)}'`)} body;`,
    body: `${perform(command)} ${perform(command)}`,
    observation: `jsonb_build_object('positions',(select jsonb_agg(sort_order order by sort_order) from public.areas
        where id in ('${id(10004)}','${id(1200)}')),
      'order',(select jsonb_agg(id order by sort_order) from public.areas where id in ('${id(10004)}','${id(1200)}')),
      'archivedUnchanged',(select body=${rows("public.areas", `id='${id(10005)}'`)} from archived_area))`,
  });
  assert.deepEqual(value, {
    positions: [10, 20],
    order: [id(10004), id(1200)],
    archivedUnchanged: true,
  });
}
