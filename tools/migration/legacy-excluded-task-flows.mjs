import assert from "node:assert/strict";
import {
  excludedBoundaryId as id,
  excludedTask,
  excludedBatch,
} from "./legacy-excluded-boundary-calls.mjs";
import {
  excludedFlow as flow,
  excludedRows as rows,
  excludedAssert as check,
  excludedSnapshot as snapshot,
} from "./legacy-excluded-boundary-observer.mjs";

const added = (n) => `'${JSON.stringify({ added: n, skipped: 0 })}'::jsonb`;
const skipped = (n) => `'${JSON.stringify({ added: 0, skipped: n })}'::jsonb`;

export function excludedTaskFlows(db, cases, actor) {
  batchRepeat(db, cases, actor);
  existingTask(db, cases, actor);
  skippedTask(db, cases, actor);
  editedTask(db, cases, actor);
  sortLimit(db, cases, actor);
}

function batchRepeat(db, cases, actor) {
  const command = excludedBatch({
    tasks: [excludedTask(), excludedTask({ id: id(10011), title: "Second boundary task" })],
  });
  const taskRows = rows("public.project_tasks", `id in ('${id(10010)}','${id(10011)}')`);
  const value = flow(db, cases, {
    actor,
    name: "add_project_task_batch",
    reason: "two-selected-tasks-exact-replay",
    body: `${check(command, added(2))} ${snapshot("selected_tasks", taskRows)} ${check(command, skipped(2))}`,
    observation: `jsonb_build_object('tasks',(select count(*) from public.project_tasks
        where id in ('${id(10010)}','${id(10011)}') and created_by='${id(actor)}'),
      'receipts',(select count(*) from private.project_starter_selections where task_id in ('${id(10010)}','${id(10011)}')),
      'unchanged',(select body=${taskRows} from selected_tasks))`,
  });
  assert.deepEqual(value, { tasks: 2, receipts: 2, unchanged: true });
}

function existingTask(db, cases, actor) {
  const command = excludedBatch({ tasks: [excludedTask({ id: id(1310) })] });
  const taskRows = rows("public.project_tasks", `id='${id(1310)}'`);
  const value = flow(db, cases, {
    actor,
    name: "add_project_task_batch",
    reason: "existing-manual-task-not-overwritten",
    setup: `create temporary table manual_task as select ${taskRows} body;`,
    body: `${check(command, skipped(1))} ${check(command, skipped(1))}`,
    observation: `jsonb_build_object('unchanged',(select body=${taskRows} from manual_task),
      'receipts',(select count(*) from private.project_starter_selections where task_id='${id(1310)}'))`,
  });
  assert.deepEqual(value, { unchanged: true, receipts: 1 });
}

function skippedTask(db, cases, actor) {
  const command = excludedBatch({
    tasks: [excludedTask({ id: id(10012), title: "Retained task" })],
  });
  const value = flow(db, cases, {
    actor,
    name: "add_project_task_batch",
    reason: "skipped-selection-never-resurrected-after-edit",
    body: `${check(command, skipped(1))}
      update public.project_tasks set title='Later manual edit' where id='${id(1310)}';
      ${check(command, skipped(1))}`,
    observation: `jsonb_build_object('absent',(select count(*)=0 from public.project_tasks where id='${id(10012)}'),
      'edited',(select title='Later manual edit' from public.project_tasks where id='${id(1310)}'),
      'receipts',(select count(*) from private.project_starter_selections where task_id='${id(10012)}'))`,
  });
  assert.deepEqual(value, { absent: true, edited: true, receipts: 1 });
}

function editedTask(db, cases, actor) {
  const command = excludedBatch(),
    taskRows = rows("public.project_tasks", `id='${id(10010)}'`);
  const value = flow(db, cases, {
    actor,
    name: "add_project_task_batch",
    reason: "later-task-edit-and-archive-retained-on-replay",
    body: `${check(command, added(1))}
      update public.project_tasks set title='Later edit',archived_at=now() where id='${id(10010)}';
      ${snapshot("edited_task", taskRows)} ${check(command, skipped(1))}`,
    observation: `jsonb_build_object('unchanged',(select body=${taskRows} from edited_task),
      'archived',(select archived_at is not null from public.project_tasks where id='${id(10010)}'))`,
  });
  assert.deepEqual(value, { unchanged: true, archived: true });
}

function sortLimit(db, cases, actor) {
  const value = flow(db, cases, {
    actor,
    name: "add_project_task_batch",
    reason: "integer-sort-boundary-does-not-overflow",
    setup: `update public.project_tasks set sort_order=2147483647 where id='${id(1310)}';`,
    body: check(excludedBatch(), added(1)),
    observation: `jsonb_build_object('position',(select sort_order from public.project_tasks where id='${id(10010)}'))`,
  });
  assert.deepEqual(value, { position: 2147483647 });
}
