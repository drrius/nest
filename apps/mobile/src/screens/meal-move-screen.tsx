import { AccountRecovery } from "../components/account-recovery";
import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { mealMoveOwner } from "../meals/move-owner";
import { moveTarget } from "../meals/move-target";
import type { MealClient } from "../meals/client";
import type { MealMoveRuntime, MoveTarget, MoveView } from "../meals/move-runtime";
import { MealMoveForm } from "../meals/move-form";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function MealMoveScreen() {
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
        <Note>Choose a meal from the current week to move it.</Note>
        <Link href="/meal-week">Open Meals</Link>
      </Page>
    );
  return (
    <Move
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.sourceWeekStart}:${target.entryId}`}
      client={session.meals}
      target={target}
      verify={session.retry}
    />
  );
}
function Move({
  client,
  target,
  verify,
}: {
  client: MealClient;
  target: MoveTarget;
  verify: () => void;
}) {
  const [owner] = useState(() => mealMoveOwner(client, target, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <MoveContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening meal…</Note>
    </Page>
  );
}
function MoveContent({ runtime, verify }: { runtime: MealMoveRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    router = useRouter();
  return (
    <Page>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Moving meal…" : "Loading current weeks…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <MealMoveForm runtime={runtime} view={view} />
      <MoveRecovery runtime={runtime} view={view} verify={verify} />
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
function MoveRecovery({
  runtime,
  view,
  verify,
}: {
  runtime: MealMoveRuntime;
  view: MoveView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry this exact move"
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
