import assert from "node:assert/strict";
import { test } from "node:test";
import { DefaultChatTransport, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createHandler } from "../../../../apps/api/src/handler.ts";
import { householdTools } from "../../../../apps/api/src/assistant/tools.ts";
import { validateHistory } from "../../src/chat.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { usage } from "../fixtures.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [
  "tests/database/busy-fixture.sql",
  "tests/integration/food-postgrest.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "supabase/migrations/20260919214955_native_busy_snapshots.sql",
];
const call = (toolName, input, toolCallId = "memory-proposal") => ({
  type: "tool-call",
  toolCallId,
  toolName,
  input: JSON.stringify(input),
});
function modelFor(steps) {
  let count = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const calls = steps[count++];
      const chunks = calls
        ? [
            ...calls,
            { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
          ]
        : [
            { type: "text-start", id: "answer" },
            { type: "text-delta", id: "answer", delta: "Done." },
            { type: "text-end", id: "answer" },
            { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
          ];
      return { stream: simulateReadableStream({ initialDelayInMs: 0, chunkDelayInMs: 0, chunks }) };
    },
  });
}
async function run(f, model, actor = id(1), overrides = {}) {
  const handler = createHandler(
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { model },
  );
  const command = {
    conversationId: id(700),
    operationId: id(701),
    expectedRevision: "0",
    text: "Check calendar availability",
    ...overrides,
  };
  const headers = {
    authorization: `Bearer ${actor === id(1) ? f.bearer : f.partnerBearer}`,
    "content-type": "application/json",
    "x-nest-household": id(10),
  };
  const transport = new DefaultChatTransport({
    api: "http://localhost/v1/assistant/turn",
    fetch: () =>
      handler(
        new Request("http://localhost/v1/assistant/turn", {
          method: "POST",
          headers,
          body: JSON.stringify(command),
        }),
      ),
  });
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: command.conversationId,
    messages: [],
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const history = JSON.parse(
    f.db.sql(
      `select transcript from public.nest_ai_conversations where id='${command.conversationId}'`,
    ),
  );
  const request = new Request("http://localhost/v1/memories", { headers });
  const { tools } = householdTools(
    request,
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    {
      householdId: id(10),
      turn: command,
    },
  );
  await validateHistory(history, tools);
  return { chunks, history };
}
const part = (history, tool) => history.at(-1).parts.find((item) => item.type === `tool-${tool}`);
const query = { start: 1800000000000, end: 1800000060000 };
function publish(f, actor, intervals = []) {
  f.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: actor })}'; select public.nest_get_calendar_consent('${id(10)}')`,
  );
  const incarnation = f.db.sql(
    `select incarnation from public.nest_calendar_consent where actor_id='${actor}'`,
  );
  f.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: actor })}'; select public.nest_set_calendar_consent('${id(10)}','${incarnation}','${id(800)}',0,true); select public.nest_begin_busy_capture('${id(10)}','${incarnation}',1); select public.nest_publish_busy('${id(10)}','${incarnation}',1,2,${query.start},${query.end},'${JSON.stringify(intervals)}'::jsonb)`,
  );
}
test("SDK reads only fresh opted-in evidence, clips requested intervals and leaves missing partner coverage unknown", async (t) => {
  const f = await postgrestFixture(t, files);
  publish(f, id(1), [{ start: query.start + 100, end: query.start + 200 }]);
  const model = modelFor([[call("readAvailability", query, "availability")]]),
    { history } = await run(f, model);
  const output = part(history, "readAvailability").output;
  assert.equal(output.ok, true);
  assert.equal(output.value.members[0].status, "busy");
  assert.deepEqual(output.value.members[0].intervals, [
    { start: query.start + 100, end: query.start + 200 },
  ]);
  assert.equal(output.value.members[1].status, "unknown");
  assert.equal(output.value.members[1].intervals, undefined);
  assert.ok(!JSON.stringify(output).includes("calendarId"));
});
test("SDK never calls expired, revoked or out-of-coverage availability free; an opted-in empty snapshot is qualified free evidence", async (t) => {
  const f = await postgrestFixture(t, files);
  publish(f, id(1));
  const first = await run(f, modelFor([[call("readAvailability", query, "read")]]));
  assert.equal(part(first.history, "readAvailability").output.value.members[0].status, "free");
  const outside = await run(
    f,
    modelFor([[call("readAvailability", { start: query.start - 1, end: query.end }, "read")]]),
    id(1),
    { conversationId: id(710), operationId: id(711) },
  );
  assert.equal(part(outside.history, "readAvailability").output.value.members[0].status, "unknown");
  f.db.sql(
    "update public.nest_busy_snapshots set expires_at=clock_timestamp()-interval '1 second'",
  );
  const expired = await run(f, modelFor([[call("readAvailability", query, "read")]]), id(1), {
    conversationId: id(720),
    operationId: id(721),
  });
  assert.equal(part(expired.history, "readAvailability").output.value.members[0].status, "unknown");
});
test("native calendar handoff has no consent mutation and all tools recheck membership", async (t) => {
  const f = await postgrestFixture(t, files);
  const { history } = await run(
    f,
    modelFor([
      [call("openCalendarSettings", {}, "settings"), call("openCalendarAgenda", {}, "agenda")],
    ]),
  );
  assert.deepEqual(part(history, "openCalendarSettings").output, {
    ok: true,
    value: { kind: "device_handoff", screen: "calendar-sharing" },
  });
  assert.deepEqual(part(history, "openCalendarAgenda").output, {
    ok: true,
    value: { kind: "device_handoff", screen: "calendar" },
  });
  assert.equal(f.db.sql("select count(*) from public.nest_calendar_consent"), "0");
  const { tools } = householdTools(
    new Request("http://localhost/", {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    }),
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    {
      householdId: id(10),
      turn: { conversationId: id(700), operationId: id(701), expectedRevision: "0", text: "Read" },
    },
  );
  assert.equal(tools.setCalendarConsent, undefined);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  for (const [name, input] of [
    ["readAvailability", query],
    ["openCalendarSettings", {}],
    ["openCalendarAgenda", {}],
  ])
    assert.deepEqual(await tools[name].execute(input, { toolCallId: "revoked", messages: [] }), {
      ok: false,
      code: "forbidden",
    });
});

test("calendar opt-out removes evidence from a new SDK read instead of reusing historical free results", async (t) => {
  const f = await postgrestFixture(t, files);
  publish(f, id(1));
  await run(f, modelFor([[call("readAvailability", query, "before")]]));
  const incarnation = f.db.sql(
    `select incarnation from public.nest_calendar_consent where actor_id='${id(1)}'`,
  );
  f.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_set_calendar_consent('${id(10)}','${incarnation}','${id(801)}',1,false)`,
  );
  const revision = f.db.sql(
    `select revision from public.nest_ai_conversations where id='${id(700)}'`,
  );
  const { history } = await run(f, modelFor([[call("readAvailability", query, "after")]]), id(1), {
    operationId: id(702),
    expectedRevision: revision,
  });
  assert.equal(part(history, "readAvailability").output.value.members[0].status, "unknown");
  assert.equal(
    history[1].parts.find((item) => item.type === "tool-readAvailability").output.value.members[0]
      .status,
    "free",
  );
});
