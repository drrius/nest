import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import * as Schema from "effect/Schema";
import { MealWeekStart } from "@nest/contracts/meals";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import type { MealClient } from "../meals/client";
import { ingredientOwner } from "../meals/ingredient-owner";
import { IngredientReview } from "../meals/ingredient-review";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function MealIngredientsScreen() {
  const session = useSession(),
    offline = useOfflineAccount(),
    params = useLocalSearchParams();
  if (!Schema.is(MealWeekStart)(params.weekStart))
    return (
      <Page>
        <Note>Open Meals and choose the week to review.</Note>
      </Page>
    );
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (offline.state.status !== "ready")
    return (
      <Page>
        <Note>
          {offline.state.status === "error"
            ? "Could not open saved ingredient choices."
            : "Opening saved ingredient choices…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry" onPress={offline.retry} />
        ) : null}
      </Page>
    );
  return (
    <Review
      key={`${offline.state.account.session.lease}:${params.weekStart}`}
      account={offline.state.account}
      meals={session.meals}
      weekStart={params.weekStart}
      verify={session.retry}
    />
  );
}
function Review({
  account,
  meals,
  weekStart,
  verify,
}: {
  account: OfflineAccount;
  meals: MealClient;
  weekStart: string;
  verify: () => void;
}) {
  const [owner] = useState(() => ingredientOwner(meals, account, weekStart, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <IngredientReview runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening ingredient review…</Note>
    </Page>
  );
}
