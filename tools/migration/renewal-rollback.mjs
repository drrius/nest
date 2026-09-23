import assert from "node:assert/strict";
export function verifyRenewalRollback(db, run, input) {
  db.sql(`create function private.rehearsal_reject_conversion() returns trigger
    language plpgsql as $$ begin raise exception 'Injected provenance failure'; end; $$;
    create trigger rehearsal_reject_conversion before insert on private.nest_renewal_conversions
      for each row execute function private.rehearsal_reject_conversion();`);
  try {
    assert.throws(() => run(input), /Injected provenance failure/);
    for (const table of [
      "public.nest_renewals",
      "private.nest_renewal_operations",
      "private.nest_renewal_conversions",
    ])
      assert.equal(
        db.sql(`select count(*) from ${table}`),
        "0",
        `Failed conversion left rows in ${table}`,
      );
  } finally {
    db.sql(`drop trigger rehearsal_reject_conversion on private.nest_renewal_conversions;
      drop function private.rehearsal_reject_conversion();`);
  }
}
