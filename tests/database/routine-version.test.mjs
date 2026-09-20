import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalRoutineVersion } from "../../apps/api/src/routines/rows.ts";
import { startFixturePostgres } from "./fixture-postgres.mjs";

test("routine edit versions agree with PostgreSQL across six offsets and 600 microsecond timestamps", () => {
  const db = startFixturePostgres();
  try {
    for (const zone of [
      "UTC",
      "Europe/Zurich",
      "Asia/Kathmandu",
      "Pacific/Chatham",
      "America/St_Johns",
      "Pacific/Pago_Pago",
    ]) {
      const rows = JSON.parse(
        db.sql(`set timezone='${zone}';
        select jsonb_agg(jsonb_build_object('raw',stamp,'expected',
          to_char(timezone('UTC',stamp),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
        from (select timestamptz '1999-12-31T23:59:59Z'
          + i * interval '137 days' + ((i*997)%1000000) * interval '1 microsecond' as stamp
          from generate_series(0,99) i) generated`),
      );
      for (const row of rows)
        assert.equal(canonicalRoutineVersion(row.raw), row.expected, `${zone}: ${row.raw}`);
    }
  } finally {
    db.stop();
  }
});
