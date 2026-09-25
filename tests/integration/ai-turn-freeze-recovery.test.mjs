import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { aiRoutineFiles } from "../database/ai-routine-files.mjs";
import { setFixtureWritesFrozen } from "../../tools/migration/write-barrier-fixture.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const identity = { conversationId: id(900), operationId: id(901) };

test("expired AI turn survives maintenance and finalizes exactly once after resume", async (t) => {
  const f = await postgrestFixture(t, [
    ...aiRoutineFiles,
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260925185000_native_household_write_barrier.sql",
  ]);
  const message = { id: id(901), role: "user", parts: [{ type: "text", text: "Recovery" }] };
  f.db.sql(`set role authenticated; set request.jwt.claims='{"sub":"${id(1)}"}';
    select public.nest_begin_ai_turn('${id(10)}','${id(900)}','${id(901)}',0,
      '${JSON.stringify(message)}'::jsonb)`);
  f.db.sql(`update public.nest_ai_turns set deadline_at=clock_timestamp()-interval '1 second'`);
  const handler = createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" });
  const interrupt = (bearer = f.bearer) =>
    handler(
      new Request("http://localhost/v1/assistant/interrupt", {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify(identity),
      }),
    );
  const snapshot = () => f.db.sql(`select to_jsonb(t) from public.nest_ai_turns t`);
  const before = snapshot();
  setFixtureWritesFrozen(f.db, true);
  assert.equal((await interrupt()).status, 503);
  assert.equal(snapshot(), before);
  assert.equal((await interrupt(f.partnerBearer)).status, 410);
  setFixtureWritesFrozen(f.db, false);
  const response = await interrupt();
  assert.equal(response.status, 200);
  const recovered = await response.json();
  assert.equal(recovered.turn.state, "interrupted");
  const after = snapshot();
  assert.deepEqual(await (await interrupt()).json(), recovered);
  assert.equal(snapshot(), after);
  assert.equal(f.db.sql("select revision from public.nest_ai_conversations"), "2");
});
