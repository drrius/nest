import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as base, as, id } from "./expense-receipt-fixture.mjs";
import { payload, save } from "./native-expense-helpers.mjs";
function fixture(t) {
  const f = base(t);
  f.db.file("supabase/migrations/20260921170517_native_receipt_read.sql");
  return f;
}
/** @param {string | null} [event] @param {string | null} [path] */
const read = (event = null, path = null) =>
  `select public.nest_read_receipt('${id(10)}',${event ? `'${event}'` : "null"},${path ? `'${path}'` : "null"})`;
test("receipt metadata is bound to its financial entry and pending previews remain uploader-only", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.seed(path);
  const expected = {
    version: 1,
    householdId: id(10),
    target: { receiptPath: path },
    receipt: { path, contentType: "image/jpeg", bytes: "128" },
  };
  assert.deepEqual(f.read(read(null, path)), expected);
  assert.throws(() => f.db.sql(as(read(null, path), id(2))), /Not authorized/);
  const event = f.read(save(200, payload({ receiptPath: path }))).eventId;
  for (const actor of [id(1), id(2)])
    assert.deepEqual(JSON.parse(f.db.sql(as(read(event), actor))), {
      ...expected,
      target: { eventId: event },
    });
  assert.deepEqual(JSON.parse(f.db.sql(as(read(null, path), id(2)))), expected);
  for (const target of [read(event), read(null, path)]) {
    assert.throws(() => f.db.sql(as(target, id(3))), /Not authorized/);
    assert.throws(() => f.db.sql(`set role anon; ${target}`), /permission denied/);
  }
});
test("missing attachment differs from missing or inaccessible bytes, and malformed size becomes unknown", (t) => {
  const f = fixture(t),
    event = f.read(save(200)).eventId;
  assert.deepEqual(f.read(read(event)), {
    version: 1,
    householdId: id(10),
    target: { eventId: event },
    receipt: null,
  });
  assert.throws(() => f.read(read(id(999))), /Entry unavailable/);
  const path = f.path(100);
  f.seed(path);
  for (const size of ["-1", "1.5", "NaN", "9007199254740992"]) {
    f.db.sql(`update storage.objects set metadata=jsonb_set(metadata,'{size}','"${size}"')`);
    assert.equal(f.read(read(null, path)).receipt.bytes, null);
  }
  assert.throws(() => f.read(read(event, path)), /one receipt/);
  assert.throws(() => f.read(read()), /one receipt/);
  assert.throws(
    () => f.read(read(null, path.replace("/receipts/", "/documents/"))),
    /Receipt unavailable/,
  );
  f.db.sql(as(f.cleanup(path)));
  assert.throws(() => f.read(read(null, path)), /Receipt unavailable/);
});
