import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { mealPreparationOwner } from "../meals/preparation-owner";
import { preparationTarget } from "../meals/preparation-target";
import { PreparationForm } from "../meals/preparation-form";
import type {
  MealPreparationRuntime,
  PreparationView,
  PreparationTarget,
} from "../meals/preparation-runtime";
import type { MealClient } from "../meals/client";
import type { RoutineClient } from "../routines/client";
import { Page, Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function MealPreparationScreen() {
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
        <Note>Choose a meal to view its preparation.</Note>
        <Link href="/meal-week">Open Meals</Link>
      </Page>
    );
  return (
    <Preparation
      key={`${session.state.member.userId}:${session.state.member.householdId}:${target.weekStart}:${target.entryId}`}
      meals={session.meals}
      routines={session.routines}
      target={target}
      verify={session.retry}
    />
  );
}
function Preparation({
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
    mealPreparationOwner({ meals, routines }, target, Crypto.randomUUID),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <PreparationContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening preparation…</Note>
    </Page>
  );
}
function PreparationContent({
  runtime,
  verify,
}: {
  runtime: MealPreparationRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return (
    <Page>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Creating preparation…" : "Loading current preparation…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <PreparationBody runtime={runtime} view={view} />
      <PreparationRecovery runtime={runtime} view={view} verify={verify} />
      <Link href={{ pathname: "/meal-week", params: { weekStart: runtime.target.weekStart } }}>
        Back to Meals
      </Link>
    </Page>
  );
}
function PreparationBody({
  runtime,
  view,
}: {
  runtime: MealPreparationRuntime;
  view: PreparationView;
}) {
  const snapshot = view.snapshot;
  if (!snapshot) return null;
  return (
    <>
      {view.stage === "reload" ? (
        <Note>Previously loaded details · reload to check current changes.</Note>
      ) : null}
      {snapshot.entry ? (
        <Card>
          <Section title={snapshot.entry.title} />
          <Note>Meal planned for {snapshot.entry.date}</Note>
        </Card>
      ) : null}
      {!snapshot.entry ? (
        <Note>This meal is no longer in this week. Open Meals to find its current plan.</Note>
      ) : null}
      {snapshot.preparation ? <PreparationDetails view={view} /> : null}
      {snapshot.entry && !snapshot.preparation && !view.receipt ? (
        <PreparationForm runtime={runtime} view={view} />
      ) : null}
    </>
  );
}
function PreparationDetails({ view }: { view: PreparationView }) {
  const task = view.snapshot!.preparation!;
  const person = view.members.find(
    (member) => member.actorId === task.plannedAssigneeId,
  )?.displayName;
  return (
    <Card>
      <Section title={task.title} />
      {task.instructions !== null ? (
        <Note>{task.instructions || "No instructions added."}</Note>
      ) : (
        <Note>No instructions added.</Note>
      )}
      <Note>
        Due {task.dueOn} · {task.status} · {task.state}
      </Note>
      <Note>
        {task.assignment.policy === "shared"
          ? "Shared responsibility"
          : `Responsible person: ${person ?? "Household member"}`}
      </Note>
      {task.state !== "archived" ? (
        <Link
          href={{
            pathname: "/meal-preparation-edit",
            params: { entryId: view.snapshot!.entryId, weekStart: view.snapshot!.weekStart },
          }}
        >
          Edit preparation
        </Link>
      ) : null}
      <Link href="/household">Open Today to view household work</Link>
    </Card>
  );
}
function PreparationRecovery({
  runtime,
  view,
  verify,
}: {
  runtime: MealPreparationRuntime;
  view: PreparationView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry this exact preparation"
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
  return (
    <NativeAction
      label="Reload preparation"
      disabled={view.busy}
      onPress={() => {
        void runtime.load();
      }}
    />
  );
}
