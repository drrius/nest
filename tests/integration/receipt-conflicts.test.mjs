import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id } from "../database/expense-receipt-fixture.mjs";
async function rpc(f, name, input, finish) {
  const response = await fetch(`${f.url}/rest/v1/rpc/nest_${name}_receipt_upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_input: input,
      ...(finish === undefined ? {} : { p_finish: finish }),
    }),
  });
  return { status: response.status, body: await response.json() };
}
function state(f) {
  return f.db.sql(`select jsonb_build_object(
    'intents',(select jsonb_agg(to_jsonb(i) order by upload_id) from private.nest_receipt_upload_intents i),
    'uploads',(select jsonb_agg(to_jsonb(u) order by path) from public.household_attachment_uploads u),
    'objects',(select jsonb_agg(to_jsonb(o) order by id) from storage.objects o),
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e))`);
}
test("receipt identity conflicts and unfinished cleanup preserve upload, Storage metadata and financial state", async (t) => {
  const f = await postgrestFixture(t, [
    ...files,
    "supabase/migrations/20260921173626_native_receipt_upload_identity.sql",
    "supabase/migrations/20260921182441_native_receipt_cleanup.sql",
    "supabase/migrations/20260926102946_native_receipt_nonretryable_conflicts.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  const input = {
    uploadId: id(100),
    sha256: "a".repeat(64),
    bytes: 128,
    contentType: "image/jpeg",
  };
  const reserved = await rpc(f, "reserve", input);
  assert.equal(reserved.status, 200);
  assert.deepEqual(await rpc(f, "reserve", input), reserved);
  f.db.sql(`insert into storage.objects(bucket_id,name,metadata)
    values('household-files','${reserved.body.path}','{"mimetype":"image/jpeg","size":128}')`);
  const before = state(f);
  for (const name of ["reserve", "cleanup"]) {
    const result = await rpc(
      f,
      name,
      { ...input, sha256: "b".repeat(64) },
      name === "cleanup" ? false : undefined,
    );
    assert.equal(result.status, 412, JSON.stringify(result));
    assert.equal(result.body.code, "PT412");
    assert.equal(state(f), before);
  }
  const deleting = await rpc(f, "cleanup", input, false);
  assert.equal(deleting.status, 200);
  assert.equal(deleting.body.status, "deleting");
  const pending = state(f);
  const incomplete = await rpc(f, "cleanup", input, true);
  assert.equal(incomplete.status, 412, JSON.stringify(incomplete));
  assert.equal(incomplete.body.code, "PT412");
  assert.equal(state(f), pending);
  assert.deepEqual(await rpc(f, "cleanup", input, false), deleting);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
