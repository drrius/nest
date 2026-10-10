import assert from "node:assert/strict";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const path = (n, home = 10) => `${id(home)}/receipts/${id(n)}.jpg`;
const native = path(9500),
  legacy = path(9501),
  foreign = path(9502, 9510);
const sweep =
  "select coalesce(jsonb_agg(path order by path),'[]') from public.begin_household_attachment_cleanup()";
const begin = (target) => `select * from public.begin_household_attachment_cleanup('${target}')`;
const finish = (target) =>
  `do $finish$ begin perform public.finish_household_attachment_cleanup('${target}'); end $finish$`;
const state = (target) =>
  `select state from public.household_attachment_uploads where path='${target}'`;

function seedSql() {
  const input = JSON.stringify({
    uploadId: id(9500),
    sha256: "a".repeat(64),
    bytes: 128,
    contentType: "image/jpeg",
  });
  return `insert into auth.users(id) values('${id(9511)}'),('${id(9512)}');
    insert into public.households(id,name) values('${id(9510)}','Attachment boundary fixture');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9510)}','${id(9511)}','Foreign member');
    set local request.jwt.claim.sub='${id(1)}';
    do $seed$ begin
      perform public.nest_reserve_receipt_upload('${id(10)}','${input}');
      perform public.reserve_household_attachment('${legacy}','image/jpeg');
    end $seed$;
    set local request.jwt.claim.sub='${id(9511)}';
    do $seed$ begin perform public.reserve_household_attachment('${foreign}','image/jpeg'); end $seed$;
    insert into storage.objects(bucket_id,name,metadata) values
      ('household-files','${native}','{"mimetype":"image/jpeg","size":128}'),
      ('household-files','${legacy}','{"mimetype":"image/jpeg","size":128}'),
      ('household-files','${foreign}','{"mimetype":"image/jpeg","size":128}');
    update public.household_attachment_uploads set created_at=now()-interval '25 hours'
      where path in ('${native}','${legacy}','${foreign}');`;
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
    'members',(select jsonb_agg(to_jsonb(m) order by household_id,user_id) from public.household_members m))`);
}

export function verifyLegacyAttachmentBoundaries(db) {
  const before = snapshot(db),
    cases = [];
  const check = (name, actual, expected) => {
    assert.deepEqual(actual, expected, name);
    cases.push({ name, passed: true });
  };
  check("partner sweep excludes native and foreign receipts", JSON.parse(run(db, 2, sweep)), [
    legacy,
  ]);
  check("uploader sweep includes own native receipt", JSON.parse(run(db, 1, sweep)), [
    native,
    legacy,
  ]);
  check("foreign sweep includes only own receipt", JSON.parse(run(db, 9511, sweep)), [foreign]);
  check("partner explicit native cleanup is refused", run(db, 2, begin(native)), "");
  check("foreign explicit native cleanup is refused", run(db, 9511, begin(native)), "");
  check("native owner explicit cleanup succeeds", run(db, 1, begin(native)), native);
  verifyObjectMutationRefusal(db, check);
  const deleting = `set local request.jwt.claim.sub='${id(1)}';
    do $begin$ begin perform public.begin_household_attachment_cleanup('${native}'); end $begin$;`;
  check("partner cannot retry native deletion", JSON.parse(run(db, 2, sweep, deleting)), [legacy]);
  check(
    "owner cannot finish before object absence",
    run(db, 1, `${finish(native)}; ${state(native)}`, deleting),
    "deleting",
  );
  const absent = `${deleting} delete from storage.objects where bucket_id='household-files' and name='${native}';`;
  check(
    "partner cannot finish absent native receipt",
    run(db, 2, `${finish(native)}; ${state(native)}`, absent),
    "deleting",
  );
  check(
    "owner finishes absent native receipt",
    run(db, 1, `${finish(native)}; ${state(native)}`, absent),
    "deleted",
  );
  const denied = (name, actor, query, expected) => {
    assert.throws(() => run(db, actor, query), expected);
    cases.push({ name, denied: true });
  };
  denied("unaffiliated sweep", 9512, sweep, /Not a household member/);
  denied(
    "foreign reservation",
    2,
    `select public.reserve_household_attachment('${foreign}','image/jpeg')`,
    /Invalid attachment/,
  );
  denied(
    "partner reservation cannot adopt native upload",
    2,
    `select public.reserve_household_attachment('${native}','image/jpeg')`,
    /no longer pending/,
  );
  denied(
    "mismatched content type",
    1,
    `select public.reserve_household_attachment('${path(9503)}','application/pdf')`,
    /Invalid attachment/,
  );
  denied("anonymous cleanup", 1, `set local role anon; ${sweep}`, /permission denied/);
  denied("anonymous finish", 1, `set local role anon; ${finish(native)}`, /permission denied/);
  assert.equal(snapshot(db), before, "Rolled-back boundary probes must preserve original rows");
  return {
    passed: true,
    cases,
    originalRowsUnchanged: true,
    disposableOnly: true,
    storageBytesVerified: false,
  };
}

function verifyObjectMutationRefusal(db, check) {
  for (const actor of [1, 2, 9511]) {
    for (const target of [native, legacy]) {
      check(
        `actor ${actor} cannot rewrite object identity or metadata ${target}`,
        run(
          db,
          actor,
          `with changed as (update storage.objects
          set name='${foreign}',metadata='{"mimetype":"application/pdf","size":1}'::jsonb
          where bucket_id='household-files' and name='${target}' returning id)
          select count(*) from changed`,
        ),
        "0",
      );
    }
  }
}
