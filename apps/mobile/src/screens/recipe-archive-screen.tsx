import { useState, useSyncExternalStore } from "react";
import { Alert } from "react-native";
import { Link, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as Crypto from "expo-crypto";
import type { ReadSavedMeal } from "@nest/contracts/meal-library";
import { useSession } from "../session/provider";
import type { MealClient } from "../meals/client";
import { recipeArchiveOwner } from "../meals/recipe-archive-owner";
import { savedMealTarget } from "../meals/recipe-runtime";
import type { RecipeArchiveRuntime, RecipeArchiveView } from "../meals/recipe-archive-runtime";
import { Page, Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function RecipeArchiveScreen() {
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
        <Note>Open a current saved recipe to archive it.</Note>
        <Link href="/meal-library">Saved recipes</Link>
      </Page>
    );
  return (
    <Archive
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.definitionId}:${target.expectedRevision}`}
      client={session.meals}
      target={target}
      verify={session.retry}
    />
  );
}
function Archive({
  client,
  target,
  verify,
}: {
  client: MealClient;
  target: typeof ReadSavedMeal.Type;
  verify: () => void;
}) {
  const [owner] = useState(() => recipeArchiveOwner(client, target, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ArchiveContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening recipe…</Note>
    </Page>
  );
}
function ArchiveContent({
  runtime,
  verify,
}: {
  runtime: RecipeArchiveRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    navigation = useNavigation(),
    router = useRouter();
  usePreventRemove(true, ({ data }) => {
    if (!view.pendingWrite || view.receipt) return navigation.dispatch(data.action);
    Alert.alert(
      "Leave before archiving is confirmed?",
      "The recipe may already be archived. Retry details will be lost; check the library before trying again.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  return (
    <Page>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Archiving recipe…" : "Loading current recipe…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <ArchiveConfirmation runtime={runtime} view={view} />
      <ArchiveRecovery runtime={runtime} view={view} verify={verify} />
      <NativeAction label="View saved recipes" onPress={() => router.dismissTo("/meal-library")} />
    </Page>
  );
}
function ArchiveConfirmation({
  runtime,
  view,
}: {
  runtime: RecipeArchiveRuntime;
  view: RecipeArchiveView;
}) {
  if (view.stage === "verify" || !view.snapshot) return null;
  if (view.receipt && view.stage !== "saved")
    return <Note>The archive was confirmed. Reload to see the current recipe.</Note>;
  const recipe = view.snapshot.recipe;
  if (!recipe) return <Note>This recipe is no longer in the active library.</Note>;
  return (
    <Card>
      <Section title={recipe.title} />
      <Note>
        Archiving hides this recipe from the saved library. Its ingredients and existing planned
        meals, meal history and groceries are kept.
      </Note>
      {view.receipt ? (
        <Note>
          The original archive was confirmed. This recipe is currently active again after a later
          household change.
        </Note>
      ) : (
        <NativeAction
          label="Archive this recipe"
          disabled={view.busy || view.stage !== "ready"}
          onPress={() => void runtime.save()}
        />
      )}
    </Card>
  );
}
function ArchiveRecovery({
  runtime,
  view,
  verify,
}: {
  runtime: RecipeArchiveRuntime;
  view: RecipeArchiveView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry this exact archive"
        disabled={view.busy}
        onPress={() => void runtime.retry()}
      />
    );
  if (view.stage === "verify")
    return (
      <NativeAction
        label="Verify account"
        disabled={view.busy}
        onPress={() => {
          verify();
          void runtime.load(true);
        }}
      />
    );
  if (view.stage === "reload")
    return (
      <NativeAction
        label="Reload current recipe"
        disabled={view.busy}
        onPress={() => void runtime.load(true)}
      />
    );
  return null;
}
