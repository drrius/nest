/** Only bounded provider metadata may reach logs; messages and causes stay private. */
export function assistantFailureDiagnostic(error: unknown) {
  const kinds = new Set([
    "GatewayAuthenticationError",
    "GatewayForbiddenError",
    "GatewayFailedDependencyError",
    "GatewayInvalidRequestError",
    "GatewayModelNotFoundError",
    "GatewayRateLimitError",
    "GatewayInternalServerError",
    "APICallError",
  ]);
  let current = error;
  for (let depth = 0; depth < 3; depth++) {
    if (!current || typeof current !== "object") break;
    const value = current as { name?: unknown; statusCode?: unknown; cause?: unknown };
    if (typeof value.name === "string" && kinds.has(value.name)) {
      return {
        kind: value.name,
        status:
          typeof value.statusCode === "number" &&
          Number.isInteger(value.statusCode) &&
          value.statusCode >= 400 &&
          value.statusCode <= 599
            ? value.statusCode
            : null,
      };
    }
    current = value.cause;
  }
  return { kind: "unknown", status: null };
}
