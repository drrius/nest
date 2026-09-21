import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { cleanupReceipt } from "../../apps/api/src/money/receipt-cleanup.ts";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const config = { url: "https://fixture.supabase.co/", publishableKey: "sb_publishable_fixture" };
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "A" },
  token: "caller-token",
};
const input = { uploadId: id(100), sha256: "a".repeat(64), bytes: 128, contentType: "image/jpeg" };
const result = (status) => ({
  version: 1,
  householdId: id(10),
  uploadId: id(100),
  path: `${id(10)}/receipts/${id(100)}.jpg`,
  status,
});
const run = (value, fetcher) =>
  Effect.runPromise(
    cleanupReceipt(config, caller, value).pipe(Effect.provideService(Fetch.Fetch, fetcher)),
  );
test("cleanup deletes only the exact authorized object using caller credentials and verifies absence", async () => {
  const calls = [];
  const deleted = await run(input, async (url, init) => {
    calls.push(String(url));
    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), "Bearer caller-token");
    assert.equal(headers.get("apikey"), config.publishableKey);
    assert.equal(init.redirect, "error");
    const body = JSON.parse(init.body);
    if (init.method === "DELETE") {
      assert.equal(String(url), `${config.url}storage/v1/object/household-files`);
      assert.deepEqual(body, { prefixes: [result("deleting").path] });
      return Response.json([]);
    }
    assert.deepEqual(body, { p_household: id(10), p_input: input, p_finish: calls.length === 3 });
    return Response.json(result(calls.length === 1 ? "deleting" : "deleted"));
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(deleted, result("deleted"));
});
test("lost deletion acknowledgments reconcile; object-present or revoked finish never claims success", async () => {
  for (const finish of [
    Response.json(result("deleted")),
    Response.json({ code: "40001" }, { status: 400 }),
    Response.json({}, { status: 403 }),
  ]) {
    let calls = 0;
    const pending = run(input, async (_url, init) => {
      calls++;
      if (init.method === "DELETE") throw new Error("lost response");
      return calls === 1 ? Response.json(result("deleting")) : finish;
    });
    if (finish.status === 200) assert.equal((await pending).status, "deleted");
    else await assert.rejects(pending, { code: finish.status === 403 ? "forbidden" : "conflict" });
    assert.equal(calls, 3);
  }
});
test("claimed/deleted receipts skip Storage and substituted identities or extra input never authorize deletion", async () => {
  for (const status of ["claimed", "deleted"]) {
    let calls = 0;
    assert.equal(
      (
        await run(input, async () => {
          calls++;
          return Response.json(result(status));
        })
      ).status,
      status,
    );
    assert.equal(calls, 1);
  }
  for (const patch of [
    { householdId: id(20) },
    { uploadId: id(101) },
    { path: result("deleting").path.replace(".jpg", ".pdf") },
    { extra: true },
  ]) {
    let calls = 0;
    await assert.rejects(
      run(input, async () => {
        calls++;
        return Response.json({ ...result("deleting"), ...patch });
      }),
      { code: "unavailable" },
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(
    run({ ...input, path: result("deleting").path }, async () => {
      calls++;
      return Response.json({});
    }),
    { code: "invalid_request" },
  );
  assert.equal(calls, 0);
});
