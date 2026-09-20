import * as Schema from "effect/Schema";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const MemoryContent = Schema.String.check(
  Schema.isMaxLength(1000),
  Schema.makeFilter((value: string) => value.trim().length > 0),
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
