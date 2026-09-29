export type ApnsResult =
  | { status: "provider_accepted"; apnsId: string }
  | { status: "rejected"; reason: ApnsRejection; invalidatedAt?: number }
  | { status: "unknown" };
export type ApnsRejection =
  | "invalid_device"
  | "invalid_credentials"
  | "message_too_big"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_rejected";
export type ApnsResponse = { status: number; apnsId: string | undefined; body: string };

/** APNs acceptance is provider acceptance, never confirmation of phone delivery. */
export function apnsResponse(response: ApnsResponse, expectedId: string): ApnsResult {
  if (response.apnsId !== expectedId || Buffer.byteLength(response.body) > 8192)
    return { status: "unknown" };
  if (response.status === 200) {
    return response.body === ""
      ? { status: "provider_accepted", apnsId: expectedId }
      : { status: "unknown" };
  }
  const error = readError(response.body);
  if (!error) return { status: "unknown" };
  const reason = rejection(response.status, error.reason);
  if (!reason) return { status: "unknown" };
  if (response.status !== 410) return { status: "rejected", reason };
  if (!validTimestamp(error.timestamp)) {
    return { status: "unknown" };
  }
  return { status: "rejected", reason, invalidatedAt: error.timestamp };
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function readError(body: string): { reason: string; timestamp?: unknown } | undefined {
  let error: unknown;
  try {
    error = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (
    error === null ||
    typeof error !== "object" ||
    !("reason" in error) ||
    typeof error.reason !== "string"
  ) {
    return undefined;
  }
  return { reason: error.reason, timestamp: "timestamp" in error ? error.timestamp : undefined };
}

const knownErrors = new Map<string, ApnsRejection>([
  ["410:Unregistered", "invalid_device"],
  ["410:ExpiredToken", "invalid_device"],
  ["400:BadDeviceToken", "invalid_device"],
  ["400:DeviceTokenNotForTopic", "invalid_device"],
  ["413:PayloadTooLarge", "message_too_big"],
  ["429:TooManyRequests", "rate_limited"],
  ["429:TooManyProviderTokenUpdates", "rate_limited"],
  ["500:InternalServerError", "provider_unavailable"],
  ["503:ServiceUnavailable", "provider_unavailable"],
  ["503:Shutdown", "provider_unavailable"],
]);
function rejection(status: number, reason: string): ApnsRejection | undefined {
  const known = knownErrors.get(`${status}:${reason}`);
  if (known) return known;
  if (status === 403) return "invalid_credentials";
  if ([400, 404, 405].includes(status)) return "provider_rejected";
  return undefined;
}
