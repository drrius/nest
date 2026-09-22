import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID());
// Opaque provider data: no trimming or case normalization of device tokens.
export const PushToken = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(4096),
  Schema.isPattern(/^\S+$(?![\s\S])/),
);
const Identity = {
  operationId: Uuid,
  installationId: Uuid,
  expectedRevision: Schema.NullOr(Uuid),
};
export const RegisterPushDevice = Schema.Struct({
  ...Identity,
  action: Schema.Literal("register"),
  token: PushToken,
});
export const DisablePushDevice = Schema.Struct({
  ...Identity,
  action: Schema.Literal("disable"),
});
export const PushDeviceCommand = Schema.Union([RegisterPushDevice, DisablePushDevice]);
export type PushDeviceCommand = typeof PushDeviceCommand.Type;
export function canonicalPushDevice(command: PushDeviceCommand): PushDeviceCommand {
  return {
    ...command,
    operationId: command.operationId.toLowerCase(),
    installationId: command.installationId.toLowerCase(),
    expectedRevision: command.expectedRevision?.toLowerCase() ?? null,
  };
}
// Receipts contain a digest of the complete canonical command, never its token.
// The authenticated adapter must recompute and compare the digest before success.
export const PushDeviceReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  installationId: Uuid,
  expectedRevision: Schema.NullOr(Uuid),
  revision: Uuid,
  action: Schema.Literals(["register", "disable"]),
  commandDigest: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$(?![\s\S])/)),
}).check(Schema.makeFilter((value) => value.revision !== value.expectedRevision));
export const PushDeviceQuery = Schema.Struct({ installationId: Uuid });
export const PushDeviceOperationQuery = Schema.Struct({ operationId: Uuid });
export const PushDeviceState = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  installationId: Uuid,
  revision: Schema.NullOr(Uuid),
  enabled: Schema.Boolean,
}).check(Schema.makeFilter((value) => !value.enabled || value.revision !== null));

// SHA-256 UTF-8 input shared with the server. Tokens cannot contain whitespace,
// so newline-delimited fields have no ambiguous boundaries. Never log this value.
export function pushDeviceDigestInput(
  command: PushDeviceCommand,
  actorId: string,
  householdId: string,
): string {
  const value = canonicalPushDevice(command);
  return [
    "nest-push-device/v1",
    actorId.toLowerCase(),
    householdId.toLowerCase(),
    value.operationId,
    value.installationId,
    value.expectedRevision ?? "",
    value.action,
    value.action === "register" ? value.token : "",
  ].join("\n");
}
export function matchesPushDeviceReceipt(
  receipt: typeof PushDeviceReceipt.Type,
  command: PushDeviceCommand,
  actorId: string,
  householdId: string,
  commandDigest: string,
): boolean {
  const value = canonicalPushDevice(command);
  return (
    receipt.actorId === actorId.toLowerCase() &&
    receipt.householdId === householdId.toLowerCase() &&
    receipt.operationId === value.operationId &&
    receipt.installationId === value.installationId &&
    receipt.expectedRevision === value.expectedRevision &&
    receipt.action === value.action &&
    receipt.commandDigest === commandDigest
  );
}
