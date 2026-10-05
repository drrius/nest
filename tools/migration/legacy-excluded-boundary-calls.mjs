export const excludedBoundaryId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const id = excludedBoundaryId;
export const excludedLiteral = (value) =>
  value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const quote = excludedLiteral;
export const excludedTask = (overrides = {}) => ({
  id: id(10010),
  title: "Boundary task",
  section: "Tasks",
  notes: "Synthetic only",
  ...overrides,
});

export function excludedBoundaryFixture() {
  return `insert into auth.users(id) values('${id(10021)}'),('${id(10022)}'),('${id(10023)}');
    insert into public.households(id,name) values('${id(10020)}','Foreign excluded boundary');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(10020)}','${id(10021)}','Foreign first'),('${id(10020)}','${id(10022)}','Foreign second');
    insert into public.household_projects(id,household_id,created_by,kind,title)
      values('${id(10000)}','${id(10)}','${id(1)}','project','Other own project'),
        ('${id(10024)}','${id(10020)}','${id(10021)}','project','Foreign project');
    insert into public.project_tasks(id,household_id,created_by,project_id,title)
      values('${id(10025)}','${id(10020)}','${id(10021)}','${id(10024)}','Foreign task');
    insert into public.household_decisions(id,household_id,created_by,title,project_id)
      values('${id(10001)}','${id(10)}','${id(1)}','Other own decision','${id(1300)}'),
        ('${id(10026)}','${id(10020)}','${id(10021)}','Foreign decision','${id(10024)}');
    insert into public.decision_options(id,household_id,created_by,decision_id,title)
      values('${id(10002)}','${id(10)}','${id(1)}','${id(10001)}','Other decision option'),
        ('${id(10003)}','${id(10)}','${id(1)}','${id(1311)}','Second own option'),
        ('${id(10027)}','${id(10020)}','${id(10021)}','${id(10026)}','Foreign option');
    insert into public.areas(id,household_id,name,sort_order,archived_at)
      values('${id(10004)}','${id(10)}','Second own area',0,null),
        ('${id(10005)}','${id(10)}','Archived own area',0,now()),
        ('${id(10028)}','${id(10020)}','Foreign area',0,null);`;
}

export function excludedBatch({ project = 1300, tasks = [excludedTask()] } = {}) {
  return `public.add_project_task_batch('${id(project)}',${quote(JSON.stringify(tasks))}::jsonb)`;
}
export function excludedChoose({ decision = 1311, option = 10003 } = {}) {
  return `public.choose_household_decision_option('${id(decision)}',${option === null ? "null" : quote(id(option))})`;
}
export function excludedConvert({ decision = 1311, kind = "project" } = {}) {
  return `public.convert_household_decision('${id(decision)}',${quote(kind)})`;
}
export function excludedStatus({ decision = 1311, status = "dismissed" } = {}) {
  return `public.set_household_decision_status('${id(decision)}',${quote(status)})`;
}
export function excludedArchive({ option = 1312, archived = "true" } = {}) {
  return `public.archive_household_decision_option('${id(option)}',${archived})`;
}
export function excludedOrder(ids = [10004, 1200]) {
  const value =
    ids === null
      ? "null"
      : `array[${ids.map((n) => (n === null ? "null" : quote(id(n)))).join(",")}]::uuid[]`;
  return `public.reorder_household_areas(${value})`;
}

export function excludedInvalidTasks() {
  return [
    [null, /invalid task batch/, "missing-batch"],
    [{}, /invalid task batch/, "non-array-batch"],
    [[], /between one and twenty/, "empty-batch"],
    [
      Array.from({ length: 21 }, (_, n) => excludedTask({ id: id(10100 + n) })),
      /between one and twenty/,
      "oversized-batch",
    ],
    [[excludedTask(), excludedTask()], /duplicate task identity/, "duplicate-identity"],
    [[excludedTask({ id: null })], /duplicate task identity/, "missing-identity"],
    [[excludedTask({ id: "invalid" })], /invalid input syntax/, "malformed-identity"],
    [[excludedTask({ title: "" })], /invalid task details/, "blank-title"],
    [[excludedTask({ title: "x".repeat(201) })], /invalid task details/, "oversized-title"],
    [[excludedTask({ section: "" })], /invalid task details/, "blank-section"],
    [[excludedTask({ notes: "x".repeat(4001) })], /invalid task details/, "oversized-notes"],
    [
      [excludedTask({ assigned_member_id: id(2) })],
      /invalid task details/,
      "unexpected-authority-field",
    ],
    [[excludedTask({ id: id(10025) })], /task identity unavailable/, "foreign-task-identity"],
  ];
}
