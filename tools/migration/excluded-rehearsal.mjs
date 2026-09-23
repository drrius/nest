import assert from "node:assert/strict";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tables = [
  "household_projects",
  "household_contacts",
  "household_assets",
  "trip_bookings",
  "household_documents",
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
    values('${id(1305)}','${id(10)}','${id(1)}','Retained document','${id(10)}/documents/${id(1306)}.pdf','${id(1301)}','${id(1304)}');`);
}
export function captureExcludedHistory(db) {
  // One MVCC snapshot; output contains only counts and full-row fingerprints.
  return db.sql(
    `select jsonb_build_object(${tables
      .map(
        (table) =>
          `'${table}',(select jsonb_build_object('count',count(*),'rows',jsonb_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') order by id)) from public.${table} r)`,
      )
      .join(",")})`,
  );
}
export function verifyExcludedRehearsal(db, before) {
  assert.equal(captureExcludedHistory(db), before, "Excluded legacy records changed");
  return {
    passed: true,
    retainedProjects: 2,
    retainedContacts: 1,
    retainedAssets: 1,
    retainedBookings: 1,
    retainedDocumentReferences: 1,
    storageBytesVerified: false,
  };
}
