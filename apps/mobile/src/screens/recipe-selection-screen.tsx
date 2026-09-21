import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { recipeSelectionOwner } from "../meals/selection-owner";
import { selectionTarget, type SelectionTarget } from "../meals/selection-target";
import type { SelectionClient } from "../meals/selection-runtime";
import { SelectionContent } from "../meals/selection-content";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
export default function RecipeSelectionScreen() {
  const session = useSession(),
    target = selectionTarget(useLocalSearchParams());
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (!target)
    return (
      <Page>
        <Note>Choose a slot from the meal week to select a recipe.</Note>
        <Link href="/meal-week">Meals</Link>
      </Page>
    );
  return (
    <Selection
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.weekStart}:${target.date}:${target.slot}:${target.entryId ?? "new"}`}
      client={session.meals}
      target={target}
      verify={session.retry}
    />
  );
}
function Selection({
  client,
  target,
  verify,
}: {
  client: SelectionClient;
  target: SelectionTarget;
  verify: () => void;
}) {
  const [owner] = useState(() => recipeSelectionOwner(client, target, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <SelectionContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening recipes…</Note>
    </Page>
  );
}
