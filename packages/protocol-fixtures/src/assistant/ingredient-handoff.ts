import * as Schema from "effect/Schema";
import { MealIngredientReviewHandoff } from "@nest/contracts/meal-ingredients";
const Output = Schema.Struct({ ok: Schema.Literal(true), value: MealIngredientReviewHandoff });
export function ingredientHandoff(part: { state?: unknown; output?: unknown }) {
  if (part.state !== "output-available") return null;
  const result = Schema.decodeUnknownExit(Output)(part.output, { onExcessProperty: "error" });
  if (result._tag === "Failure") return null;
  return {
    label: "Review ingredients on your iPhone · nothing added yet",
    href: {
      pathname: "/meal-ingredients" as const,
      params: { weekStart: result.value.value.weekStart },
    },
  };
}
