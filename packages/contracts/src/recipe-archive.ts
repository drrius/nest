import * as Schema from "effect/Schema";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const expectedRevision = Revision.check(
  Schema.makeFilter((value) => BigInt(value) < 9223372036854775807n),
);
export const ArchiveRecipeInput = Schema.Struct({ definitionId: Uuid, expectedRevision });
export const ArchiveRecipe = Schema.Struct({ operationId: Uuid, ...ArchiveRecipeInput.fields });
export const RecipeArchiveReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  definitionId: Uuid,
  revision: Revision,
}).check(Schema.makeFilter((value) => BigInt(value.revision) > 0n));
export type ArchiveRecipeInput = typeof ArchiveRecipeInput.Type;
export type ArchiveRecipe = typeof ArchiveRecipe.Type;
export type RecipeArchiveReceipt = typeof RecipeArchiveReceipt.Type;
