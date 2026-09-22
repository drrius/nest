import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID());
export const ReminderTime = Schema.String.check(
  Schema.isPattern(/^([01][0-9]|2[0-3]):[0-5][0-9]$(?![\s\S])/),
);
export const ReminderSettings = Schema.Struct({
  enabled: Schema.Boolean,
  recipientIds: Schema.Array(Uuid).check(Schema.isMaxLength(2)),
  localTime: ReminderTime,
  daysBefore: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 730 })),
}).check(
  Schema.makeFilter((value) => {
    const recipients = value.recipientIds.map((id) => id.toLowerCase());
    return (
      new Set(recipients).size === recipients.length && (!value.enabled || recipients.length > 0)
    );
  }),
);
export type ReminderSettings = typeof ReminderSettings.Type;
export const RenewalReminderSettings = Schema.Struct({
  anchor: Schema.Literals(["renewal", "cancellation"]),
  delivery: ReminderSettings,
});
export const SaveRenewalReminder = Schema.Struct({
  operationId: Uuid,
  renewalId: Uuid,
  expectedRenewalRevision: Uuid,
  expectedRevision: Schema.NullOr(Uuid),
  settings: RenewalReminderSettings,
});
export const RenewalReminder = Schema.Struct({
  renewalId: Uuid,
  revision: Uuid,
  reviewedRenewalRevision: Uuid,
  updatedBy: Uuid,
  settings: RenewalReminderSettings,
});
export const RenewalReminderEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  renewalId: Uuid,
  reminder: Schema.NullOr(RenewalReminder),
}).check(
  Schema.makeFilter(
    (value) => value.reminder === null || value.reminder.renewalId === value.renewalId,
  ),
);
export function canonicalReminderSettings(settings: ReminderSettings): ReminderSettings {
  return { ...settings, recipientIds: settings.recipientIds.map((id) => id.toLowerCase()).sort() };
}
export function canonicalRenewalReminder(command: typeof SaveRenewalReminder.Type) {
  return {
    ...command,
    operationId: command.operationId.toLowerCase(),
    renewalId: command.renewalId.toLowerCase(),
    expectedRenewalRevision: command.expectedRenewalRevision.toLowerCase(),
    expectedRevision: command.expectedRevision?.toLowerCase() ?? null,
    settings: {
      ...command.settings,
      delivery: canonicalReminderSettings(command.settings.delivery),
    },
  };
}
export const sameRenewalReminderCommand = Schema.toEquivalence(SaveRenewalReminder);
const sameSettings = Schema.toEquivalence(RenewalReminderSettings);
export const RenewalReminderReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  command: SaveRenewalReminder,
  reminder: RenewalReminder,
}).check(
  Schema.makeFilter(
    (value) =>
      value.operationId === value.command.operationId &&
      value.reminder.renewalId === value.command.renewalId &&
      value.reminder.updatedBy === value.actorId &&
      value.reminder.reviewedRenewalRevision === value.command.expectedRenewalRevision &&
      value.reminder.revision !== value.command.expectedRevision &&
      sameSettings(value.reminder.settings, value.command.settings),
  ),
);
export const RenewalReminderQuery = Schema.Struct({ renewalId: Uuid });
export const ReminderOperationQuery = Schema.Struct({ operationId: Uuid });
export const RenewalReminderRecovery = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "cancelled", "recorded"]),
  receipt: Schema.NullOr(RenewalReminderReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.status !== "recorded") return value.receipt === null;
    const receipt = value.receipt;
    return (
      receipt !== null &&
      receipt.actorId === value.actorId &&
      receipt.householdId === value.householdId &&
      receipt.operationId === value.operationId
    );
  }),
);

// The private AI journal supplies operation identity, never the model.
export const SaveRenewalReminderInput = Schema.Struct({
  renewalId: Uuid,
  expectedRenewalRevision: Uuid,
  expectedRevision: Schema.NullOr(Uuid),
  settings: RenewalReminderSettings,
});
