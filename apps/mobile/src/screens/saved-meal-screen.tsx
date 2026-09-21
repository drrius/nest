import { useState, useSyncExternalStore } from "react";
import { FlatList, View } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import type { ReadSavedMeal } from "@nest/contracts/meal-library";
import { useSession } from "../session/provider";
import type { MealLibraryClient } from "../meals/library-client";
import { savedMealOwner } from "../meals/library-owner";
import { savedMealTarget, type RecipeView, type SavedMealRuntime } from "../meals/recipe-runtime";
import { RecipeHeader, RecipeFooter, IngredientRow } from "../meals/recipe-content";
import { useMealWeekRefresh } from "../meals/use-refresh";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
import { space, useQuiet } from "../theme";
export default function SavedMealScreen() {
  const params = useLocalSearchParams(),
    session = useSession();
  const target = savedMealTarget(params.definitionId, params.expectedRevision);
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (!target)
    return (
      <Page>
        <Note>This recipe link is incomplete. Open the saved recipe library.</Note>
        <Link href="/meal-library">Saved recipes</Link>
      </Page>
    );
  return (
    <Recipe
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.definitionId}:${target.expectedRevision}`}
      client={session.meals.library}
      target={target}
      verify={session.retry}
    />
  );
}
function Recipe({
  client,
  target,
  verify,
}: {
  client: MealLibraryClient;
  target: typeof ReadSavedMeal.Type;
  verify: () => void;
}) {
  const [owner] = useState(() => savedMealOwner(client, target));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <RecipeContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Loading recipe…</Note>
    </Page>
  );
}
function RecipeContent({ runtime, verify }: { runtime: SavedMealRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const colors = useQuiet();
  useMealWeekRefresh(runtime);
  const recipe = view.snapshot?.recipe;
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={recipe?.ingredients ?? []}
      keyExtractor={(ingredient) => ingredient.ingredientId}
      renderItem={({ item }) => <IngredientRow ingredient={item} />}
      ListHeaderComponent={<RecipeStatus runtime={runtime} verify={verify} view={view} />}
      ListFooterComponent={recipe ? <RecipeFooter recipe={recipe} /> : null}
    />
  );
}

function RecipeStatus({
  runtime,
  verify,
  view,
}: {
  runtime: SavedMealRuntime;
  verify: () => void;
  view: RecipeView;
}) {
  const colors = useQuiet();
  const recipe = view.snapshot?.recipe;
  return (
    <View style={{ gap: space.medium }}>
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.busy ? <Note>Loading recipe…</Note> : null}
      <NativeAction
        label={view.access === "verify" ? "Verify account" : "Reload current recipe"}
        disabled={view.busy}
        onPress={() => {
          if (view.access === "verify") verify();
          void runtime.load(true);
        }}
      />
      {recipe ? <RecipeHeader recipe={recipe} /> : null}
      <RecipeEditLink view={view} />
      <RecipeArchiveLink view={view} />
      {view.snapshot?.recipe === null ? (
        <Note>This recipe is no longer in the active library.</Note>
      ) : null}
      {!recipe && !view.busy ? (
        <Link href="/meal-library" style={{ color: colors.accent, fontSize: 17 }}>
          Saved recipes
        </Link>
      ) : null}
    </View>
  );
}

function RecipeArchiveLink({ view }: { view: RecipeView }) {
  const router = useRouter();
  const recipe = view.snapshot?.recipe;
  if (!recipe) return null;
  return (
    <NativeAction
      label="Archive recipe"
      disabled={!view.fresh || view.busy}
      onPress={() =>
        router.push({
          pathname: "/recipe-archive",
          params: { definitionId: recipe.definitionId, expectedRevision: view.snapshot!.revision },
        })
      }
    />
  );
}

function RecipeEditLink({ view }: { view: RecipeView }) {
  const router = useRouter();
  const recipe = view.snapshot?.recipe;
  if (!recipe) return null;
  return (
    <NativeAction
      label="Edit recipe"
      disabled={!view.fresh || view.busy}
      onPress={() =>
        router.push({
          pathname: "/recipe-edit",
          params: { definitionId: recipe.definitionId, expectedRevision: view.snapshot!.revision },
        })
      }
    />
  );
}
