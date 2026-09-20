import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { discoverConversations } from "../../apps/api/src/assistant/discovery.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = {
  conversationId: id(100),
  actorId: id(1),
  householdId: id(10),
  revision: "1",
  createdAt: "2026-09-20T01:00:00.123456+00:00",
  updatedAt: "2026-09-20T01:00:00.123456+00:00",
};
function read(rows, range, cursor) {
  return Effect.runPromise(
    discoverConversations(
      new Request(
        `https://nest.invalid/v1/assistant/conversations${cursor ? `?cursor=${cursor}` : ""}`,
      ),
      { url: "https://fixture.invalid", publishableKey: "sb_publishable_fixture" },
      { token: "fixture", member: { userId: id(1), householdId: id(10), displayName: "Member" } },
    ).pipe(
      Effect.provideService(
        FetchHttpClient.Fetch,
        async () =>
          new Response(JSON.stringify(rows), {
            headers: {
              "content-type": "application/json",
              ...(range ? { "content-range": range } : {}),
            },
          }),
      ),
    ),
  );
}

test("discovery rejects truncated, duplicate, unscoped or malformed upstream pages", async () => {
  for (const [rows, range] of [
    [[row], undefined],
    [[row], "0-0/22"],
    [[], "*/20"],
    [[row, row], "0-1/2"],
    [[{ ...row, actorId: id(2) }], "0-0/1"],
    [[{ ...row, householdId: id(20) }], "0-0/1"],
    [[{ ...row, createdAt: "now()),actor_id.eq.other" }], "0-0/1"],
    [[{ ...row, revision: Number.MAX_SAFE_INTEGER + 1 }], "0-0/1"],
  ])
    await assert.rejects(read(rows, range), { code: "unavailable" });
});

test("cursor lookup rejects a different own conversation returned by the upstream", async () => {
  await assert.rejects(read([row], "0-0/1", id(101)), { code: "unavailable" });
});
