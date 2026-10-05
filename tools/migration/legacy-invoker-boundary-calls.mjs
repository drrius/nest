import {
  excludedBoundaryId as id,
  excludedLiteral as quote,
} from "./legacy-excluded-boundary-calls.mjs";

export function invokerArchive({
  option = 1312,
  archived = "true",
  version = "'2000-01-01'::timestamptz",
} = {}) {
  return `public.archive_household_decision_option_versioned('${id(option)}',${archived},${version})`;
}

export function invokerAttention({
  kind = "inventory",
  query = "Boundary",
  page = 0,
  today = "2026-10-05",
} = {}) {
  return `public.list_home_attention_records(${quote(kind)},${quote(query)},${page === null ? "null" : page},${quote(today)}::date)`;
}

export function invokerFixture() {
  const assets = Array.from(
    { length: 25 },
    (_, n) => `('${id(10400 + n)}','${id(10)}','${id(1)}',
    'Boundary asset ${n}','2026-10-05'::date+${n % 3},null)`,
  );
  assets.push(
    `('${id(10210)}','${id(10)}','${id(1)}','Boundary later asset','2026-11-05',null)`,
    `('${id(10211)}','${id(10)}','${id(1)}','Boundary archived asset','2026-10-05',now())`,
    `('${id(10212)}','${id(10)}','${id(1)}','Boundary expired asset','2026-10-04',null)`,
    `('${id(10221)}','${id(10020)}','${id(10021)}','Boundary foreign asset','2026-10-05',null)`,
  );
  return `insert into public.household_assets(id,household_id,created_by,title,warranty_until,archived_at)
    values ${assets.join(",")};
    insert into public.household_commitments(id,household_id,created_by,title,status,renewal_on,notice_days,archived_at)
    values('${id(10300)}','${id(10)}','${id(1)}','Boundary renewal','active','2026-10-10',5,null),
      ('${id(10301)}','${id(10)}','${id(1)}','Boundary overdue renewal','active','2026-09-01',0,null),
      ('${id(10302)}','${id(10)}','${id(1)}','Boundary ended renewal','ended','2026-10-05',0,null),
      ('${id(10303)}','${id(10)}','${id(1)}','Boundary archived renewal','active','2026-10-05',0,now()),
      ('${id(10304)}','${id(10)}','${id(1)}','Boundary undated renewal','active',null,0,null),
      ('${id(10305)}','${id(10)}','${id(1)}','Boundary future renewal','active','2026-11-05',0,null),
      ('${id(10321)}','${id(10020)}','${id(10021)}','Boundary foreign renewal','active','2026-10-05',0,null);`;
}
