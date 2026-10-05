const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const shoppingBoundaryId = id;
export const shoppingSession = (actor) => id(9954 + actor);
export const shoppingClaimedItem = (actor) => id(9960 + actor);

export function shoppingBoundaryFixture() {
  return `insert into auth.users(id) values('${id(9941)}'),('${id(9942)}'),('${id(9943)}');
    insert into public.households(id,name) values('${id(9940)}','Foreign shopping boundary');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9940)}','${id(9941)}','Foreign first'),('${id(9940)}','${id(9942)}','Foreign second');
    insert into public.grocery_categories(id,household_id,name,sort_order)
      values('${id(9947)}','${id(9940)}','Foreign category',0);
    update public.shopping_sessions set finished_at=now() where household_id='${id(10)}' and finished_at is null;
    insert into public.shopping_sessions(id,household_id,member_id,finished_at,cancelled_at)
      values('${shoppingSession(1)}','${id(10)}','${id(1)}',null,null),
        ('${shoppingSession(2)}','${id(10)}','${id(2)}',null,null),
        ('${id(9957)}','${id(10)}','${id(1)}',now(),now()),
        ('${id(9958)}','${id(10)}','${id(2)}',now(),null),
        ('${id(9945)}','${id(9940)}','${id(9941)}',null,null);
    insert into public.grocery_items(id,household_id,name,state,claimed_by_session_id,purchased_at,removed_at,sort_order)
      values('${id(9950)}','${id(10)}','Boundary active keep','active',null,null,null,0),
        ('${id(9953)}','${id(10)}','Boundary active remove','active',null,null,null,1),
        ('${shoppingClaimedItem(1)}','${id(10)}','Boundary first claim','claimed','${shoppingSession(1)}',null,null,2),
        ('${shoppingClaimedItem(2)}','${id(10)}','Boundary second claim','claimed','${shoppingSession(2)}',null,null,3),
        ('${id(9954)}','${id(10)}','Boundary purchased','purchased',null,now(),null,4),
        ('${id(9959)}','${id(10)}','Boundary removed','removed',null,null,now(),5),
        ('${id(9946)}','${id(9940)}','Foreign grocery','active',null,null,null,0);
    insert into public.shopping_session_items(household_id,shopping_session_id,grocery_item_id)
      values('${id(10)}','${shoppingSession(1)}','${shoppingClaimedItem(1)}'),
        ('${id(10)}','${shoppingSession(2)}','${shoppingClaimedItem(2)}');`;
}

export function shoppingMerge(patch = {}) {
  const v = {
    keep: 9950,
    remove: 9953,
    name: "Boundary merged",
    category: null,
    order: 0,
    ...patch,
  };
  return `public.merge_grocery_items('${id(v.keep)}','${id(v.remove)}','${v.name}',
    '2','bags',${v.category ? `'${id(v.category)}'` : "null"},null,${v.order},'boundary-merge')`;
}

export function shoppingFinish(actor, patch = {}) {
  const v = { session: 9954 + actor, total: 3, draft: false, amount: 1, payer: actor, ...patch };
  return `public.finish_shopping_session('${id(v.session)}','boundary-finish','2026-10-05',
    ${v.total},null,${v.draft},'Boundary draft',${v.amount},'${id(v.payer)}',
    '[{"member_id":"${id(1)}","amount_cents":1},{"member_id":"${id(2)}","amount_cents":0}]')`;
}

export function shoppingBoundaryCalls(actor) {
  return [
    {
      name: "start_shopping_session",
      expression: `public.start_shopping_session('${id(10)}')`,
      foreign: `public.start_shopping_session('${id(9940)}')`,
      variant: "existing",
      state: "claimed",
    },
    {
      name: "claim_grocery_item",
      expression: `public.claim_grocery_item('${shoppingSession(actor)}','${id(9950)}')`,
      foreign: `public.claim_grocery_item('${id(9945)}','${id(9946)}')`,
      state: "claimed",
      item: 9950,
    },
    {
      name: "release_grocery_item",
      expression: `public.release_grocery_item('${shoppingSession(actor)}','${shoppingClaimedItem(actor)}')`,
      foreign: `public.release_grocery_item('${id(9945)}','${id(9946)}')`,
      state: "active",
    },
    {
      name: "remove_grocery_item",
      expression: `public.remove_grocery_item('${id(9950)}')`,
      foreign: `public.remove_grocery_item('${id(9946)}')`,
      state: "removed",
      item: 9950,
    },
    {
      name: "merge_grocery_items",
      expression: shoppingMerge(),
      foreign: shoppingMerge({ keep: 9946 }),
      changed: shoppingMerge({ name: "Changed merge" }),
      state: "removed",
      item: 9953,
      receipt: true,
    },
    {
      name: "cancel_shopping_session",
      expression: `public.cancel_shopping_session('${shoppingSession(actor)}')`,
      foreign: `public.cancel_shopping_session('${id(9945)}')`,
      state: "active",
      cancelled: true,
      finished: true,
    },
    {
      name: "finish_shopping_session",
      expression: shoppingFinish(actor),
      foreign: shoppingFinish(actor, { session: 9945 }),
      changed: shoppingFinish(actor, { total: 4 }),
      state: "purchased",
      finished: true,
      receipt: true,
      activity: 1,
    },
  ];
}

export function shoppingBoundaryVariants(actor) {
  return [
    {
      name: "start_shopping_session",
      expression: `public.start_shopping_session('${id(10)}')`,
      setup: `update public.shopping_sessions set finished_at=now() where id='${shoppingSession(actor)}';`,
      variant: "new",
      state: "claimed",
      addedSessions: 1,
      finished: true,
    },
    {
      name: "finish_shopping_session",
      expression: shoppingFinish(actor, { draft: true }),
      variant: "draft-only",
      state: "purchased",
      finished: true,
      receipt: true,
      activity: 1,
      drafts: 1,
    },
  ];
}

export function invalidShoppingBoundaryCalls(actor) {
  const own = shoppingSession(actor),
    other = shoppingSession(actor === 1 ? 2 : 1);
  const calls = [];
  for (const name of ["claim_grocery_item", "release_grocery_item"]) {
    calls.push([name, `public.${name}('${own}','${id(9946)}')`, "foreign-item", /does not belong/]);
    calls.push([name, `public.${name}('${other}','${id(9950)}')`, "partner-session", /cannot use/]);
    for (const item of [9954, 9959])
      calls.push([
        name,
        `public.${name}('${own}','${id(item)}')`,
        "terminal-item",
        /terminal grocery/,
      ]);
    calls.push([
      name,
      `public.${name}('${own}','${shoppingClaimedItem(actor === 1 ? 2 : 1)}')`,
      "partner-claim",
      /another active session|not claimed by this session/,
    ]);
    calls.push([
      name,
      `public.${name}('${id(actor === 1 ? 9957 : 9958)}','${id(9950)}')`,
      "finished-session",
      /finished shopping sessions/,
    ]);
  }
  for (const item of [shoppingClaimedItem(actor), id(9954)])
    calls.push([
      "remove_grocery_item",
      `public.remove_grocery_item('${item}')`,
      "nonactive-item",
      /only active/,
    ]);
  return [...calls, ...invalidMergeCalls(), ...invalidSessionCalls(actor)];
}

function invalidMergeCalls() {
  const calls = [];
  calls.push([
    "merge_grocery_items",
    shoppingMerge({ remove: 9946 }),
    "foreign-remove",
    /same household/,
  ]);
  calls.push([
    "merge_grocery_items",
    shoppingMerge({ category: 9947 }),
    "foreign-category",
    /foreign key constraint/,
  ]);
  calls.push(["merge_grocery_items", shoppingMerge({ remove: 9950 }), "same-item", /two distinct/]);
  calls.push([
    "merge_grocery_items",
    shoppingMerge({ remove: 9954 }),
    "terminal-item",
    /only active/,
  ]);
  calls.push(["merge_grocery_items", shoppingMerge({ name: "" }), "empty-name", /requires a name/]);
  calls.push([
    "merge_grocery_items",
    shoppingMerge({ order: -1 }),
    "invalid-order",
    /non-negative sort order/,
  ]);
  return calls;
}

function invalidSessionCalls(actor) {
  const other = shoppingSession(actor === 1 ? 2 : 1),
    calls = [];
  calls.push([
    "cancel_shopping_session",
    `public.cancel_shopping_session('${other}')`,
    "partner-session",
    /cannot cancel/,
  ]);
  calls.push([
    "finish_shopping_session",
    shoppingFinish(actor, { session: actor === 1 ? 9956 : 9955 }),
    "partner-session",
    /cannot finish/,
  ]);
  calls.push([
    "finish_shopping_session",
    shoppingFinish(actor, { total: -1 }),
    "negative-total",
    /safe integer centimes/,
  ]);
  calls.push([
    "finish_shopping_session",
    shoppingFinish(actor, { draft: true, payer: 9941 }),
    "foreign-payer",
    /payer does not belong/,
  ]);
  calls.push([
    "finish_shopping_session",
    shoppingFinish(actor, { session: actor === 1 ? 9957 : 9958 }),
    "finished-session",
    /already finished/,
  ]);
  if (actor === 2)
    calls.push([
      "cancel_shopping_session",
      `public.cancel_shopping_session('${id(9958)}')`,
      "already-purchased-session",
      /already completed/,
    ]);
  return calls;
}
