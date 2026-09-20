import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { mealRemovalOwner } from "../meals/removal-owner";
import { removalTarget } from "../meals/removal-target";
import type { MealClient } from "../meals/client";
import type { MealRemovalRuntime, RemovalTarget, RemovalView } from "../meals/removal-runtime";
import { MealRemovalForm } from "../meals/removal-form";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function MealRemovalScreen() {
  const session = useSession(),
    target = removalTarget(useLocalSearchParams());
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (!target)
    return (
      <Page>
        <Note>Choose a meal from the current week to remove it.</Note>
        <Link href="/meal-week">Open Meals</Link>
      </Page>
    );
  return (
    <Removal
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.weekStart}:${target.entryId}`}
      client={session.meals}
      target={target}
      verify={session.retry}
    />
  );
}
function Removal({
  client,
  target,
  verify,
}: {
  client: MealClient;
  target: RemovalTarget;
  verify: () => void;
}) {
  const [owner] = useState(() => mealRemovalOwner(client, target, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <RemovalContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening meal…</Note>
    </Page>
  );
}
function RemovalContent({ runtime, verify }: { runtime: MealRemovalRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    router = useRouter();
  return (
    <Page>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Removing meal…" : "Loading current week…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <MealRemovalForm runtime={runtime} view={view} />
      <RemovalRecovery runtime={runtime} view={view} verify={verify} />
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
function RemovalRecovery({
  runtime,
  view,
  verify,
}: {
  runtime: MealRemovalRuntime;
  view: RemovalView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry this exact removal"
        disabled={view.busy}
        onPress={() => {
          void runtime.retry();
        }}
      />
    );
  if (view.stage === "verify")
    return (
      <NativeAction
        label="Verify account"
        disabled={view.busy}
        onPress={() => {
          verify();
          void runtime.load();
        }}
      />
    );
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
