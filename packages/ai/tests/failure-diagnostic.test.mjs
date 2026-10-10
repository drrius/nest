import assert from "node:assert/strict";
import test from "node:test";
import { assistantFailureDiagnostic } from "../src/failure-diagnostic.ts";

test("provider diagnostics discard messages, credentials, request bodies and arbitrary names", () => {
  const secret = "private prompt and credential";
  assert.deepEqual(
    assistantFailureDiagnostic({
      name: "GatewayForbiddenError",
      statusCode: 403,
      message: secret,
      requestBody: secret,
      responseBody: secret,
      headers: { authorization: secret },
    }),
    { kind: "GatewayForbiddenError", status: 403 },
  );
  for (const statusCode of ["403", NaN, 403.5, 200, 600, secret]) {
    assert.deepEqual(assistantFailureDiagnostic({ name: "APICallError", statusCode }), {
      kind: "APICallError",
      status: null,
    });
  }
  assert.deepEqual(assistantFailureDiagnostic({ name: secret, statusCode: 403, message: secret }), {
    kind: "unknown",
    status: null,
  });
});

test("bounded wrapped diagnostics handle SDK wrappers and cyclic causes", () => {
  const cause = { name: "GatewayAuthenticationError", statusCode: 401, message: "private" };
  assert.deepEqual(assistantFailureDiagnostic(new Error("private", { cause })), {
    kind: "GatewayAuthenticationError",
    status: 401,
  });
  const cycle = { name: "private" };
  cycle.cause = cycle;
  assert.deepEqual(assistantFailureDiagnostic(cycle), { kind: "unknown", status: null });
});
