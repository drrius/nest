import test from "node:test";
import assert from "node:assert/strict";
import { expoTicketResult, expoReceiptResult } from "../../apps/api/src/push/provider-results.ts";

test("Expo ticket decoding preserves uncertainty and never retains provider messages", () => {
  assert.deepEqual(expoTicketResult({ data: { status: "ok", id: "ticket-1" } }), {
    status: "ticket",
    ticketId: "ticket-1",
  });
  for (const data of [
    null,
    [],
    [{ status: "ok", id: "ticket-1" }],
    { status: "ok" },
    { status: "ok", id: "bad\n" },
    { status: "error", details: "bad" },
  ])
    assert.deepEqual(expoTicketResult({ data }), { status: "unknown" });
  const cases = [
    ["DeviceNotRegistered", "device_not_registered"],
    ["MessageTooBig", "message_too_big"],
    ["MessageRateExceeded", "rate_limited"],
    ["InvalidCredentials", "invalid_credentials"],
    ["UnexpectedFutureError", "provider_rejected"],
    ["__proto__", "provider_rejected"],
  ];
  for (const [error, reason] of cases)
    assert.deepEqual(
      expoTicketResult({
        data: {
          status: "error",
          message: "sensitive provider text",
          details: { error },
        },
      }),
      { status: "rejected", reason },
    );
});

test("Expo receipts require the exact own ticket key and keep absent or malformed outcomes pending", () => {
  assert.deepEqual(expoReceiptResult({ data: { ticket: { status: "ok" } } }, "ticket"), {
    status: "accepted",
  });
  assert.deepEqual(
    expoReceiptResult(
      {
        data: {
          ticket: {
            status: "error",
            details: { error: "DeviceNotRegistered" },
            message: "secret",
          },
        },
      },
      "ticket",
    ),
    { status: "rejected", reason: "device_not_registered" },
  );
  for (const body of [null, {}, { data: {} }, { data: { other: { status: "ok" } } }]) {
    assert.equal(expoReceiptResult(body, "ticket"), null);
  }
  assert.equal(expoReceiptResult({ data: { ticket: { status: "unknown" } } }, "ticket"), null);
  assert.equal(expoReceiptResult({ data: {} }, "toString"), null);
  assert.equal(expoReceiptResult({ data: {} }, "bad\n"), null);
});
