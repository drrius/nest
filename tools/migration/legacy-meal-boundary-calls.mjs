const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const mealBoundaryId = id;
export const mealBoundaryEntry = id(9896);

export function mealBoundaryFixture() {
  return `insert into auth.users(id) values('${id(9891)}'),('${id(9892)}'),('${id(9893)}');
    insert into public.households(id,name) values('${id(9890)}','Foreign meal boundary');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9890)}','${id(9891)}','Foreign first'),('${id(9890)}','${id(9892)}','Foreign second');
    insert into public.areas(id,household_id,name,sort_order)
      values('${id(9894)}','${id(9890)}','Foreign preparation area',0);
    insert into public.meal_definitions(id,household_id,name)
      values('${id(9895)}','${id(9890)}','Foreign recipe');
    insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot)
      values('${mealBoundaryEntry}','${id(10)}','2026-09-24','lunch','Boundary freeform meal'),
        ('${id(9897)}','${id(10)}','2026-09-25','lunch','Second boundary meal'),
        ('${id(9898)}','${id(9890)}','2026-09-24','lunch','Foreign boundary meal');`;
}

export function mealBoundaryCalls() {
  return [
    {
      name: "create_and_place_meal",
      expression: create(),
      changed: create({ name: "Changed creation" }),
      foreign: create({ household: 9890 }),
      addedEntries: 1,
      addedDefinitions: 1,
      addedReceipts: 2,
    },
    {
      name: "place_meal",
      expression: place(),
      changed: place({ title: "Changed placement" }),
      foreign: place({ household: 9890 }),
      addedEntries: 1,
      addedReceipts: 1,
    },
    {
      name: "update_meal_plan_entry",
      expression: update(),
      changed: update({ title: "Changed update" }),
      foreign: update({ entry: 9898 }),
      addedReceipts: 1,
    },
    {
      name: "move_meal_plan_entry",
      expression: move(),
      changed: move({ date: "2026-09-26" }),
      foreign: move({ entry: 9898 }),
      addedReceipts: 1,
    },
    {
      name: "remove_meal_plan_entry",
      expression: remove(),
      changed: remove(9897),
      foreign: remove(9898),
      addedReceipts: 1,
    },
    {
      name: "create_meal_preparation",
      expression: preparation(),
      changed: preparation({ title: "Changed preparation" }),
      foreign: preparation({ entry: 9898 }),
      addedRoutines: 1,
      addedOccurrences: 1,
      addedReceipts: 1,
    },
    {
      name: "save_planned_meal_to_library",
      expression: save(),
      changed: save({ definition: 9900, name: "Competing saved recipe" }),
      foreign: save({ entry: 9898 }),
      addedDefinitions: 1,
      usesSourceLinkForRetry: true,
    },
  ];
}

export function mealBoundaryPlacementVariants() {
  return [
    {
      name: "place_meal",
      variant: "library-with-ingredient",
      expression: place({ source: "library", definition: 1000 }),
      changed: place({ source: "library", definition: 1000, title: "Changed library placement" }),
      addedEntries: 1,
      addedReceipts: 1,
      addedGroceries: 1,
      expectedDefinition: 1000,
    },
    {
      name: "place_meal",
      variant: "leftover-with-retained-recipe",
      expression: place({ source: "leftover", leftover: 1010 }),
      changed: place({ source: "leftover", leftover: 1010, title: "Changed leftover placement" }),
      addedEntries: 1,
      addedReceipts: 1,
      expectedDefinition: 1000,
      expectedLeftover: 1010,
    },
  ];
}

function create({ household = 10, name = "Boundary created recipe", slot = "dinner" } = {}) {
  return `public.create_and_place_meal('${id(household)}','${name}','2026-09-24',
    '${slot}','legacy-meal-create',null,'Boundary notes')`;
}

function place({
  household = 10,
  title = "Boundary placed meal",
  source = "freeform",
  definition = null,
  leftover = null,
} = {}) {
  return `public.place_meal('${id(household)}','2026-09-24','dinner','${source}','legacy-meal-place',
    ${definition === null ? "null" : `'${id(definition)}'`},
    ${leftover === null ? "null" : `'${id(leftover)}'`},'${title}',null,'Boundary notes')`;
}

function update({
  entry = 9896,
  title = "Boundary edited meal",
  date = "2026-09-24",
  slot = "lunch",
} = {}) {
  return `public.update_meal_plan_entry('${id(entry)}','${title}','${date}','${slot}',
    'legacy-meal-update',null,'Boundary updated notes')`;
}

function move({ entry = 9896, date = "2026-09-25", slot = "dinner" } = {}) {
  return `public.move_meal_plan_entry('${id(entry)}','${date}','${slot}','legacy-meal-move')`;
}

function remove(entry = 9896) {
  return `public.remove_meal_plan_entry('${id(entry)}','legacy-meal-remove')`;
}

function preparation({
  entry = 9896,
  title = "Boundary preparation",
  area = 1200,
  policy = "shared",
  assigned = null,
  rotation = null,
} = {}) {
  return `public.create_meal_preparation('${id(entry)}','${title}','Boundary instructions',
    (now() at time zone 'Europe/Zurich')::date,'${id(area)}','${policy}',
    ${assigned === null ? "null" : `'${id(assigned)}'`},
    ${rotation === null ? "null" : `'${id(rotation)}'`},'legacy-meal-preparation')`;
}

function save({
  entry = 9896,
  definition = 9899,
  name = "Boundary saved recipe",
  url = null,
} = {}) {
  return `public.save_planned_meal_to_library('${id(entry)}','${id(definition)}','${name}',
    ${url === null ? "null" : `'${String(url)}'`},'Boundary saved notes')`;
}

export function invalidMealBoundaryCalls() {
  return [
    [
      "place_meal",
      place({ source: "library", definition: 9895 }),
      "foreign-library",
      /does not belong/,
    ],
    [
      "place_meal",
      place({ source: "leftover", leftover: 9898 }),
      "foreign-leftover",
      /does not belong/,
    ],
    [
      "place_meal",
      place({ source: "leftover", leftover: 1012 }),
      "removed-leftover",
      /has been removed/,
    ],
    [
      "place_meal",
      place({ source: "leftover", leftover: 1011 }),
      "leftover-chain",
      /another leftover/,
    ],
    ["place_meal", place({ source: "unrecognized" }), "unknown-source", /unknown meal source/],
    ["create_and_place_meal", create({ name: "" }), "empty-name", /meal name/],
    [
      "create_and_place_meal",
      create({ slot: "unrecognized" }),
      "unknown-slot",
      /unknown meal slot/,
    ],
    ["update_meal_plan_entry", update({ entry: 1012 }), "removed-entry", /removed meal-plan/],
    ["move_meal_plan_entry", move({ entry: 1012 }), "removed-entry", /removed meal-plan/],
    [
      "move_meal_plan_entry",
      move({ entry: 1010, date: "2026-09-23" }),
      "source-after-leftover",
      /leftover before/,
    ],
    [
      "update_meal_plan_entry",
      update({ entry: 1011, date: "2026-09-20" }),
      "leftover-before-source",
      /source must be earlier/,
    ],
    ["create_meal_preparation", preparation({ entry: 1012 }), "removed-entry", /removed meal-plan/],
    ["create_meal_preparation", preparation({ area: 9894 }), "foreign-area", /foreign key/],
    [
      "create_meal_preparation",
      preparation({ policy: "assigned", assigned: 9891 }),
      "foreign-assignee",
      /foreign key/,
    ],
    [
      "create_meal_preparation",
      preparation({ policy: "alternating", rotation: 9891 }),
      "foreign-rotation",
      /foreign key/,
    ],
    ["save_planned_meal_to_library", save({ entry: 1012 }), "removed-entry", /Removed meals/],
    [
      "save_planned_meal_to_library",
      save({ url: "file:///private/recipe" }),
      "invalid-link",
      /recipe link/,
    ],
    [
      "save_planned_meal_to_library",
      save({ definition: 9895 }),
      "foreign-existing-definition-id",
      /duplicate key/,
    ],
  ];
}
