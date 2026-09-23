import { AccountRecovery } from "../components/account-recovery";
import { useState, useSyncExternalStore } from "react";
import { FlatList, Text, useColorScheme } from "react-native";
import { Host, Switch } from "@expo/ui";
import { Link } from "expo-router";
import { sourceKey, type MealIngredient } from "@nest/contracts/meal-ingredients";
import type { IngredientAttempt } from "./ingredient-draft";
import type { IngredientRuntime } from "./ingredient-runtime";
import { IngredientControls } from "./ingredient-controls";
import { IngredientQuantityEditor } from "./ingredient-quantity-editor";
import { Page, Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
type Choice = IngredientAttempt["choices"][number];
export function IngredientReview({
  runtime,
  verify,
}: {
  runtime: IngredientRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    colors = useQuiet();
  const [editing, setEditing] = useState<{
    source: MealIngredient;
    choice: Choice;
    sequence: number;
  } | null>(null);
  if (view.access === "verify")
    return (
      <Page>
        <Note>{view.notice}</Note>
        <AccountRecovery verify={verify} busy={view.busy} reload={runtime.load} />
      </Page>
    );
  if (editing)
    return (
      <IngredientQuantityEditor
        source={editing.source}
        choice={editing.choice}
        sequence={editing.sequence}
        runtime={runtime}
        close={() => setEditing(null)}
      />
    );
  const choices = new Map(view.attempt?.choices.map((row) => [sourceKey(row), row]));
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, paddingBottom: 48, gap: space.medium }}
      data={view.ingredients}
      keyExtractor={sourceKey}
      ListHeaderComponent={<IngredientControls runtime={runtime} view={view} />}
      ListEmptyComponent={view.fresh ? <Note>No ingredients to review for this week.</Note> : null}
      renderItem={({ item }) => {
        const choice = choices.get(sourceKey(item));
        return choice ? (
          <IngredientReviewRow
            source={item}
            choice={choice}
            disabled={view.busy || !view.fresh || !!view.attempt?.pending}
            change={(selected) => {
              void runtime.edit({ ...choice, selected });
            }}
            edit={() => {
              if (view.attempt)
                setEditing({ source: item, choice, sequence: view.attempt.sequence });
            }}
          />
        ) : null;
      }}
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
function IngredientReviewRow({
  source,
  choice,
  disabled,
  change,
  edit,
}: {
  source: MealIngredient;
  choice: Choice;
  disabled: boolean;
  change: (selected: boolean) => void;
  edit: () => void;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Card>
      <Text selectable style={{ color: colors.text, fontSize: 19, fontWeight: "500" }}>
        {source.name}
      </Text>
      <Note>
        {source.mealTitle} · {source.date} · {source.slot}
      </Note>
      <Note>
        Quantity: {choice.quantity ?? "unknown"} · Unit: {choice.unit ?? "not specified"}
      </Note>
      {source.groceryItemId ? (
        <Note>Already added · existing grocery changes are kept.</Note>
      ) : (
        <>
          <Host
            matchContents
            colorScheme={scheme === "dark" ? "dark" : "light"}
            seedColor={colors.accent}
          >
            <Switch
              label={`Include ${source.name}`}
              value={choice.selected}
              onValueChange={change}
              disabled={disabled}
            />
          </Host>
          <NativeAction
            label={`Edit quantity for ${source.name}`}
            disabled={disabled}
            onPress={edit}
          />
        </>
      )}
    </Card>
  );
}
