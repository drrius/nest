import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";

async function listen(t, handler) {
  const server = nodeServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

test("the runnable HTTP adapter preserves route, method and unauthenticated gates", async (t) => {
  const url = await listen(
    t,
    createHandler({ url: "https://fixture.example", publishableKey: "sb_publishable_fixture" }),
  );
  assert.equal((await fetch(`${url}/v1/chores`)).status, 401);
  assert.equal((await fetch(`${url}/v1/chores`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${url}/missing`)).status, 404);
});

test("the runnable HTTP adapter forwards command bytes and non-cacheable responses", async (t) => {
  const url = await listen(t, async (request) =>
    Response.json(
      { body: await request.json(), actor: request.headers.get("authorization") },
      { headers: { "Cache-Control": "no-store" } },
    ),
  );
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer fixture", "content-type": "application/json" },
    body: JSON.stringify({ operation: "fixture" }),
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    body: { operation: "fixture" },
    actor: "Bearer fixture",
  });
});

test("rejecting a partially uploaded body preserves the response without waiting for upload completion", async (t) => {
  const { request: httpRequest } = await import("node:http");
  const url = await listen(t, async (request) => {
    const reader = request.body.getReader();
    await reader.read();
    await reader.cancel();
    assert.equal(request.signal.aborted, false);
    return new Response("rejected", { status: 400 });
  });
  await new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: "POST" }, (response) => {
      assert.equal(response.statusCode, 400);
      response.resume();
      response.once("end", () => {
        request.destroy();
        resolve();
      });
    });
    request.on("error", reject);
    request.setTimeout(2000, () => {
      request.destroy();
      reject(new Error("Waited for unfinished upload"));
    });
    request.write("first chunk");
  });
});
