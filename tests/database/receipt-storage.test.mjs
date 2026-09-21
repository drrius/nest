import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fixture, as, correct, replacement } from "./receipt-storage-fixture.mjs";
test("audited legacy attachment statements retain their pinned provenance", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("./legacy-money/provenance.json", import.meta.url)),
  );
  const entry = manifest.files.find((f) => f.file === "receipt-attachments.sql");
  assert.equal(
    createHash("sha256")
      .update(readFileSync(new URL("./legacy-money/receipt-attachments.sql", import.meta.url)))
      .digest("hex"),
    entry.sha256,
  );
});
test("private receipt reservation and metadata access are household scoped and cannot bypass inspected upload", (t) => {
  const f = fixture(t),
    path = f.path(100);
  assert.equal(f.db.sql(as(1, f.reserve(path))), "f");
  assert.throws(() => f.db.sql(as(2, f.reserve(path))), /no longer pending/);
  assert.throws(() => f.db.sql(as(3, f.reserve(path))), /Invalid attachment/);
  assert.throws(() => f.db.sql(as(1, f.upload(path))), /row-level security/);
  assert.throws(() => f.db.sql(f.upload(path, "application/pdf")), /no longer pending/);
  f.db.sql(f.upload(path));
  assert.equal(f.db.sql(as(1, f.reserve(path))), "t");
  for (const actor of [1, 2])
    assert.equal(f.db.sql(as(actor, "select count(*) from storage.objects")), "1");
  assert.equal(f.db.sql(as(3, "select count(*) from storage.objects")), "0");
  assert.equal(f.db.sql("set role anon; select count(*) from storage.objects"), "0");
  assert.throws(() => f.db.sql(`set role anon; ${f.reserve(path)}`), /permission denied/);
  f.db.sql(as(2, "update storage.objects set name='changed'; delete from storage.objects"));
  assert.equal(f.db.sql("select count(*) from storage.objects"), "1");
});
test("receipt claims survive reversal and replacement and reject unuploaded or foreign paths atomically", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.seed(path);
  const event = f.record(f.save(path, "receipt-expense")).financial_event_id;
  assert.equal(f.state(path), "claimed");
  const next = { ...replacement(200, 100), receipt_path: path };
  const result = f.record(correct(event, "replace", next));
  assert.ok(result);
  assert.equal(
    f.db.sql(`select count(*) from public.financial_events where receipt_path='${path}'`),
    "2",
  );
  assert.equal(f.db.sql(as(1, f.cleanup(path))), "");
  f.db.sql(as(1, "delete from storage.objects"));
  assert.equal(f.db.sql("select count(*) from storage.objects"), "1");
  for (const target of [f.path(999), f.path(999, 20)])
    assert.throws(() => f.record(f.save(target, target)), /unavailable/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
});
test("cleanup tombstones prevent delayed privileged uploads and interrupted deletion can finish", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.seed(path);
  assert.equal(f.db.sql(as(2, f.cleanup(path))), "");
  assert.equal(f.db.sql(as(1, f.cleanup(path))), path);
  f.db.sql(as(1, f.finish(path)));
  assert.equal(f.state(path), "deleting");
  f.db.sql(as(1, "delete from storage.objects"));
  f.db.sql(as(1, f.finish(path)));
  assert.equal(f.state(path), "deleted");
  assert.throws(() => f.db.sql(f.upload(path)), /no longer pending/);
  assert.throws(() => f.db.sql(as(1, f.reserve(path))), /no longer pending/);
  assert.throws(() => f.record(f.save(path, "late-save")), /unavailable/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("competing claim and cleanup never leave a posted expense with a deletable receipt", async (t) => {
  const f = fixture(t);
  for (let n = 0; n < 12; n++) {
    const path = f.path(200 + n);
    f.seed(path);
    const results = await Promise.allSettled([
      f.db.concurrent(as(1, f.save(path, `race-${n}`))),
      f.db.concurrent(as(1, f.cleanup(path))),
    ]);
    assert.equal(results[1].status, "fulfilled");
    if (results[0].status === "fulfilled") {
      assert.equal(f.state(path), "claimed");
      assert.equal(results[1].value.stdout.trim(), "");
    } else {
      assert.match(results[0].reason.stderr, /unavailable/);
      assert.equal(f.state(path), "deleting");
    }
  }
});
