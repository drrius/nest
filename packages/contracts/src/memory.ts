import * as Schema from "effect/Schema";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const MemoryContent = Schema.String.check(
  Schema.isMaxLength(1000),
  Schema.makeFilter(
    (value: string) =>
      value.trim().length > 0 && !value.includes("\u0000") && !/[\uD800-\uDFFF]/u.test(value),
  ),
);
// Exact approval payload; operation and approval identities are separate envelope fields.
export const MemoryChange = Schema.Struct({
  memoryId: Uuid,
  expectedRevision: Revision,
  content: MemoryContent,
});
export const SaveMemory = Schema.Struct({
  ...MemoryChange.fields,
  operationId: Uuid,
  approvalId: Uuid,
});
export const RemoveMemory = Schema.Struct({
  operationId: Uuid,
  memoryId: Uuid,
  expectedRevision: Revision.check(Schema.makeFilter((value: string) => value !== "0")),
});
export const Memory = Schema.Struct({
  id: Uuid,
  revision: Revision.check(Schema.makeFilter((value: string) => value !== "0")),
  content: MemoryContent,
});
export const MemoryReceipt = Schema.Struct({
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  memoryId: Uuid,
  revision: Memory.fields.revision,
  removed: Schema.Boolean,
});
export type MemoryChange = typeof MemoryChange.Type;
export type SaveMemory = typeof SaveMemory.Type;
export type RemoveMemory = typeof RemoveMemory.Type;
export type Memory = typeof Memory.Type;
export type MemoryReceipt = typeof MemoryReceipt.Type;
export const ProposeMemory = Schema.Struct({
  ...MemoryChange.fields,
  operationId: Uuid,
});
export const DecideMemory = Schema.Struct({
  ...SaveMemory.fields,
  approved: Schema.Boolean,
});
export const MemoryApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  change: MemoryChange,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/),
    Schema.makeFilter((value: string) => Number.isFinite(Date.parse(value))),
  ),
});
export const MemoryDecision = Schema.Union([
  Schema.Struct({ status: Schema.Literal("denied") }),
  Schema.Struct({ status: Schema.Literal("consumed"), receipt: MemoryReceipt }),
]);
const OwnerEnvelope = { version: Schema.Literal(1), actorId: Uuid, householdId: Uuid };
export const MemoriesEnvelope = Schema.Struct({
  ...OwnerEnvelope,
  memories: Schema.Array(Memory).check(
    Schema.isMaxLength(64),
    Schema.makeFilter((items) => new Set(items.map((item) => item.id)).size === items.length),
  ),
});
export const MemoryApprovalEnvelope = Schema.Struct({ ...OwnerEnvelope, approval: MemoryApproval });
export const MemoryDecisionEnvelope = Schema.Struct({ ...OwnerEnvelope, decision: MemoryDecision });
export const MemoryRemovalEnvelope = Schema.Struct({ ...OwnerEnvelope, receipt: MemoryReceipt });
export type ProposeMemory = typeof ProposeMemory.Type;
export type DecideMemory = typeof DecideMemory.Type;
export type MemoryApproval = typeof MemoryApproval.Type;
export type MemoryDecision = typeof MemoryDecision.Type;
