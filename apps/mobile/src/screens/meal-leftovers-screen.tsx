import { AccountRecovery } from "../components/account-recovery";
import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { mealLeftoversOwner } from "../meals/leftovers-owner";
import { moveTarget } from "../meals/move-target";
import type { MealClient } from "../meals/client";
import type {
  MealLeftoversRuntime,
  LeftoversTarget,
  LeftoversView,
} from "../meals/leftovers-runtime";
import { MealLeftoversForm } from "../meals/leftovers-form";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function MealLeftoversScreen() {
  const session = useSession(),
    target = moveTarget(useLocalSearchParams());
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (!target)
    return (
      <Page>
        <Note>Choose a meal from the current week to plan leftovers.</Note>
        <Link href="/meal-week">Open Meals</Link>
      </Page>
    );
  return (
    <Leftovers
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.sourceWeekStart}:${target.entryId}`}
      client={session.meals}
      target={target}
      verify={session.retry}
    />
  );
}
function Leftovers({
  client,
  target,
  verify,
}: {
  client: MealClient;
  target: LeftoversTarget;
  verify: () => void;
}) {
  const [owner] = useState(() => mealLeftoversOwner(client, target, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <LeftoversContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening meal…</Note>
    </Page>
  );
}
function LeftoversContent({
  runtime,
  verify,
}: {
  runtime: MealLeftoversRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    router = useRouter();
  return (
    <Page>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Saving leftovers…" : "Loading current weeks…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <MealLeftoversForm runtime={runtime} view={view} />
      <LeftoversRecovery runtime={runtime} view={view} verify={verify} />
      <NativeAction
        label="View destination week"
        onPress={() =>
          router.dismissTo({
            pathname: "/meal-week",
            params: { weekStart: view.targetWeekStart },
          })
        }
      />
    </Page>
  );
}
function LeftoversRecovery({
  runtime,
  view,
  verify,
}: {
  runtime: MealLeftoversRuntime;
  view: LeftoversView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry these exact leftovers"
        disabled={view.busy}
        onPress={() => {
          void runtime.retry();
        }}
      />
    );
  if (view.stage === "verify")
    return <AccountRecovery verify={verify} busy={view.busy} reload={runtime.load} />;
  if (view.stage === "reload")
    return (
      <NativeAction
        label="Reload both weeks"
        disabled={view.busy}
        onPress={() => {
          void runtime.load();
        }}
      />
    );
  return null;
}
