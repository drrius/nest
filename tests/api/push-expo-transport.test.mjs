import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { expoPushTransport } from "../../apps/api/src/push/expo-transport.ts";
const delivery = {
  token: "ExponentPushToken[fixture]",
  householdId: "00000000-0000-4000-8000-000000000001",
  renewalId: "00000000-0000-4000-8000-000000000002",
};
test("Expo adapter sends generic content to fixed endpoints and binds receipt IDs", async () => {
  const calls = [];
  const transport = expoPushTransport(Redacted.make("fixture-secret"), async (url, init) => {
    calls.push({ url, ...init, body: JSON.parse(init.body) });
    return Response.json(
      url.endsWith("/send")
        ? { data: { status: "ok", id: "ticket-1" } }
        : { data: { "ticket-1": { status: "ok" } } },
    );
  });
  assert.deepEqual(
    await Effect.runPromise(transport.send({ ...delivery, title: "private text" })),
    {
      status: "ticket",
      ticketId: "ticket-1",
    },
  );
  assert.deepEqual(await Effect.runPromise(transport.receipt("ticket-1")), { status: "accepted" });
  assert.equal(calls[0].url, "https://exp.host/--/api/v2/push/send");
  assert.equal(calls[1].url, "https://exp.host/--/api/v2/push/getReceipts");
  assert.equal(calls[0].redirect, "error");
  assert.equal(calls[0].headers.Authorization, "Bearer fixture-secret");
  assert.deepEqual(calls[0].body, {
    to: delivery.token,
    title: "Nest",
    body: "You have a reminder in Nest.",
    sound: "default",
    data: {
      version: 1,
      kind: "renewal",
      householdId: delivery.householdId,
      renewalId: delivery.renewalId,
    },
  });
  assert.deepEqual(calls[1].body, { ids: ["ticket-1"] });
});
test("failed or oversized provider responses do not cause automatic resend", async () => {
  for (const response of [
    () => new Response("busy", { status: 429 }),
    () => new Response("failed", { status: 500 }),
    () => new Response("not json"),
    () => new Response("x".repeat(65537)),
    () => {
      throw new Error("sensitive network details");
    },
  ]) {
    let calls = 0;
    const transport = expoPushTransport(undefined, async () => {
      calls++;
      return response();
    });
    assert.deepEqual(await Effect.runPromise(transport.send(delivery)), { status: "unknown" });
    assert.equal(calls, 1);
    assert.equal(await Effect.runPromise(transport.receipt("ticket-1")), null);
    assert.equal(calls, 2);
  }
});
test("invalid routing identity or ticket never makes a provider request", async () => {
  const transport = expoPushTransport(undefined, async () => {
    assert.fail("unexpected dispatch");
  });
  assert.deepEqual(await Effect.runPromise(transport.send({ ...delivery, renewalId: "invalid" })), {
    status: "unknown",
  });
  assert.equal(await Effect.runPromise(transport.receipt("ticket\n")), null);
});

test("chore adapter sends only a generic message and exact occurrence routing identity", async () => {
  const calls = [];
  const transport = expoPushTransport(undefined, async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ data: { status: "ok", id: "chore-ticket" } });
  });
  const input = {
    token: delivery.token,
    householdId: delivery.householdId,
    occurrenceId: delivery.renewalId,
    title: "Private chore",
    notes: "Never send this",
  };
  assert.deepEqual(await Effect.runPromise(transport.sendChore(input)), {
    status: "ticket",
    ticketId: "chore-ticket",
  });
  assert.deepEqual(calls, [
    {
      to: delivery.token,
      title: "Nest",
      body: "You have a reminder in Nest.",
      sound: "default",
      data: {
        version: 1,
        kind: "chore",
        householdId: delivery.householdId,
        occurrenceId: delivery.renewalId,
      },
    },
  ]);
  assert.deepEqual(
    await Effect.runPromise(transport.sendChore({ ...input, occurrenceId: "bad" })),
    { status: "unknown" },
  );
  assert.equal(calls.length, 1);
});

test("meal adapter sends only a generic message and exact meal entry routing identity", async () => {
  const calls = [];
  const transport = expoPushTransport(undefined, async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ data: { status: "ok", id: "meal-ticket" } });
  });
  const input = {
    token: delivery.token,
    householdId: delivery.householdId,
    entryId: delivery.renewalId,
    title: "Private meal",
    notes: "Never send this",
  };
  assert.deepEqual(await Effect.runPromise(transport.sendMeal(input)), {
    status: "ticket",
    ticketId: "meal-ticket",
  });
  assert.deepEqual(calls, [
    {
      to: delivery.token,
      title: "Nest",
      body: "You have a reminder in Nest.",
      sound: "default",
      data: {
        version: 1,
        kind: "meal",
        householdId: delivery.householdId,
        entryId: delivery.renewalId,
      },
    },
  ]);
  assert.deepEqual(await Effect.runPromise(transport.sendMeal({ ...input, entryId: "bad" })), {
    status: "unknown",
  });
  assert.equal(calls.length, 1);
});

test("grocery adapter sends only a generic message and exact grocery entry routing identity", async () => {
  const calls = [];
  const transport = expoPushTransport(undefined, async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ data: { status: "ok", id: "grocery-ticket" } });
  });
  const input = {
    token: delivery.token,
    householdId: delivery.householdId,
    itemId: delivery.renewalId,
    title: "Private grocery",
    notes: "Never send this",
  };
  assert.deepEqual(await Effect.runPromise(transport.sendGrocery(input)), {
    status: "ticket",
    ticketId: "grocery-ticket",
  });
  assert.deepEqual(calls, [
    {
      to: delivery.token,
      title: "Nest",
      body: "You have a reminder in Nest.",
      sound: "default",
      data: {
        version: 1,
        kind: "grocery",
        householdId: delivery.householdId,
        itemId: delivery.renewalId,
      },
    },
  ]);
  assert.deepEqual(await Effect.runPromise(transport.sendGrocery({ ...input, itemId: "bad" })), {
    status: "unknown",
  });
  assert.equal(calls.length, 1);
});
