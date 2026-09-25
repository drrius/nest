import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { setupTools } from "../../apps/api/src/setup/tools.ts";

for (const [name, screen] of [
  ["openNotificationSetup", "notification-preferences"],
  ["openAccountSettings", "settings"],
])
  test(`${name} reauthorizes and makes no writes`, async (t) => {
    const user = "00000000-0000-4000-8000-000000000001";
    const home = "00000000-0000-4000-8000-000000000010";
    let revoked = false;
    const calls = [];
    const server = createServer((request, response) => {
      calls.push({ method: request.method, path: request.url });
      response.setHeader("content-type", "application/json");
      if (request.url === "/auth/v1/user") return response.end(JSON.stringify({ id: user }));
      if (request.url.startsWith("/rest/v1/household_members"))
        return response.end(
          JSON.stringify(
            revoked ? [] : [{ user_id: user, household_id: home, display_name: "Fixture" }],
          ),
        );
      response.writeHead(500).end("Unexpected upstream operation");
    });
    t.after(() => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const config = {
      url: `http://127.0.0.1:${server.address().port}`,
      publishableKey: "sb_publishable_fixture",
    };
    const request = new Request("http://nest.invalid", {
      headers: { authorization: "Bearer fixture", "x-nest-household": home },
    });
    const tool = setupTools(request, config)[name];
    const options = { toolCallId: "handoff", messages: [] };
    assert.deepEqual(await tool.execute({}, options), {
      ok: true,
      value: { kind: "device_handoff", screen },
    });
    revoked = true;
    assert.deepEqual(await tool.execute({}, options), { ok: false, code: "forbidden" });
    assert.equal(calls.length, 4);
    assert.ok(calls.every(({ method }) => method === "GET"));
    const before = calls.length;
    assert.deepEqual(
      await setupTools(new Request("http://nest.invalid"), config).openNotificationSetup.execute(
        {},
        options,
      ),
      { ok: false, code: "forbidden" },
    );
    assert.equal(calls.length, before);
  });
