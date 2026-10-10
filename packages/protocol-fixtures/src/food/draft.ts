import * as Schema from "effect/Schema";
import { FoodPreferences, type FoodProfile } from "@nest/contracts/food";
export const foodDraft = (profile: FoodProfile | null) => ({
  restrictions: profile?.preferences.restrictions.join("\n") ?? "",
  dislikes: profile?.preferences.dislikes.join("\n") ?? "",
  calorieGoal: profile?.preferences.calorieGoal?.toString() ?? "",
  portions: profile?.preferences.portions ?? 1,
});
export function parseFoodDraft(draft: ReturnType<typeof foodDraft>) {
  const lines = (text: string) =>
    text
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
  const calorie = draft.calorieGoal.trim();
  return Schema.decodeUnknownExit(FoodPreferences)({
    restrictions: lines(draft.restrictions),
    dislikes: lines(draft.dislikes),
    calorieGoal: calorie === "" ? null : /^\d+$/.test(calorie) ? Number(calorie) : Number.NaN,
    portions: draft.portions,
  });
}
