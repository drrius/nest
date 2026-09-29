import * as Schema from "effect/Schema";
import { ApnsEnvironment, ApnsPushToken } from "@nest/contracts/push-registration";
import type { NestNotification } from "../../../../packages/contracts/src/push-notification.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const fields = {
  version: Schema.Literal(1),
  provider: Schema.Literal("apns"),
  deliveryId: Uuid,
  attemptId: Uuid,
  apnsId: Uuid,
  outboxId: Uuid,
  installationId: Uuid,
  registrationRevision: Uuid,
  householdId: Uuid,
  environment: ApnsEnvironment,
  token: ApnsPushToken,
};
export const ApnsAttempt = Schema.Union([
  Schema.Struct({ ...fields, renewalId: Uuid }),
  Schema.Struct({ ...fields, occurrenceId: Uuid }),
  Schema.Struct({ ...fields, entryId: Uuid }),
  Schema.Struct({ ...fields, itemId: Uuid }),
  Schema.Struct({ ...fields, ruleId: Uuid }),
  Schema.Struct({ ...fields, summaryId: Uuid, recipientId: Uuid }).check(
    Schema.makeFilter((value) => value.summaryId === value.outboxId),
  ),
]).check(Schema.makeFilter((value) => value.apnsId === value.attemptId));
export type ApnsAttempt = typeof ApnsAttempt.Type;
export const ApnsSendResult = Schema.Union([
  Schema.Struct({ status: Schema.Literal("provider_accepted"), apnsId: Uuid }),
  Schema.Struct({ status: Schema.Literal("unknown") }),
  Schema.Struct({
    status: Schema.Literal("rejected"),
    reason: Schema.Literals([
      "invalid_device",
      "invalid_credentials",
      "message_too_big",
      "rate_limited",
      "provider_unavailable",
      "provider_rejected",
    ]),
    invalidatedAt: Schema.optional(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
    ),
  }).check(
    Schema.makeFilter(
      (value) => value.invalidatedAt === undefined || value.reason === "invalid_device",
    ),
  ),
]);
export type ApnsSendResult = typeof ApnsSendResult.Type;
export const ApnsAcknowledgment = Schema.Struct({
  version: Schema.Literal(1),
  provider: Schema.Literal("apns"),
  deliveryId: Uuid,
  attemptId: Uuid,
  result: ApnsSendResult,
});

export function apnsNotification(attempt: ApnsAttempt): NestNotification {
  const common = { version: 1 as const, householdId: attempt.householdId };
  if ("renewalId" in attempt) return { ...common, kind: "renewal", renewalId: attempt.renewalId };
  if ("occurrenceId" in attempt)
    return { ...common, kind: "chore", occurrenceId: attempt.occurrenceId };
  if ("entryId" in attempt) return { ...common, kind: "meal", entryId: attempt.entryId };
  if ("itemId" in attempt) return { ...common, kind: "grocery", itemId: attempt.itemId };
  if ("ruleId" in attempt) return { ...common, kind: "recurring", ruleId: attempt.ruleId };
  return {
    ...common,
    kind: "daily_summary",
    summaryId: attempt.summaryId,
    recipientId: attempt.recipientId,
  };
}
