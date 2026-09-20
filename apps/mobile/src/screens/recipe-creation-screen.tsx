import { useState, useSyncExternalStore } from "react";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import type { MealClient } from "../meals/client";
import { recipeCreationOwner } from "../meals/recipe-creation-owner";
import { RecipeCreationForm } from "../meals/recipe-creation-form";
import type { RecipeCreationRuntime } from "../meals/recipe-creation-runtime";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
export default function RecipeCreationScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Creation
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.meals}
      verify={session.retry}
    />
  );
}
function Creation({ client, verify }: { client: MealClient; verify: () => void }) {
  const [owner] = useState(() => recipeCreationOwner(client, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <Content runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening recipe…</Note>
    </Page>
  );
}
function Content({ runtime, verify }: { runtime: RecipeCreationRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return <RecipeCreationForm runtime={runtime} view={view} verify={verify} />;
}
