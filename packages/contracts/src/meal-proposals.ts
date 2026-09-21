import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { MealSlot } from "./cooking.ts";
import { MealWeekStart } from "./meals.ts";
import { SavedMeal } from "./meal-library.ts";
import { RecipeDraft } from "./recipe-creation.ts";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const PositiveRevision = Revision.check(Schema.makeFilter((value) => value !== "0"));
const Instant = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 253402300799999 }));
export const ProposedMealSource = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("saved"), libraryRevision: Revision, recipe: SavedMeal }),
  Schema.Struct({ kind: Schema.Literal("suggested"), recipe: RecipeDraft }),
]);
export const ProposedMeal = Schema.Struct({
  entryId: Uuid,
  date: CalendarDate,
  slot: MealSlot,
  source: ProposedMealSource,
  estimatedCaloriesPerServing: Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20000 })),
  ),
});
export type ProposedMeal = typeof ProposedMeal.Type;
const Entries = Schema.Array(ProposedMeal).check(Schema.isLengthBetween(1, 21));
const ContentFields = { weekStart: MealWeekStart, familiarOnly: Schema.Boolean, entries: Entries };
function validEntries(value: {
  weekStart: string;
  familiarOnly: boolean;
  entries: readonly ProposedMeal[];
}) {
  const end = new Date(Date.parse(`${value.weekStart}T00:00:00Z`) + 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  return (
    value.entries.every((entry) => entry.date >= value.weekStart && entry.date <= end) &&
    new Set(value.entries.map((entry) => entry.entryId.toLowerCase())).size ===
      value.entries.length &&
    new Set(value.entries.map((entry) => `${entry.date}:${entry.slot}`)).size ===
      value.entries.length &&
    (!value.familiarOnly || value.entries.every((entry) => entry.source.kind === "saved"))
  );
}
export const MealProposalContent = Schema.Struct(ContentFields).check(
  Schema.makeFilter(validEntries),
);
export const MealProposal = Schema.Struct({
  ...ContentFields,
  entries: Schema.NullOr(Entries),
  proposalId: Uuid,
  revision: PositiveRevision,
  weekRevision: Revision,
  status: Schema.Literals(["generating", "ready", "failed", "approved", "discarded"]),
  expiresAt: Instant,
  failure: Schema.NullOr(
    Schema.Literals([
      "unavailable",
      "constraints_changed",
      "incomplete_preferences",
      "no_suitable_meals",
    ]),
  ),
}).check(
  Schema.makeFilter((value) => (value.status === "failed") === (value.failure !== null)),
  Schema.makeFilter((value) => {
    if (value.entries === null) return ["generating", "failed", "discarded"].includes(value.status);
    if (["generating", "failed"].includes(value.status)) return false;
    return validEntries({ ...value, entries: value.entries });
  }),
);
export type MealProposal = typeof MealProposal.Type;
const Owner = { version: Schema.Literal(1), actorId: Uuid, householdId: Uuid };
export const MealProposalEnvelope = Schema.Struct({ ...Owner, proposal: MealProposal });
export const ReadMealProposal = Schema.Struct({ proposalId: Uuid });
export const GenerateMealProposalInput = Schema.Struct({
  weekStart: MealWeekStart,
  expectedWeekRevision: Revision,
  familiarOnly: Schema.Boolean,
});
export const GenerateMealProposal = Schema.Struct({
  operationId: Uuid,
  ...GenerateMealProposalInput.fields,
});
const Target = { proposalId: Uuid, expectedRevision: PositiveRevision };
export const ReplaceProposalMealInput = Schema.Struct({ ...Target, entryId: Uuid });
export const ReplaceProposalMeal = Schema.Struct({
  operationId: Uuid,
  ...ReplaceProposalMealInput.fields,
});
export const ChooseProposalRecipeInput = Schema.Struct({
  ...Target,
  entryId: Uuid,
  definitionId: Uuid,
  expectedLibraryRevision: Revision,
});
export const ChooseProposalRecipe = Schema.Struct({
  operationId: Uuid,
  ...ChooseProposalRecipeInput.fields,
});
// Approval is a native explicit action. It is never an input field on generation or replacement.
export const ApproveMealProposal = Schema.Struct({ operationId: Uuid, ...Target });
export const DiscardMealProposalInput = Schema.Struct(Target);
export const DiscardMealProposal = Schema.Struct({ operationId: Uuid, ...Target });
const Receipt = { ...Owner, operationId: Uuid, proposalId: Uuid };
export const MealProposalGenerationReceipt = Schema.Struct({
  ...Receipt,
  revision: Schema.Literal("1"),
  ...GenerateMealProposalInput.fields,
});
export const MealProposalChangeReceipt = Schema.Struct({
  ...Receipt,
  previousRevision: PositiveRevision,
  revision: PositiveRevision,
  entryId: Uuid,
}).check(
  Schema.makeFilter((value) => BigInt(value.revision) === BigInt(value.previousRevision) + 1n),
);
export const MealProposalDiscardReceipt = Schema.Struct({
  ...Receipt,
  previousRevision: PositiveRevision,
  revision: PositiveRevision,
}).check(
  Schema.makeFilter((value) => BigInt(value.revision) === BigInt(value.previousRevision) + 1n),
);
const PostedEntry = Schema.Struct({
  proposalEntryId: Uuid,
  entryId: Uuid,
  date: CalendarDate,
  slot: MealSlot,
});
export const MealProposalApprovalReceipt = Schema.Struct({
  ...Receipt,
  approvedRevision: PositiveRevision,
  revision: PositiveRevision,
  weekStart: MealWeekStart,
  previousWeekRevision: Revision,
  weekRevision: Revision,
  entries: Schema.Array(PostedEntry).check(Schema.isLengthBetween(1, 21)),
}).check(
  Schema.makeFilter((value) => BigInt(value.revision) === BigInt(value.approvedRevision) + 1n),
  Schema.makeFilter(
    (value) =>
      BigInt(value.weekRevision) ===
      BigInt(value.previousWeekRevision) + BigInt(value.entries.length),
  ),
  Schema.makeFilter((value) => {
    const end = new Date(Date.parse(`${value.weekStart}T00:00:00Z`) + 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    return (
      value.entries.every((entry) => entry.date >= value.weekStart && entry.date <= end) &&
      new Set(value.entries.map((entry) => entry.entryId.toLowerCase())).size ===
        value.entries.length &&
      new Set(value.entries.map((entry) => entry.proposalEntryId.toLowerCase())).size ===
        value.entries.length &&
      new Set(value.entries.map((entry) => `${entry.date}:${entry.slot}`)).size ===
        value.entries.length
    );
  }),
);
export type MealProposalContent = typeof MealProposalContent.Type;
export type GenerateMealProposalInput = typeof GenerateMealProposalInput.Type;
export type GenerateMealProposal = typeof GenerateMealProposal.Type;
export type ApproveMealProposal = typeof ApproveMealProposal.Type;
export type MealProposalApprovalReceipt = typeof MealProposalApprovalReceipt.Type;
