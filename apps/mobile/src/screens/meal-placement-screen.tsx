import { AccountRecovery } from "../components/account-recovery";
import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { mealPlacementOwner } from "../meals/placement-owner";
import { placementTarget } from "../meals/placement-target";
import type { MealClient } from "../meals/client";
import type {
  MealPlacementRuntime,
  PlacementTarget,
  PlacementView,
} from "../meals/placement-runtime";
import { MealPlacementForm } from "../meals/placement-form";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function MealPlacementScreen() {
  const session = useSession(),
    target = placementTarget(useLocalSearchParams());
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (!target)
    return (
      <Page>
        <Note>Choose an empty slot from the meal week to add a meal.</Note>
        <Link href="/meal-week">Open Meals</Link>
      </Page>
    );
  return (
    <Placement
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.weekStart}:${target.date}:${target.slot}`}
      client={session.meals}
      target={target}
      verify={session.retry}
    />
  );
}
function Placement({
  client,
  target,
  verify,
}: {
  client: MealClient;
  target: PlacementTarget;
  verify: () => void;
}) {
  const [owner] = useState(() => mealPlacementOwner(client, target, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <PlacementContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening meal…</Note>
    </Page>
  );
}
function PlacementContent({
  runtime,
  verify,
}: {
  runtime: MealPlacementRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    router = useRouter();
  return (
    <Page>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Adding meal…" : "Loading current week…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <MealPlacementForm runtime={runtime} view={view} />
      <NativeAction
        label="Choose a saved recipe"
        disabled={view.busy || view.stage !== "ready" || !!view.receipt}
        onPress={() => router.push({ pathname: "/recipe-select", params: { ...runtime.target } })}
      />
      <PlacementRecovery runtime={runtime} view={view} verify={verify} />
      <NativeAction
        label="View this week"
        onPress={() =>
          router.dismissTo({
            pathname: "/meal-week",
            params: { weekStart: runtime.target.weekStart },
          })
        }
      />
    </Page>
  );
}
function PlacementRecovery({
  runtime,
  view,
  verify,
}: {
  runtime: MealPlacementRuntime;
  view: PlacementView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry this exact meal"
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
        label="Reload current week"
        disabled={view.busy}
        onPress={() => {
          void runtime.load();
        }}
      />
    );
  return null;
}
