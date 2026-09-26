import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { requestJson } from "../../apps/api/src/supabase-request.ts";
import { failureResponse } from "../../apps/api/src/errors.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));

test("RPC execution suspension is unavailable while domain and malformed denials stay forbidden", async (t) => {
  let body;
  let status = 403;
  const server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const config = { url: `http://127.0.0.1:${server.address().port}`, publishableKey: "fixture" };
  for (const [value, expected] of [
    [
      { code: "42501", message: "permission denied for function nest_complete_chore" },
      "unavailable",
    ],
    [{ code: "42501", message: "not_found" }, "forbidden"],
    [{ code: "42501", message: "permission denied for table household_members" }, "forbidden"],
    [{ code: "P0001", message: "permission denied for function nest_complete_chore" }, "forbidden"],
    [{ code: "42501" }, "forbidden"],
    ["not json", "forbidden"],
  ]) {
    body = value;
    await assert.rejects(
      Effect.runPromise(requestJson(config, "fixture", "rest/v1/rpc/test")),
      (error) => {
        assert.equal(error.code, expected);
        assert.equal("message" in error && error.message.includes("permission denied"), false);
        return true;
      },
    );
  }
  status = 409;
  for (const [httpStatus, code, expected] of [
    [409, "PT409", "cutover"],
    [409, "40001", "conflict"],
    [412, "PT412", "conflict"],
  ]) {
    status = httpStatus;
    body = { code, message: "Internal fixture information must not escape" };
    const result = await Effect.runPromise(
      requestJson(config, "fixture", "rest/v1/rpc/test").pipe(Effect.result),
    );
    assert.equal(result._tag, "Failure");
    assert.equal(result.failure.code, expected);
    const response = failureResponse(result.failure);
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: { code: expected } });
  }
});
