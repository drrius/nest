import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import type { ReadSavedMeal } from "@nest/contracts/meal-library";
import { useSession } from "../session/provider";
import { recipeEditOwner } from "../meals/recipe-edit-owner";
import { savedMealTarget } from "../meals/recipe-runtime";
import type { EditClient, RecipeEditRuntime } from "../meals/recipe-edit-runtime";
import { RecipeEditForm } from "../meals/recipe-edit-form";
import { RecipeEditStatus } from "../meals/recipe-edit-status";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
export default function RecipeEditScreen() {
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
        <Note>Open a current saved recipe to edit it.</Note>
        <Link href="/meal-library">Saved recipes</Link>
      </Page>
    );
  return (
    <Editor
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.definitionId}:${target.expectedRevision}`}
      client={session.meals}
      target={target}
      verify={session.retry}
    />
  );
}
function Editor({
  client,
  target,
  verify,
}: {
  client: EditClient;
  target: typeof ReadSavedMeal.Type;
  verify: () => void;
}) {
  const [owner] = useState(() => recipeEditOwner(client, target, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <EditorContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening recipe…</Note>
    </Page>
  );
}
function EditorContent({ runtime, verify }: { runtime: RecipeEditRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const recipe = view.snapshot?.recipe;
  if (recipe && !view.receipt && view.stage !== "verify")
    return (
      <RecipeEditForm
        key={view.generation}
        runtime={runtime}
        view={view}
        recipe={recipe}
        verify={verify}
      />
    );
  return (
    <Page>
      <RecipeEditStatus runtime={runtime} view={view} verify={verify} />
    </Page>
  );
}
