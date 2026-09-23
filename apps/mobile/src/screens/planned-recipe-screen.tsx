import { useState, useSyncExternalStore } from "react";
import { FlatList, View } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { ReadPlannedRecipe } from "@nest/contracts/recipe-selection";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import type { MealClient } from "../meals/client";
import { plannedRecipeOwner } from "../meals/planned-recipe-owner";
import type { PlannedRecipeRuntime, PlannedRecipeView } from "../meals/planned-recipe-runtime";
import { RecipeHeader, RecipeFooter, IngredientRow, RecipeSource } from "../meals/recipe-content";
import { useMealWeekRefresh } from "../meals/use-refresh";
import { Page, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
import { space, useQuiet } from "../theme";
export default function PlannedRecipeScreen() {
  const params = useLocalSearchParams(),
    session = useSession(),
    offline = useOfflineAccount();
  const target = {
    entryId: params.entryId,
    weekStart: params.weekStart,
    revision: params.revision,
  };
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (!Schema.is(ReadPlannedRecipe)(target))
    return (
      <Page>
        <Note>This meal link is incomplete. Open the week to choose a meal.</Note>
        <Link href="/meal-week">Meals</Link>
      </Page>
    );
  if (offline.state.status !== "ready")
    return (
      <Page>
        <Note>
          {offline.state.status === "error"
            ? "Could not open saved details."
            : "Opening saved details…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry saved details" onPress={offline.retry} />
        ) : null}
      </Page>
    );
  return (
    <PlannedRecipe
      key={`${offline.state.account.session.lease}:${target.weekStart}:${target.entryId}:${target.revision}`}
      account={offline.state.account}
      client={session.meals}
      target={target}
      verify={session.retry}
    />
  );
}
function PlannedRecipe({
  account,
  client,
  target,
  verify,
}: {
  account: OfflineAccount;
  client: MealClient;
  target: ReadPlannedRecipe;
  verify: () => void;
}) {
  const [owner] = useState(() => plannedRecipeOwner(client, account, target));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <Content runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Loading meal…</Note>
    </Page>
  );
}
function Content({ runtime, verify }: { runtime: PlannedRecipeRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    colors = useQuiet();
  useMealWeekRefresh(runtime);
  const recipe = view.snapshot?.snapshot?.recipe;
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={recipe?.ingredients ?? []}
      keyExtractor={(ingredient) => ingredient.ingredientId}
      renderItem={({ item }) => <IngredientRow ingredient={item} />}
      ListHeaderComponent={<Status runtime={runtime} view={view} verify={verify} />}
      ListFooterComponent={recipe ? <RecipeFooter recipe={recipe} /> : null}
    />
  );
}
function Status({
  runtime,
  view,
  verify,
}: {
  runtime: PlannedRecipeRuntime;
  view: PlannedRecipeView;
  verify: () => void;
}) {
  const snapshot = view.snapshot;
  return (
    <View style={{ gap: space.medium }}>
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.busy ? <Note>Checking meal details…</Note> : null}
      {snapshot && !view.fresh ? <Note>Saved copy · may be out of date</Note> : null}
      {view.access === "verify" ? (
        <NativeAction label="Verify account" disabled={view.busy} onPress={verify} />
      ) : null}
      <NativeAction
        label="Refresh meal details"
        disabled={view.busy}
        onPress={() => {
          void runtime.load();
        }}
      />
      <DetailHeader view={view} />
      <Link href="/meal-library">Browse current saved recipes</Link>
    </View>
  );
}
function HistoricalDetail({ view }: { view: PlannedRecipeView }) {
  const snapshot = view.snapshot;
  if (!snapshot) return null;
  const entry = snapshot.entry;
  if (!entry)
    return (
      <Note>
        {view.fresh
          ? "This meal is no longer in this week."
          : "The saved copy does not contain this meal. Refresh to check the current week."}
      </Note>
    );
  return (
    <View style={{ gap: space.medium }}>
      <Section title={entry.title} />
      <Note>Ingredients, servings and cooking instructions were not retained for this meal.</Note>
      {entry.notes ? <Note>{entry.notes}</Note> : null}
      {entry.recipeUrl ? <RecipeSource source={entry.recipeUrl} /> : null}
    </View>
  );
}

function DetailHeader({ view }: { view: PlannedRecipeView }) {
  const snapshot = view.snapshot,
    recipe = snapshot?.snapshot?.recipe;
  return (
    <View style={{ gap: space.medium }}>
      {snapshot?.entry ? (
        <Note>
          {snapshot.entry.date} · {snapshot.entry.slot ?? "Meal"}
        </Note>
      ) : null}
      {recipe ? (
        <RecipeHeader
          recipe={recipe}
          label={
            recipe.definitionId === null
              ? "Recipe as planned · not added to the saved-meal library"
              : "Recipe as planned · later library edits do not change these ingredients"
          }
        />
      ) : (
        <HistoricalDetail view={view} />
      )}
    </View>
  );
}
