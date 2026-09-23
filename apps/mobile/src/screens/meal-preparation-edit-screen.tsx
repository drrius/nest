import { AccountRecovery } from "../components/account-recovery";
import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { mealPreparationEditOwner } from "../meals/preparation-edit-owner";
import { preparationTarget } from "../meals/preparation-target";
import { PreparationEditForm } from "../meals/preparation-edit-form";
import type {
  MealPreparationEditRuntime,
  PreparationEditView,
} from "../meals/preparation-edit-runtime";
import type { PreparationTarget } from "../meals/preparation-runtime";
import type { MealClient } from "../meals/client";
import type { RoutineClient } from "../routines/client";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function MealPreparationEditScreen() {
  const session = useSession(),
    target = preparationTarget(useLocalSearchParams());
  if (session.state.status !== "ready" || !session.meals || !session.routines)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (!target)
    return (
      <Page>
        <Note>Choose a meal to edit its preparation.</Note>
        <Link href="/meal-week">Open Meals</Link>
      </Page>
    );
  return (
    <Editor
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.weekStart}:${target.entryId}`}
      meals={session.meals}
      routines={session.routines}
      target={target}
      verify={session.retry}
    />
  );
}
function Editor({
  meals,
  routines,
  target,
  verify,
}: {
  meals: MealClient;
  routines: RoutineClient;
  target: PreparationTarget;
  verify: () => void;
}) {
  const [owner] = useState(() =>
    mealPreparationEditOwner({ meals, routines }, target, Crypto.randomUUID),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <EditorContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening preparation editor…</Note>
    </Page>
  );
}
function EditorContent({
  runtime,
  verify,
}: {
  runtime: MealPreparationEditRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return (
    <Page>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Saving preparation…" : "Loading current preparation…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <EditorBody runtime={runtime} view={view} />
      <EditRecovery runtime={runtime} view={view} verify={verify} />
      <Link href={{ pathname: "/meal-preparation", params: runtime.target }}>View preparation</Link>
    </Page>
  );
}
function EditorBody({
  runtime,
  view,
}: {
  runtime: MealPreparationEditRuntime;
  view: PreparationEditView;
}) {
  const snapshot = view.snapshot;
  if (!snapshot) return null;
  if (!snapshot.entry)
    return <Note>This meal is no longer in this week. Open Meals to find its current plan.</Note>;
  if (!snapshot.preparation) return <Note>This meal has no linked preparation to edit.</Note>;
  if (view.receipt) return <Note>Changes saved. Open preparation to see the current task.</Note>;
  return (
    <>
      <Note>
        {snapshot.entry.title} · {snapshot.entry.date}
      </Note>
      {view.stage === "reload" ? (
        <Note>Previously loaded details · reload before editing again.</Note>
      ) : null}
      <PreparationEditForm key={view.generation} runtime={runtime} view={view} />
    </>
  );
}
function EditRecovery({
  runtime,
  view,
  verify,
}: {
  runtime: MealPreparationEditRuntime;
  view: PreparationEditView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry this exact edit"
        disabled={view.busy}
        onPress={() => {
          void runtime.retry();
        }}
      />
    );
  if (view.stage === "verify")
    return <AccountRecovery verify={verify} busy={view.busy} reload={runtime.load} />;
  if (!view.snapshot?.preparation || view.receipt)
    return (
      <NativeAction
        label="Reload current preparation"
        disabled={view.busy}
        onPress={() => {
          void runtime.load();
        }}
      />
    );
  return null;
}
