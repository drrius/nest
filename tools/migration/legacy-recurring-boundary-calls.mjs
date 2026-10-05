export const recurringBoundaryId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const id = recurringBoundaryId;
export const recurringLiteral = (value) =>
  value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const quote = recurringLiteral;
export const recurringAllocations = (member = 2) =>
  JSON.stringify([
    { memberId: id(1), allocatedCents: 51 },
    { memberId: id(member), allocatedCents: 50 },
  ]);

export function recurringBoundaryFixture() {
  return `insert into auth.users(id) values('${id(9951)}'),('${id(9952)}'),('${id(9953)}');
    insert into public.households(id,name) values('${id(9950)}','Foreign recurring boundary');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9950)}','${id(9951)}','Foreign first'),('${id(9950)}','${id(9952)}','Foreign second');
    insert into public.expense_categories(id,household_id,name,sort_order)
      values('${id(9954)}','${id(9950)}','Foreign category',0);
    create temporary table recurring_boundary_version as select updated_at
      from public.recurring_expense_rules where id='${id(900)}';
    grant select on recurring_boundary_version to authenticated;`;
}

function terms(options) {
  return {
    description: "Boundary recurring",
    amount: 101,
    payer: 1,
    allocations: recurringAllocations(),
    schedule: "monthly",
    next: "2026-01-31",
    weekday: "null",
    monthday: 31,
    category: "null",
    ...options,
  };
}

function termArguments(t) {
  return `${quote(t.description)},${t.amount},'${id(t.payer)}',${quote(t.allocations)}::jsonb,
    ${quote(t.schedule)},${quote(t.next)}`;
}

export function recurringCreate(options = {}) {
  const t = terms(options);
  const { household = 10, key = "boundary-create" } = options;
  return `public.create_recurring_expense_rule('${id(household)}',${termArguments(t)},
    ${quote(key)},${t.weekday},${t.monthday},${t.category})`;
}

export function recurringUpdate(options = {}) {
  const t = terms(options);
  const {
    rule = 900,
    key = "boundary-update",
    version = "(select updated_at from pg_temp.recurring_boundary_version)",
  } = options;
  return `public.update_recurring_expense_rule('${id(rule)}',${version},${termArguments(t)},
    ${quote(key)},${t.weekday},${t.monthday},${t.category})`;
}

export function recurringActive({ rule = 900, active = "false", key = "boundary-active" } = {}) {
  return `public.set_recurring_expense_rule_active('${id(rule)}',${active},${quote(key)})`;
}

export function recurringGenerate({
  household = 10,
  date = "2026-04-30",
  key = "boundary-generate",
} = {}) {
  return `public.generate_due_recurring_drafts('${id(household)}',${quote(date)}::date,${quote(key)})`;
}

export function recurringConfirm({
  draft = 910,
  key = "boundary-confirm",
  amount = "null",
  payer = "null",
  allocations = null,
} = {}) {
  return `public.confirm_expense_draft('${id(draft)}',${quote(key)},${amount},${payer},${quote(allocations)}::jsonb)`;
}

export function recurringDismiss({ draft = 910, key = "boundary-dismiss" } = {}) {
  return `public.dismiss_expense_draft('${id(draft)}',${quote(key)})`;
}

// Deliberately privileged malformed-state fixture: tests fences even with an old pending
// draft and active source. This is not evidence of the native adoption command's approval.
export function recurringAdoptionFenceSeed() {
  return `insert into public.nest_recurring_rules(household_id,id,revision,configuration,status,authorized_by)
    values('${id(10)}','${id(900)}','${id(9955)}','{}','paused','${id(1)}');
    insert into private.nest_legacy_recurring_adoptions(household_id,legacy_rule_id,native_rule_id,source_review_token,authorized_by)
    values('${id(10)}','${id(900)}','${id(900)}',repeat('0',64),'${id(1)}');`;
}
