import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, editInput, editOutcome } from "./meal-proposal-edit-fixture.mjs";
for (const status of ["pending", "applied", "failed"]) {
  test(`edit snapshot returns exact ${status} owner result without writes`, (t) => {
    const f = fixture(t),
      p = f.ready();
    f.db.file("supabase/migrations/20260925195418_native_meal_edit_snapshot.sql");
    const initial = f.beginEdit(id(880), editInput(p));
    let expected = initial;
    if (status !== "pending") {
      f.claimEdit(id(880));
      expected = f.finishEdit(
        id(880),
        status === "failed" ? editOutcome(null, { failure: "unavailable" }) : editOutcome(),
      );
    } else {
      f.db.sql(
        "update private.nest_meal_proposal_edits set deadline_at=clock_timestamp()-interval '1 second'",
      );
    }
    const read = (actor = id(1), home = id(10)) =>
      JSON.parse(
        f.db.sql(
          `begin read only; ${as(`select public.nest_read_proposal_edit_snapshot('${home}','${id(880)}')`, actor)}; rollback;`,
        ),
      );
    const result = read();
    assert.equal(result.status, status);
    assert.deepEqual(result.command, expected.command);
    assert.deepEqual(result.receipt, expected.receipt);
    if (status !== "pending") assert.deepEqual(result, expected);
    for (const [actor, home] of [
      [id(2), id(10)],
      [id(3), id(10)],
      [id(1), id(20)],
    ])
      assert.throws(() => read(actor, home), /changed|authorized/);
    for (const role of ["anon", "service_role"])
      assert.throws(
        () =>
          f.db.sql(
            `set role ${role};select public.nest_read_proposal_edit_snapshot('${id(10)}','${id(880)}')`,
          ),
        /permission denied/,
      );
    assert.equal(f.db.sql("select status from private.nest_meal_proposal_edits"), status);
    for (const secret of ["worker_id", "selected_source", "finish_hash", "stateHash"])
      assert.equal(JSON.stringify(result).includes(secret), false);
    f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
    assert.throws(() => read(), /authorized/);
  });
}
