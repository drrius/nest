import { AccountRecovery } from "../components/account-recovery";
import { Alert, FlatList, View } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useSyncExternalStore } from "react";
import { NativeAction } from "../components/native-action";
import { Note } from "../components/page";
import { space, useQuiet } from "../theme";
import { RecipeHeader, RecipeFooter, IngredientRow } from "./recipe-content";
import {
  selectionDestination,
  type RecipeSelectionRuntime,
  type SelectionView,
} from "./selection-runtime";
export function SelectionContent({
  runtime,
  verify,
}: {
  runtime: RecipeSelectionRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    colors = useQuiet();
  useSelectionExit(view);
  const recipe = view.selected?.recipe;
  const header = <SelectionStatus runtime={runtime} view={view} verify={verify} />;
  const style = { flex: 1, backgroundColor: colors.background };
  const contentContainerStyle = { padding: space.large, gap: space.medium, paddingBottom: 48 };
  if (recipe)
    return (
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        style={style}
        contentContainerStyle={contentContainerStyle}
        data={recipe.ingredients}
        keyExtractor={(ingredient) => ingredient.ingredientId}
        renderItem={({ item }) => <IngredientRow ingredient={item} />}
        ListHeaderComponent={
          <View style={{ gap: space.medium }}>
            {header}
            <RecipeHeader recipe={recipe} label="Recipe selected for this meal" />
          </View>
        }
        ListFooterComponent={
          <View style={{ gap: space.medium }}>
            <RecipeFooter recipe={recipe} />
            <Confirmation runtime={runtime} view={view} />
          </View>
        }
      />
    );
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={style}
      contentContainerStyle={contentContainerStyle}
      data={view.library?.meals ?? []}
      keyExtractor={(meal) => meal.definitionId}
      renderItem={({ item }) => (
        <NativeAction
          label={`Preview ${item.title}`}
          disabled={view.busy || view.stage !== "ready"}
          onPress={() => {
            void runtime.select(item.definitionId);
          }}
        />
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyLibrary view={view} />}
      ListFooterComponent={
        view.library?.nextAfterId ? (
          <NativeAction
            label="More recipes"
            disabled={view.busy || view.stage !== "ready"}
            onPress={() => {
              void runtime.more();
            }}
          />
        ) : null
      }
    />
  );
}
function Confirmation({ runtime, view }: { runtime: RecipeSelectionRuntime; view: SelectionView }) {
  if (view.receipt || view.stage === "saved") return null;
  const ready = !view.busy && view.stage === "ready";
  return (
    <View style={{ gap: space.medium }}>
      <Note>
        {runtime.target.entryId
          ? "Replace this meal while keeping its history and existing groceries. Any open linked preparation will be skipped; the new meal starts without it."
          : "Save this recipe in the selected slot. Groceries are reviewed separately."}
      </Note>
      <NativeAction
        label={runtime.target.entryId ? "Confirm replacement online" : "Add recipe online"}
        disabled={!ready || !selectionDestination(view, runtime.target)}
        onPress={() => {
          void runtime.save();
        }}
      />
      <NativeAction label="Choose a different recipe" disabled={!ready} onPress={runtime.clear} />
    </View>
  );
}
function SelectionStatus({
  runtime,
  view,
  verify,
}: {
  runtime: RecipeSelectionRuntime;
  view: SelectionView;
  verify: () => void;
}) {
  const router = useRouter();
  return (
    <View style={{ gap: space.medium }}>
      <Note>
        {runtime.target.date} · {runtime.target.slot}
      </Note>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Saving selection…" : "Loading current details…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <Recovery runtime={runtime} view={view} verify={verify} />
      {view.week && view.stage === "ready" && !selectionDestination(view, runtime.target) ? (
        <Note>The destination changed. Return to the week to choose a slot.</Note>
      ) : null}
      <NativeAction
        label="View this week"
        onPress={() =>
          router.dismissTo({
            pathname: "/meal-week",
            params: { weekStart: runtime.target.weekStart },
          })
        }
      />
    </View>
  );
}
function Recovery({
  runtime,
  view,
  verify,
}: {
  runtime: RecipeSelectionRuntime;
  view: SelectionView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry exact selection"
        disabled={view.busy}
        onPress={() => {
          void runtime.retry();
        }}
      />
    );
  if (view.stage === "verify")
    return <AccountRecovery verify={verify} busy={view.busy} reload={runtime.load} />;
  return (
    <NativeAction
      label={
        view.receipt || view.stage === "saved" ? "Refresh current week" : "Reload week and recipes"
      }
      disabled={view.busy}
      onPress={() => {
        if (!view.selected || view.receipt) {
          void runtime.load();
          return;
        }
        Alert.alert(
          "Discard this selection?",
          "Reloading clears the preview. You will choose a recipe again from the current library.",
          [
            { text: "Keep selection", style: "cancel" },
            {
              text: "Reload",
              onPress: () => {
                void runtime.load();
              },
            },
          ],
        );
      }}
    />
  );
}

function useSelectionExit(view: SelectionView) {
  const navigation = useNavigation();
  usePreventRemove(!view.receipt && (!!view.selected || view.pendingWrite), ({ data }) => {
    Alert.alert(
      "Leave recipe selection?",
      "Your selection and retry details will be lost. A selection already sent may still be saved. Check the week before adding it again.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}

function EmptyLibrary({ view }: { view: SelectionView }) {
  const router = useRouter();
  if (!view.library || view.stage !== "ready" || view.busy) return null;
  return (
    <View style={{ gap: space.medium }}>
      <Note>No saved recipes yet. Create one, then return here and reload.</Note>
      <NativeAction label="Create recipe" onPress={() => router.push("/recipe-create")} />
    </View>
  );
}
