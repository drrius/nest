import assert from "node:assert/strict";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const native = `${id(10)}/receipts/${id(9600)}.jpg`;
const photo = `${id(10)}/completions/${id(9601)}.jpg`;
const document = `${id(10)}/documents/${id(9602)}.pdf`;
const occurrence = id(9606);
const today = "current_setting('nest.parent_today')::date";
const complete = (date = today, path = "null", key = "parent-boundary") =>
  `public.complete_occurrence('${occurrence}','${key}',${date},null,${path})`;
const insertDocument = (target = native, home = 10, creator = 1) =>
  `insert into public.household_documents(id,household_id,created_by,title,file_path)
    values('${id(9607)}','${id(home)}','${id(creator)}','Parent boundary document','${target}')`;

function seedSql() {
  const input = JSON.stringify({
    uploadId: id(9600),
    sha256: "a".repeat(64),
    bytes: 128,
    contentType: "image/jpeg",
  });
  return `insert into auth.users(id) values('${id(9611)}'),('${id(9612)}');
    insert into public.households(id,name) values('${id(9610)}','Parent boundary household');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9610)}','${id(9611)}','Foreign member');
    set local request.jwt.claim.sub='${id(1)}';
    do $seed$ begin
      perform set_config('nest.parent_today',private.household_today()::text,true);
      perform public.nest_reserve_receipt_upload('${id(10)}','${input}');
      perform public.reserve_household_attachment('${photo}','image/jpeg');
      perform public.reserve_household_attachment('${document}','application/pdf');
    end $seed$;
    insert into storage.objects(bucket_id,name,metadata) values
      ('household-files','${native}','{"mimetype":"image/jpeg","size":128}'),
      ('household-files','${photo}','{"mimetype":"image/jpeg","size":128}'),
      ('household-files','${document}','{"mimetype":"application/pdf","size":128}');
    insert into public.routines(id,household_id,title,area_id,assignment_policy,schedule_kind,schedule_rule)
      values('${id(9605)}','${id(10)}','Parent boundary routine','${id(1200)}','shared','calendar','{"kind":"daily"}');
    insert into public.routine_occurrences(id,household_id,routine_id,due_date,original_due_date,status,role)
      values('${occurrence}','${id(10)}','${id(9605)}','2026-09-24','2026-09-24','open','current');`;
}

function run(db, actor, query, setup = "") {
  return db.sql(`begin; ${seedSql()} ${setup}
    set local role authenticated; set local request.jwt.claim.sub='${id(actor)}';
    ${query}; rollback;`);
}

function snapshot(db) {
  return db.sql(`select jsonb_build_object(
    'uploads',(select jsonb_agg(to_jsonb(u) order by path) from public.household_attachment_uploads u),
    'intents',(select jsonb_agg(to_jsonb(i) order by path) from private.nest_receipt_upload_intents i),
    'objects',(select jsonb_agg(to_jsonb(o) order by id) from storage.objects o),
    'finance',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'ledger',(select jsonb_agg(to_jsonb(e) order by id) from public.ledger_entries e),
    'documents',(select jsonb_agg(to_jsonb(d) order by id) from public.household_documents d),
    'members',(select jsonb_agg(to_jsonb(m) order by household_id,user_id) from public.household_members m),
    'completions',(select jsonb_agg(to_jsonb(c) order by occurrence_id) from public.routine_completions c))`);
}

export function verifyLegacyReceiptParents(db) {
  const before = snapshot(db),
    cases = [];
  const denied = (name, actor, query, expected) => {
    assert.throws(() => run(db, actor, query), expected);
    cases.push({ name, denied: true });
  };
  const check = (name, actual, expected) => {
    assert.deepEqual(actual, expected, name);
    cases.push({ name, passed: true });
  };
  denied(
    "partner document cannot claim pending native receipt",
    2,
    insertDocument(native, 10, 2),
    /Only the uploader/,
  );
  denied(
    "foreign document cannot claim another tenant receipt",
    9611,
    insertDocument(native, 9610, 9611),
    /must belong to its household/,
  );
  denied("forged document creator", 1, insertDocument(native, 10, 2), /Document access denied/);
  denied(
    "unaffiliated document insert",
    9612,
    insertDocument(native, 10, 9612),
    /Document access denied|row-level security/,
  );
  denied(
    "anonymous document insert",
    1,
    `set local role anon; ${insertDocument()}`,
    /permission denied/,
  );
  denied(
    "profile photo direct update remains forbidden",
    1,
    `update public.household_members set photo_path='${native}' where user_id='${id(1)}'`,
    /permission denied/,
  );
  denied(
    "receipt cannot masquerade as completion photo",
    1,
    `select ${complete(undefined, `'${native}'`)}`,
    /Choose a completion photo/,
  );
  verifyCompletionDates(db, denied, check);
  verifyDocumentRelease(db, run, check);
  assert.equal(snapshot(db), before, "Parent probes must preserve original retained rows");
  return {
    passed: true,
    cases,
    originalRowsUnchanged: true,
    disposableOnly: true,
    storageBytesVerified: false,
  };
}

function verifyCompletionDates(db, denied, check) {
  for (const actor of [9611, 9612])
    denied(
      "foreign or unaffiliated completion",
      actor,
      `select ${complete()}`,
      /caller is not a member/,
    );
  denied(
    "anonymous completion",
    1,
    `set local role anon; select ${complete()}`,
    /permission denied/,
  );
  for (const date of [
    `${today}+1`,
    "'infinity'::date",
    "'-infinity'::date",
    "'10000-01-01'::date",
    "null",
  ])
    denied("invalid completion date", 1, `select ${complete(date)}`, /invalid_completed_date/);
  for (const actor of [1, 2]) {
    const result = JSON.parse(run(db, actor, `select ${complete(undefined, `'${photo}'`)}`));
    check("legacy completion photo remains valid", result.status, "completed");
  }
}

function verifyDocumentRelease(db, run, check) {
  const original = `set local request.jwt.claim.sub='${id(1)}'; ${insertDocument()};`;
  const visibility = `select count(*) from storage.objects where name='${native}'`;
  check(
    "document claim alone keeps native receipt private to uploader",
    run(db, 2, visibility, original),
    "0",
  );
  check("document uploader still reads its claimed receipt", run(db, 1, visibility, original), "1");
  const replace = `update public.household_documents set file_path='${document}' where id='${id(9607)}';
    select state from public.household_attachment_uploads where path='${native}'`;
  check(
    "last nonfinancial reference release restores native receipt pending",
    run(db, 2, replace, original),
    "pending",
  );
  const financial = `${original} update public.household_documents set file_path='${id(10)}/receipts/${id(700)}.jpg'
    where id='${id(9607)}';`;
  check(
    "retained financial receipt stays claimed after document replacement",
    run(
      db,
      1,
      `update public.household_documents set file_path='${document}' where id='${id(9607)}';
     select state from public.household_attachment_uploads where path='${id(10)}/receipts/${id(700)}.jpg'`,
      financial,
    ),
    "claimed",
  );
}
