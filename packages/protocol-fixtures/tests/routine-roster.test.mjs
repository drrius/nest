import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { routineClient } from "../src/routines/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const credentials = Effect.succeed({
  access_token: "fixture",
  refresh_token: "fixture",
  user: { id: id(1) },
});
const client = routineClient("http://localhost/", { actor: id(1), household: id(10) }, credentials);
const roster = {
  version: 1,
  householdId: id(10),
  members: [
    { actorId: id(1), displayName: "A" },
    { actorId: id(2), displayName: "B" },
  ],
};
const run = (value) =>
  Effect.runPromise(
    client.roster().pipe(
      Effect.provideService(FetchHttpClient.Fetch, async (url, init) => {
        assert.equal(new URL(url).pathname, "/v1/routines/roster");
        assert.equal(new Headers(init.headers).get("x-nest-household"), id(10));
        return Response.json(value);
      }),
    ),
  );
test("roster-only reads reject foreign households, missing actor, duplicate members and excess rows", async () => {
  assert.deepEqual(await run(roster), roster);
  for (const patch of [
    { householdId: id(20) },
    { members: [roster.members[1]] },
    { members: [roster.members[0], roster.members[0]] },
  ])
    await assert.rejects(run({ ...roster, ...patch }), { code: "forbidden" });
  for (const patch of [
    { members: [] },
    { members: [...roster.members, { actorId: id(3), displayName: "C" }] },
    { routines: [] },
  ])
    await assert.rejects(run({ ...roster, ...patch }), { code: "unavailable" });
});
