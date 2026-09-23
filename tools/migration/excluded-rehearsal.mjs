import assert from "node:assert/strict";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tables = [
  "household_projects",
  "household_contacts",
  "household_assets",
  "trip_bookings",
  "household_documents",
  "project_tasks",
  "household_decisions",
  "decision_options",
  "asset_maintenance",
  "asset_routines",
];
export function seedExcludedRehearsal(db) {
  db.sql(`set request.jwt.claim.sub='${id(1)}';
    select public.reserve_household_attachment('${id(10)}/documents/${id(1306)}.pdf','application/pdf');
    insert into storage.objects(bucket_id,name,metadata)
      values('household-files','${id(10)}/documents/${id(1306)}.pdf','{"mimetype":"application/pdf","size":128}');
    insert into public.household_projects(id,household_id,created_by,kind,title)
    values('${id(1300)}','${id(10)}','${id(1)}','project','Retained project'),
      ('${id(1301)}','${id(10)}','${id(1)}','trip','Retained trip');
    insert into public.household_contacts(id,household_id,created_by,name)
    values('${id(1302)}','${id(10)}','${id(1)}','Retained contact');
    insert into public.household_assets(id,household_id,created_by,title,contact_id)
    values('${id(1303)}','${id(10)}','${id(1)}','Retained asset','${id(1302)}');
    insert into public.trip_bookings(id,household_id,created_by,project_id,kind,title)
    values('${id(1304)}','${id(10)}','${id(1)}','${id(1301)}','stay','Retained booking');
    insert into public.household_documents(id,household_id,created_by,title,file_path,project_id,booking_id)
    values('${id(1305)}','${id(10)}','${id(1)}','Retained document','${id(10)}/documents/${id(1306)}.pdf','${id(1301)}','${id(1304)}');
    insert into public.project_tasks(id,household_id,created_by,project_id,title,assigned_member_id)
      values('${id(1310)}','${id(10)}','${id(1)}','${id(1300)}','Retained task','${id(2)}');
    insert into public.household_decisions(id,household_id,created_by,title,project_id)
      values('${id(1311)}','${id(10)}','${id(1)}','Retained decision','${id(1300)}');
    insert into public.decision_options(id,household_id,created_by,decision_id,title,chosen)
      values('${id(1312)}','${id(10)}','${id(1)}','${id(1311)}','Retained choice',true);
    insert into public.asset_maintenance(id,household_id,created_by,asset_id,title,performed_on,routine_id)
      values('${id(1313)}','${id(10)}','${id(1)}','${id(1303)}','Retained maintenance','2026-09-21','${id(1201)}');
    insert into public.asset_routines(id,household_id,created_by,asset_id,routine_id)
      values('${id(1314)}','${id(10)}','${id(1)}','${id(1303)}','${id(1201)}');`);
}
export function captureExcludedHistory(db) {
  // One MVCC snapshot; output contains only counts and full-row fingerprints.
  return db.sql(
    `select jsonb_build_object(${tables
      .map(
        (table) =>
          `'${table}',(select jsonb_build_object('count',count(*),'rows',jsonb_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') order by id)) from public.${table} r)`,
      )
      .join(",")}, 'documentStorage', (select jsonb_agg(jsonb_build_object(
      'id',d.id,'digest',encode(sha256(convert_to(jsonb_build_object(
        'upload',to_jsonb(u),'object',to_jsonb(o),'bucket',to_jsonb(b))::text,'UTF8')),'hex'),
      'valid',coalesce(u.household_id=d.household_id and u.state='claimed'
        and o.id is not null and b.public=false and u.content_type=o.metadata->>'mimetype',false)
      ) order by d.id) from public.household_documents d
      left join public.household_attachment_uploads u on u.path=d.file_path
      left join storage.objects o on o.bucket_id='household-files' and o.name=d.file_path
      left join storage.buckets b on b.id=o.bucket_id))`,
  );
}
export function verifyExcludedRehearsal(db, before) {
  const after = captureExcludedHistory(db);
  assert.equal(after, before, "Excluded legacy records changed");
  assert.ok(JSON.parse(before).documentStorage.every((row) => row.valid));
  assert.ok(JSON.parse(after).documentStorage.every((row) => row.valid));
  verifyMissingDocumentObject(db, after);
  return {
    passed: true,
    retainedProjects: 2,
    retainedContacts: 1,
    retainedAssets: 1,
    retainedBookings: 1,
    retainedDocumentReferences: 1,
    retainedTasks: 1,
    retainedDecisions: 1,
    retainedOptions: 1,
    retainedMaintenance: 1,
    retainedAssetRoutineLinks: 1,
    storageBytesVerified: false,
  };
}

function verifyMissingDocumentObject(db, baseline) {
  const damaged = captureExcludedHistory({
    sql: (query) =>
      db.sql(`begin;
    delete from storage.objects where bucket_id='household-files'
      and name='${id(10)}/documents/${id(1306)}.pdf';
    ${query}; rollback;`),
  });
  assert.notEqual(damaged, baseline);
  assert.equal(JSON.parse(damaged).documentStorage[0].valid, false);
  assert.equal(captureExcludedHistory(db), baseline, "Corruption probe must roll back");
}
