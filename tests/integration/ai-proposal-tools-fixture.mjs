import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { files, id, input, json } from "../database/ai-proposal-fixture.mjs";
import { seed } from "../database/meal-planning-context-fixture.mjs";
import { model } from "../api/single-meal-generation-fixture.mjs";
import { draft } from "./meal-proposal-edit-api-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
import { Redacted } from "./meal-proposal-api-fixture.mjs";
export { id, input };
export const options = (toolCallId) => ({ toolCallId, messages: [] });
export async function fixture(t, path = "/rest/v1/rpc/nest_execute_ai_command") {
  const remote = await postgrestFixture(t, [
    ...files,
    "supabase/migrations/20260919214955_native_busy_snapshots.sql",
  ]);
  seed(remote.db);
  remote.db.sql(
    `update public.meal_definitions set nest_servings=2,nest_instructions='Simmer.' where id='${id(200)}'`,
  );
  remote.db.file("tests/integration/food-postgrest.sql");
  const proxy = await lostResponseProxy(t, remote.url, path);
  const provider = model((value, index) => {
    if (index === 1 && value.meals)
      value.meals.forEach((e) => {
        e.choice = { kind: "suggested", recipe: draft };
      });
    return value;
  });
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Plan next week's meals",
  };
  const message = {
    id: turn.operationId,
    role: "user",
    parts: [{ type: "text", text: turn.text }],
  };
  remote.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,${json(message)})`,
  );
  const connect = (settings = {}) =>
    householdTools(
      new Request("http://localhost/", {
        headers: { authorization: `Bearer ${settings.bearer ?? remote.bearer}` },
      }),
      { url: settings.lossy ? proxy.url : remote.url, publishableKey: "sb_publishable_fixture" },
      { householdId: id(10), turn },
      settings.missingCredentials
        ? {}
        : { model: provider.instance, planningSecret: Redacted.make(remote.serverKey) },
    ).tools;
  return { remote, proxy, provider, turn, connect };
}
