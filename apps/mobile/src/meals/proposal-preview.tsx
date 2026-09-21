import { ProposalEntryCard } from "./proposal-entry-card";
import { ProposalSavedPicker } from "./proposal-saved-picker";
import type { MealLibraryClient } from "./library-client";
import type { ProposalEditTarget } from "./proposal-edit-runtime";
import { useState, useSyncExternalStore } from "react";
import { FlatList, View } from "react-native";
import { Link } from "expo-router";
import type { ProposedMeal } from "@nest/contracts/meal-proposals";
import type { SavedMeal } from "@nest/contracts/meal-library";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { RecipeHeader, IngredientRow, RecipeFooter } from "./recipe-content";
import { ProposalControls } from "./proposal-controls";
import type { MealProposalRuntime } from "./proposal-runtime";
import { space, useQuiet } from "../theme";
export function ProposalPreview({
  runtime,
  verify,
  library,
}: {
  runtime: MealProposalRuntime;
  verify: () => void;
  library: MealLibraryClient;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    colors = useQuiet();
  const [picking, setPicking] = useState<ProposalEditTarget | null>(null);
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
  if (picking)
    return (
      <ProposalSavedPicker
        client={library}
        verify={verify}
        close={() => setPicking(null)}
        choose={(definitionId, expectedLibraryRevision) => {
          setPicking(null);
          void runtime.edit({
            ...picking,
            action: "choose",
            definitionId,
            expectedLibraryRevision,
          });
        }}
      />
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
        <ProposalEntryCard
          entry={item}
          view={view}
          runtime={runtime}
          open={() => setSelected(item.entryId)}
          choose={setPicking}
        />
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
