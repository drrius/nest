import { createServer, connect } from "node:http2";
import { generateKeyPairSync } from "node:crypto";
import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { apnsDeliveryFixture } from "../database/apns-delivery-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { pushWorkerRpc } from "../../apps/api/src/push/worker-rpc.ts";
import { apnsPushTransport } from "../../apps/api/src/push/apns-transport.ts";
import { ApnsHttp2Client } from "../../apps/api/src/push/apns-request.ts";
export async function apnsWorkerFixture(t, respond) {
  const f = apnsDeliveryFixture(t, true);
  f.db.file("tests/integration/food-postgrest.sql");
  const http = await postgrestFixture(t, [], f.db);
  const rpc = pushWorkerRpc(
    { url: http.url, publishableKey: "sb_publishable_fixture" },
    Redacted.make(http.serverKey),
  );
  const server = createServer(),
    calls = [];
  server.on("stream", (stream, headers) => {
    stream.on("error", () => {});
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      calls.push({ headers, body: JSON.parse(Buffer.concat(chunks)) });
      respond(stream, headers);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const client = new ApnsHttp2Client(() => connect(`http://127.0.0.1:${server.address().port}`));
  const provider = apnsPushTransport(
    {
      keyId: "TESTKEY001",
      teamId: "TESTTEAM01",
      privateKey: Redacted.make(privateKey.export({ type: "pkcs8", format: "pem" })),
    },
    "sandbox",
    client,
  );
  t.after(async () => {
    provider.close();
    await new Promise((resolve) => server.close(resolve));
  });
  return { ...f, http, rpc, provider, calls };
}
