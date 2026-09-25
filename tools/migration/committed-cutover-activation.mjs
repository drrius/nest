import assert from "node:assert/strict";
import { legacyApiFenceSql } from "./legacy-api-fence.mjs";
import { pauseLegacyJobsSql, assertLegacyJobsPausedSql } from "./legacy-job-pause-rehearsal.mjs";

// Caller-owned disposable cluster only. This is not a hosted activation entry point.
export function activateCutoverFixture(db) {
  const previous = db.sql("select offline_epoch from private.nest_household_write_control");
  db.sql(`begin;
    select private.nest_set_recurring_execution_paused(true);
    ${pauseLegacyJobsSql()}
    ${assertLegacyJobsPausedSql()}
    select private.nest_set_household_writes_frozen(true);
    ${legacyApiFenceSql()}
    select private.nest_rotate_offline_epoch();
    select private.nest_set_household_writes_frozen(false);
    commit;`);
  const state = JSON.parse(
    db.sql(`select jsonb_build_object(
    'epoch',offline_epoch,'required',offline_epoch_required,'frozen',frozen)
    from private.nest_household_write_control`),
  );
  assert.notEqual(state.epoch, previous);
  assert.equal(state.required, true);
  assert.equal(state.frozen, false);
  return state.epoch;
}
