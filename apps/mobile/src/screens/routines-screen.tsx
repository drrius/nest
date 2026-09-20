import { useState, useSyncExternalStore } from "react";
import { FlatList, View } from "react-native";
import * as Crypto from "expo-crypto";
import type { Routine } from "@nest/contracts/routines";
import { useSession } from "../session/provider";
import { routineOwner } from "../routines/owner";
import type { RoutineClient, RoutineSnapshot } from "../routines/client";
import type { RoutineRuntime, RoutineView } from "../routines/runtime";
import { RoutineForm } from "../routines/form";
import { scheduleLabel } from "../routines/draft";
import { Card, Page, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
import { space, useQuiet } from "../theme";
export default function RoutinesScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.routines)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Routines
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.routines}
      verify={session.retry}
    />
  );
}
function Routines({ client, verify }: { client: RoutineClient; verify: () => void }) {
  const [owner] = useState(() => routineOwner(client, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <RoutineContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Loading routines…</Note>
    </Page>
  );
}
function RoutineRow({
  routine,
  members,
}: {
  routine: Routine;
  members: RoutineSnapshot["members"];
}) {
  const assignment = routine.definition.assignment;
  const memberId =
    assignment.policy === "shared"
      ? null
      : assignment.policy === "assigned"
        ? assignment.memberId
        : assignment.anchorMemberId;
  const name =
    members.find((member) => member.actorId === memberId)?.displayName ?? "Household member";
  const responsibility =
    assignment.policy === "shared"
      ? "Shared"
      : assignment.policy === "assigned"
        ? `Assigned to ${name}`
        : `Alternating · first turn ${name}`;
  return (
    <Card>
      <Section title={routine.definition.title} />
      <Note>{scheduleLabel(routine.definition.schedule)}</Note>
      <Note>
        {responsibility}
        {routine.state === "paused" ? " · Paused" : ""}
      </Note>
    </Card>
  );
}
function Recovery({
  runtime,
  view,
  verify,
}: {
  runtime: RoutineRuntime;
  view: RoutineView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry exact create"
        disabled={view.busy}
        onPress={() => void runtime.retry()}
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
      label={view.busy ? "Loading…" : "Reload routines"}
      disabled={view.busy}
      onPress={() => void runtime.load()}
    />
  );
}
function RoutineContent({ runtime, verify }: { runtime: RoutineRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const colors = useQuiet();
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={view.snapshot?.routines ?? []}
      keyExtractor={(routine) => routine.routineId}
      renderItem={({ item }) => (
        <RoutineRow routine={item} members={view.snapshot?.members ?? []} />
      )}
      ListHeaderComponent={
        <RoutineHeader
          key={view.created ?? "initial"}
          runtime={runtime}
          view={view}
          verify={verify}
        />
      }
      ListEmptyComponent={view.snapshot ? <Note>No active or paused routines yet.</Note> : null}
    />
  );
}

function RoutineHeader({
  runtime,
  view,
  verify,
}: {
  runtime: RoutineRuntime;
  view: RoutineView;
  verify: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <View style={{ gap: space.medium }}>
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.busy ? <Note>Working…</Note> : null}
      <Recovery runtime={runtime} view={view} verify={verify} />
      {view.snapshot?.members.length === 1 ? (
        <Note>Both household members must be available before creating routines.</Note>
      ) : null}
      {creating && view.snapshot ? (
        <RoutineForm runtime={runtime} view={view} />
      ) : (
        <NativeAction
          label="Create routine"
          disabled={view.busy || view.stage !== "ready" || view.snapshot?.members.length !== 2}
          onPress={() => setCreating(true)}
        />
      )}
    </View>
  );
}
