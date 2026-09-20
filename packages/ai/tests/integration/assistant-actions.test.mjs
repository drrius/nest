import assert from "node:assert/strict";
import { test } from "node:test";
import { DefaultChatTransport, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { validateHistory } from "../../src/chat.ts";
import { householdTools } from "../../../../apps/api/src/assistant/tools.ts";
import { createHandler } from "../../../../apps/api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { usage } from "../fixtures.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [
  "tests/database/ai-command-fixture.sql",
  "tests/integration/grocery-postgrest.sql",
  "supabase/migrations/20260919205503_native_chore_receipts.sql",
  "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
  "supabase/migrations/20260920002735_native_grocery_commands.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "supabase/migrations/20260920033321_native_ai_command_journal.sql",
];
const add = { name: "Requested apple", quantity: null, unit: null, categoryId: null };
const call = (name, input, key = "write-1") => ({
  type: "tool-call",
  toolCallId: key,
  toolName: name,
  input: JSON.stringify(input),
});
function modelFor(calls) {
  let count = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 0,
        chunkDelayInMs: 0,
        chunks:
          count++ === 0
            ? [
                ...calls,
                { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
              ]
            : [
                { type: "text-start", id: "answer" },
                { type: "text-delta", id: "answer", delta: "Saved." },
                { type: "text-end", id: "answer" },
                { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
              ],
      }),
    }),
  });
}
async function run(f, model, allowFailure = false) {
  const handler = createHandler(
    { url: f.url, publishableKey: "sb_publishable_fixture" },
    { model },
  );
  const input = {
    conversationId: id(700),
    operationId: id(701),
    expectedRevision: "0",
    text: "Add the requested apple",
  };
  const headers = { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" };
  const transport = new DefaultChatTransport({
    api: "http://localhost/v1/assistant/turn",
    fetch: () =>
      handler(
        new Request("http://localhost/v1/assistant/turn", {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        }),
      ),
  });
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: input.conversationId,
    messages: [],
  });
  const chunks = [];
  let failure;
  try {
    for await (const chunk of stream) chunks.push(chunk);
  } catch (error) {
    if (!allowFailure) throw error;
    failure = error;
  }
  const history = JSON.parse(
    f.db.sql(`select transcript from public.nest_ai_conversations where id='${id(700)}'`),
  );
  return { chunks, history, failure };
}

test("SDK grocery write commits once and saves the real command receipt", async (t) => {
  const f = await postgrestFixture(t, files),
    model = modelFor([call("addGrocery", add)]);
  const { chunks, history } = await run(f, model);
  const output = chunks.find((chunk) => chunk.type === "tool-output-available").output;
  assert.equal(output.ok, true);
  assert.equal(
    f.db.sql(`select name from public.grocery_items where id='${output.value.target}'`),
    add.name,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.deepEqual(history[1].parts.find((part) => part.type === "tool-addGrocery").output, output);
  assert.equal(model.doStreamCalls.length, 2);
});

test("lost command acknowledgment stops queued writes and next model step; reload recovers the committed fact", async (t) => {
  const f = await postgrestFixture(t, files);
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_execute_ai_command");
  f.url = proxy.url;
  const model = modelFor([
    call("addGrocery", add),
    call("addGrocery", { ...add, name: "Must not be added" }, "write-2"),
  ]);
  const { chunks, history } = await run(f, model);
  assert.equal(proxy.dropped(), 1);
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.equal(
    f.db.sql("select count(*) from public.grocery_items where name='Must not be added'"),
    "0",
  );
  assert.ok(
    chunks.some((chunk) => chunk.type === "tool-output-available" && chunk.output.ok === false),
  );
  const fact = history[1].parts.find((part) => part.type === "tool-addGrocery");
  assert.equal(fact.output.ok, true);
  assert.equal(fact.input.name, add.name);
});

test("stale grocery version is a saved conflict and prevents subsequent parallel writes", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${id(100)}','${id(10)}','Milk')`,
  );
  const model = modelFor([
    call("checkGrocery", { itemId: id(100), expectedVersion: "99", checked: true }),
    call("addGrocery", add, "write-2"),
  ]);
  const { history } = await run(f, model);
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.deepEqual(history[1].parts.find((part) => part.type === "tool-checkGrocery").output, {
    ok: false,
    code: "conflict",
  });
  assert.equal(
    f.db.sql("select count(*) from public.grocery_items where name='Requested apple'"),
    "0",
  );
});

test("SDK chore completion uses the shared authorized command and canonical receipt", async (t) => {
  const f = await postgrestFixture(t, files);
  const model = modelFor([
    call("completeChore", {
      occurrenceId: id(100),
      expectedDueDate: "2026-09-19",
      completedOn: "2026-09-19",
    }),
  ]);
  const { history } = await run(f, model);
  assert.equal(f.db.sql("select count(*) from private.fixture_closure_calls"), "1");
  assert.equal(
    history[1].parts.find((part) => part.type === "tool-completeChore").output.value.outcome,
    "completed",
  );
});

test("membership revoked after claiming a turn prevents SDK household writes", async (t) => {
  const f = await postgrestFixture(t, files),
    model = modelFor([call("addGrocery", add)]);
  const stream = model.doStream.bind(model);
  model.doStream = (options) => {
    f.db.sql(
      `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
    );
    return stream(options);
  };
  const { chunks, failure } = await run(f, model, true);
  assert.equal(failure.code, "forbidden");
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "0");
  assert.equal(
    f.db.sql("select count(*) from public.grocery_items where name='Requested apple'"),
    "0",
  );
  assert.ok(
    chunks.some(
      (chunk) => chunk.type === "tool-output-available" && chunk.output.code === "forbidden",
    ),
  );
});

test("SDK edit, check and remove retain command order and validate each native receipt", async (t) => {
  const f = await postgrestFixture(t, files);
  f.db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${id(100)}','${id(10)}','Milk')`,
  );
  const model = modelFor([
    call(
      "editGrocery",
      { ...add, name: "Oat milk", itemId: id(100), expectedVersion: "1" },
      "edit",
    ),
    call("checkGrocery", { itemId: id(100), expectedVersion: "2", checked: true }, "check"),
    call("removeGrocery", { itemId: id(100), expectedVersion: "3" }, "remove"),
  ]);
  const { history } = await run(f, model);
  assert.equal(model.doStreamCalls.length, 2);
  const receipts = history[1].parts.filter((part) => part.type.startsWith("tool-"));
  assert.deepEqual(
    receipts.map((part) => part.output.value.version),
    ["2", "3", "4"],
  );
  assert.equal(receipts[2].output.value.removed, true);
  assert.equal(f.db.sql(`select state from public.grocery_items where id='${id(100)}'`), "removed");
});

test("malformed or unknown SDK calls close the write guard before any queued mutation", async (t) => {
  for (const invalid of [
    call("checkGrocery", { itemId: id(100), expectedVersion: 99, checked: true }, "invalid"),
    call("unknownHouseholdTool", {}, "unknown"),
  ]) {
    await t.test(invalid.toolName, async (t) => {
      const f = await postgrestFixture(t, files);
      const model = modelFor([invalid, call("addGrocery", add, "must-stop")]);
      const { chunks, history } = await run(f, model);
      const { tools } = householdTools(
        new Request("http://localhost"),
        { url: f.url, publishableKey: "sb_publishable_fixture" },
        {
          householdId: id(10),
          turn: {
            conversationId: id(700),
            operationId: id(701),
            expectedRevision: "0",
            text: "Add",
          },
        },
      );
      await validateHistory(history, tools);
      assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "0");
      assert.equal(
        f.db.sql("select count(*) from public.grocery_items where name='Requested apple'"),
        "0",
      );
      assert.equal(model.doStreamCalls.length, 1);
      assert.ok(chunks.some((chunk) => chunk.type === "tool-output-error"));
    });
  }
});
