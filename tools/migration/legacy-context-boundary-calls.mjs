export const contextBoundaryId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const id = contextBoundaryId;
const uuidLiteral = (value) => (value === null ? "null" : literal(id(value)));
const literal = (value) => (value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`);

export function contextBoundaryFixture() {
  return `insert into auth.users(id) values('${id(9981)}'),('${id(9982)}'),('${id(9983)}');
    insert into public.households(id,name) values('${id(9980)}','Foreign context boundary');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9980)}','${id(9981)}','Foreign first'),('${id(9980)}','${id(9982)}','Foreign second');
    insert into public.household_projects(id,household_id,created_by,kind,title)
      values('${id(9984)}','${id(9980)}','${id(9981)}','project','Foreign project');
    insert into public.household_commitments(id,household_id,created_by,title)
      values('${id(9987)}','${id(10)}','${id(1)}','Own commitment');
    set local request.jwt.claim.sub='${id(1)}';
    insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,
      payer_member_id,description,amount_cents)
      values('${id(9990)}','${id(10)}','expense','2026-10-05','${id(1)}','${id(1)}','Context source',3),
        ('${id(9994)}','${id(9980)}','expense','2026-10-05','${id(9981)}','${id(9981)}','Foreign context source',3);
    insert into public.financial_allocations(household_id,financial_event_id,member_id,allocated_cents)
      values('${id(10)}','${id(9990)}','${id(1)}',2),('${id(10)}','${id(9990)}','${id(2)}',1),
        ('${id(9980)}','${id(9994)}','${id(9981)}',2),('${id(9980)}','${id(9994)}','${id(9982)}',1);
    insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents)
      values('${id(10)}','${id(9990)}','${id(1)}',1),('${id(10)}','${id(9990)}','${id(2)}',-1),
        ('${id(9980)}','${id(9994)}','${id(9981)}',1),('${id(9980)}','${id(9994)}','${id(9982)}',-1);`;
}

export function contextOpening({
  household = 9980,
  creditor = 9981,
  amount = 3,
  key = "boundary-opening",
  note = "Boundary only",
} = {}) {
  return `public.establish_opening_balance('${id(household)}','${id(creditor)}',${amount},
    '2026-10-05','Boundary opening',${literal(key)},${literal(note)})`;
}

export function contextPost({
  kind = "project",
  context = 1300,
  booking = null,
  amount = 3,
  payer = 1,
  member = 2,
  key = "boundary-context-post",
  note = "Boundary only",
} = {}) {
  return `public.post_contextual_expense('${id(10)}','Boundary expense',${amount},'${id(payer)}',
    '[{"memberId":"${id(1)}","allocatedCents":2},{"memberId":"${id(member)}","allocatedCents":1}]'::jsonb,
    '2026-10-05',${literal(key)},${literal(kind)},${uuidLiteral(context)},
    null,${literal(note)},null,${uuidLiteral(booking)})`;
}

export function contextAssign({
  event = 9990,
  revision = "null",
  request = 9991,
  kind = "project",
  context = 1300,
  booking = null,
} = {}) {
  return `public.assign_expense_context('${id(10)}','${id(event)}',${revision},'${id(request)}',
    ${literal(kind)},${uuidLiteral(context)},
    ${uuidLiteral(booking)})`;
}

export function contextRead({
  kind = "project",
  context = 1301,
  pageSize = 30,
  beforeOn = null,
  beforeId = null,
  booking = null,
} = {}) {
  return `public.read_household_cost_context(${literal(kind)},${literal(id(context))},${pageSize},
    ${literal(beforeOn)},${beforeId === null ? "null" : literal(id(beforeId))},
    ${uuidLiteral(booking)})`;
}

export function contextInvalidVariants() {
  return [
    [
      "assign_expense_context",
      contextAssign({ event: 9994 }),
      "foreign-existing-expense",
      /Expense unavailable/,
    ],
    ["post_contextual_expense", contextPost({ amount: -1 }), "negative-centimes", /safe integer/],
    [
      "post_contextual_expense",
      contextPost({ amount: 9007199254740992 }),
      "unsafe-centimes",
      /safe integer/,
    ],
    ["post_contextual_expense", contextPost({ payer: 9981 }), "foreign-payer", /foreign key/],
    [
      "post_contextual_expense",
      contextPost({ member: 9981 }),
      "foreign-allocation",
      /household members/,
    ],
    [
      "post_contextual_expense",
      contextPost({ kind: "unsupported" }),
      "invalid-context-kind",
      /valid expense context/,
    ],
    [
      "post_contextual_expense",
      contextPost({ booking: 1304 }),
      "wrong-project-booking",
      /Booking does not belong/,
    ],
    [
      "assign_expense_context",
      contextAssign({ event: 104 }),
      "settlement-is-not-expense",
      /Expense unavailable/,
    ],
    [
      "assign_expense_context",
      contextAssign({ event: 9999 }),
      "missing-expense",
      /Expense unavailable/,
    ],
    [
      "assign_expense_context",
      contextAssign({ booking: 1304 }),
      "wrong-project-booking",
      /Booking does not belong/,
    ],
    [
      "assign_expense_context",
      contextAssign({ kind: null }),
      "missing-kind",
      /Invalid expense association/,
    ],
    [
      "read_household_cost_context",
      contextRead({ pageSize: 0 }),
      "invalid-page",
      /Invalid cost context/,
    ],
    [
      "read_household_cost_context",
      contextRead({ beforeId: 100 }),
      "partial-cursor",
      /Invalid cost context/,
    ],
    [
      "read_household_cost_context",
      contextRead({ context: 1300, booking: 1304 }),
      "wrong-project-booking",
      /Booking does not belong/,
    ],
  ];
}
