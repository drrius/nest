import { useState } from "react";
import { Linking, View } from "react-native";
import type { SavedMeal } from "@nest/contracts/meal-library";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space } from "../theme";
import { recipeSourceUrl } from "./recipe-link";
export function RecipeHeader({
  recipe,
  label = "Current saved recipe",
}: {
  recipe: Pick<SavedMeal, "title" | "servings"> & { ingredients: readonly { name: string }[] };
  label?: string;
}) {
  return (
    <View style={{ gap: space.medium }}>
      <Section title={recipe.title} />
      <Note>{label}</Note>
      <Note>
        {recipe.servings === null ? "Servings not recorded" : `${recipe.servings} servings`}
      </Note>
      <Section title="Ingredients" />
      {recipe.ingredients.length === 0 ? <Note>No ingredients recorded.</Note> : null}
    </View>
  );
}
export function IngredientRow({
  ingredient,
}: {
  ingredient: Pick<SavedMeal["ingredients"][number], "name" | "quantity" | "unit" | "note">;
}) {
  return (
    <Card>
      <Note>{ingredient.name}</Note>
      {ingredient.quantity !== null || ingredient.unit !== null ? (
        <Note>
          {[ingredient.quantity, ingredient.unit]
            .filter((value) => value !== null && value !== "")
            .join(" ")}
        </Note>
      ) : null}
      {ingredient.note ? <Note>{ingredient.note}</Note> : null}
    </Card>
  );
}
export function RecipeFooter({
  recipe,
}: {
  recipe: Pick<SavedMeal, "instructions" | "notes" | "recipeUrl">;
}) {
  return (
    <View style={{ gap: space.medium }}>
      <Section title="Instructions">
        <Note>{recipe.instructions ?? "Cooking instructions not recorded."}</Note>
      </Section>
      {recipe.notes !== null ? (
        <Section title="Notes">
          <Note>{recipe.notes}</Note>
        </Section>
      ) : null}
      {recipe.recipeUrl ? <RecipeSource key={recipe.recipeUrl} source={recipe.recipeUrl} /> : null}
    </View>
  );
}
export function RecipeSource({ source }: { source: string }) {
  const url = recipeSourceUrl(source);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <Section title="Source">
      <Note>{source}</Note>
      {url ? (
        <NativeAction
          label="Open recipe source"
          onPress={() => {
            setNotice(null);
            void Linking.openURL(url).catch(() =>
              setNotice("Could not open the source. Try again."),
            );
          }}
        />
      ) : (
        <Note>This source link cannot be opened.</Note>
      )}
      {notice ? <Note>{notice}</Note> : null}
    </Section>
  );
}
