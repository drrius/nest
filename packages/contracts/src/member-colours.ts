import * as Schema from "effect/Schema";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const MemberColour = Schema.Literals([
  "lake",
  "clay",
  "plum",
  "rose",
  "marigold",
  "teal",
  "indigo",
  "slate",
]);
const SavedRevision = Revision.check(Schema.makeFilter((value: string) => value !== "0"));
export const SaveMemberColour = Schema.Struct({
  operationId: Uuid,
  expectedRevision: Revision,
  colour: MemberColour,
});
export const MemberColourReceipt = Schema.Struct({
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  revision: SavedRevision,
  colour: MemberColour,
});
export const MemberColourChoice = Schema.Struct({
  actorId: Uuid,
  colour: MemberColour,
  revision: SavedRevision,
});
export const MemberColoursEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  colours: Schema.Array(MemberColourChoice),
});
export const MemberColourSaved = Schema.Struct({
  version: Schema.Literal(1),
  receipt: MemberColourReceipt,
});
export const MemberColourHandoff = Schema.Struct({
  kind: Schema.Literal("device_handoff"),
  screen: Schema.Literal("member-colour"),
});
export type MemberColour = typeof MemberColour.Type;
export type SaveMemberColour = typeof SaveMemberColour.Type;
export type MemberColourReceipt = typeof MemberColourReceipt.Type;
export type MemberColourChoice = typeof MemberColourChoice.Type;
