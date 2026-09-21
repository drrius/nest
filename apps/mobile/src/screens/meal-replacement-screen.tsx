import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { mealReplacementOwner } from "../meals/replacement-owner";
import { replacementTarget } from "../meals/replacement-target";
import type { MealClient } from "../meals/client";
import type {
  MealReplacementRuntime,
  ReplacementTarget,
  ReplacementView,
} from "../meals/replacement-runtime";
import { MealReplacementForm } from "../meals/replacement-form";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function MealReplacementScreen() {
  const session = useSession(),
    target = replacementTarget(useLocalSearchParams());
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (!target)
    return (
      <Page>
        <Note>Choose a meal from the current week to replace it.</Note>
        <Link href="/meal-week">Open Meals</Link>
      </Page>
    );
  return (
    <Replacement
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.entryId}:${target.weekStart}:${target.date}:${target.slot}`}
      client={session.meals}
      target={target}
      verify={session.retry}
    />
  );
}
function Replacement({
  client,
  target,
  verify,
}: {
  client: MealClient;
  target: ReplacementTarget;
  verify: () => void;
}) {
  const [owner] = useState(() => mealReplacementOwner(client, target, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ReplacementContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening meal…</Note>
    </Page>
  );
}
function ReplacementContent({
  runtime,
  verify,
}: {
  runtime: MealReplacementRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    router = useRouter();
  return (
    <Page>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Replacing meal…" : "Loading current week…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <MealReplacementForm runtime={runtime} view={view} />
      <NativeAction
        label="Choose a saved recipe"
        disabled={view.busy || view.stage !== "ready" || !!view.receipt}
        onPress={() => router.push({ pathname: "/recipe-select", params: { ...runtime.target } })}
      />
      <ReplacementRecovery runtime={runtime} view={view} verify={verify} />
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
function ReplacementRecovery({
  runtime,
  view,
  verify,
}: {
  runtime: MealReplacementRuntime;
  view: ReplacementView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry this exact replacement"
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
