import * as Schema from "effect/Schema";
import { MealProposalGenerationResult } from "@nest/contracts/meal-proposals";
const Output = Schema.Struct({
  ok: Schema.Boolean,
  value: Schema.optional(Schema.Unknown),
  code: Schema.optional(Schema.String),
});
export function proposalHandoff(part: { state?: unknown; output?: unknown }) {
  if (
    part.state !== "output-available" ||
    !Schema.is(Output)(part.output) ||
    !part.output.ok ||
    !Schema.is(MealProposalGenerationResult)(part.output.value)
  )
    return null;
  const proposal = part.output.value.envelope.proposal;
  return {
    label: "Open current private preview · approval is on your iPhone",
    href: {
      pathname: "/meal-proposal" as const,
      params: { proposalId: proposal.proposalId, weekStart: proposal.weekStart },
    },
  };
}
