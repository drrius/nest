import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("actual API syncs each member's colour, refuses a partner's colour and stale saves", async (t) => {
  const remote = await postgrestFixture(t, [
    "tests/database/conversation-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20261010131500_native_member_colours.sql",
  ]);
  const handler = createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" });
  const request = (path, input, bearer = remote.bearer) =>
    handler(
      new Request(`http://localhost/v1/${path}`, {
        method: input ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "x-nest-household": id(10),
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
      }),
    );
  const read = async (bearer) =>
    (await (await request("member-colours", null, bearer)).json()).colours;
  const save = (operation, expectedRevision, colour, bearer) =>
    request(
      "member-colours/save",
      { operationId: id(operation), expectedRevision, colour },
      bearer,
    );
  assert.deepEqual(await read(), []);
  const saved = await save(100, "0", "plum");
  assert.equal(saved.status, 200);
  const receipt = (await saved.json()).receipt;
  assert.deepEqual(receipt, {
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    revision: "1",
    colour: "plum",
  });
  assert.deepEqual((await (await save(100, "0", "plum")).json()).receipt, receipt);
  assert.deepEqual(await read(remote.partnerBearer), [
    { actorId: id(1), colour: "plum", revision: "1" },
  ]);
  assert.equal((await save(200, "0", "plum", remote.partnerBearer)).status, 409);
  assert.equal((await save(201, "0", "teal", remote.partnerBearer)).status, 200);
  assert.equal((await save(101, "0", "rose")).status, 409, "stale revision");
  assert.equal((await save(102, "1", "green")).status, 400);
  assert.equal((await request("member-colours", null, remote.otherBearer)).status, 403);
  assert.deepEqual(await read(), [
    { actorId: id(1), colour: "plum", revision: "1" },
    { actorId: id(2), colour: "teal", revision: "1" },
  ]);
  assert.equal(remote.db.sql("select count(*) from public.nest_member_colour_receipts"), "2");
});
