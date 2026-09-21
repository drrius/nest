import { useState, useSyncExternalStore } from "react";
import { FlatList, View } from "react-native";
import { Link } from "expo-router";
import type { ProposedMeal } from "@nest/contracts/meal-proposals";
import type { SavedMeal } from "@nest/contracts/meal-library";
import { Page, Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { RecipeHeader, IngredientRow, RecipeFooter } from "./recipe-content";
import { ProposalControls } from "./proposal-controls";
import type { MealProposalRuntime } from "./proposal-runtime";
import { space, useQuiet } from "../theme";
const slotNames = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
export function ProposalPreview({
  runtime,
  verify,
}: {
  runtime: MealProposalRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    colors = useQuiet();
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = view.proposal?.entries?.find((entry) => entry.entryId === selected);
  if (view.access === "verify")
    return (
      <Page>
        <Note>{view.notice}</Note>
        <NativeAction
          label="Verify account"
          onPress={() => {
            verify();
            void runtime.load();
          }}
        />
      </Page>
    );
  if (chosen) return <ProposalRecipe entry={chosen} close={() => setSelected(null)} />;
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, paddingBottom: 48, gap: space.medium }}
      data={view.proposal?.entries ?? []}
      keyExtractor={(entry) => entry.entryId}
      ListHeaderComponent={<ProposalControls runtime={runtime} view={view} />}
      renderItem={({ item }) => (
        <Card>
          <Note>
            {item.date} · {slotNames[item.slot]}
          </Note>
          <Section title={item.source.recipe.title} />
          <Note>{item.source.kind === "saved" ? "Saved recipe" : "New suggestion"}</Note>
          {item.estimatedCaloriesPerServing !== null ? (
            <Note>About {item.estimatedCaloriesPerServing} kcal per serving · estimate</Note>
          ) : null}
          <NativeAction label="View recipe" onPress={() => setSelected(item.entryId)} />
        </Card>
      )}
      ListFooterComponent={
        <Link
          href={{ pathname: "/meal-week", params: { weekStart: runtime.weekStart } }}
          style={{ color: colors.accent, fontSize: 17, paddingVertical: space.medium }}
        >
          Back to Meals
        </Link>
      }
    />
  );
}
type Ingredient = Pick<SavedMeal["ingredients"][number], "name" | "quantity" | "unit" | "note">;
function ProposalRecipe({ entry, close }: { entry: ProposedMeal; close: () => void }) {
  const colors = useQuiet(),
    recipe = entry.source.recipe;
  return (
    <FlatList<Ingredient>
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, paddingBottom: 48, gap: space.medium }}
      data={recipe.ingredients}
      keyExtractor={(_item, index) => String(index)}
      ListHeaderComponent={
        <View style={{ gap: space.medium }}>
          <NativeAction label="Back to preview" onPress={close} />
          <RecipeHeader recipe={recipe} label="Private proposal · not added to the week" />
        </View>
      }
      renderItem={({ item }) => <IngredientRow ingredient={item} />}
      ListFooterComponent={<RecipeFooter recipe={recipe} />}
    />
  );
}
