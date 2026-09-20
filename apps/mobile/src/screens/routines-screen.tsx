import { useRef, useState, useSyncExternalStore } from "react";
import { Alert, FlatList, View } from "react-native";
import * as Crypto from "expo-crypto";
import type { Routine } from "@nest/contracts/routines";
import { useSession } from "../session/provider";
import { routineOwner } from "../routines/owner";
import type { RoutineClient, RoutineSnapshot } from "../routines/client";
import type { RoutineRuntime, RoutineView } from "../routines/runtime";
import { RoutineMenu } from "../routines/menu";
import { usePendingRoutineNavigation } from "../routines/use-pending-navigation";
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
  edit,
  changeState,
  disabled,
}: {
  routine: Routine;
  members: RoutineSnapshot["members"];
  edit: () => void;
  changeState: (action: "pause" | "resume" | "archive") => void;
  disabled: boolean;
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
      <RoutineMenu
        title={routine.definition.title}
        paused={routine.state === "paused"}
        disabled={disabled}
        edit={edit}
        changeState={changeState}
      />
    </Card>
  );
}
function Recovery({
  runtime,
  view,
  verify,
  reload,
}: {
  runtime: RoutineRuntime;
  view: RoutineView;
  verify: () => void;
  reload: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry exact change"
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
      onPress={reload}
    />
  );
}
function RoutineContent({ runtime, verify }: { runtime: RoutineRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return (
    <RoutineWorkspace
      key={`${view.saved}:${view.stage === "verify"}`}
      runtime={runtime}
      view={view}
      verify={verify}
    />
  );
}
type Mode = Routine | "create" | null;
function RoutineWorkspace({
  runtime,
  view,
  verify,
}: {
  runtime: RoutineRuntime;
  view: RoutineView;
  verify: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const list = useRef<FlatList<Routine>>(null);
  usePendingRoutineNavigation(!mode && view.pendingWrite);
  const changeState = (routine: Routine, action: "pause" | "resume" | "archive") => {
    const send = () => {
      list.current?.scrollToOffset({ offset: 0, animated: false });
      void runtime.setState(routine, action);
    };
    if (action !== "archive") return send();
    Alert.alert(
      "Archive routine?",
      `“${routine.definition.title}” will leave active routines. Its history will be kept.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: send },
      ],
    );
  };
  const colors = useQuiet();
  const discard = (action: () => void) => {
    if (!mode) return action();
    Alert.alert("Discard routine draft?", "Your unsaved changes will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: action },
    ]);
  };
  const reload = () =>
    discard(() => {
      setMode(null);
      void runtime.load();
    });
  return (
    <FlatList
      ref={list}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={view.snapshot?.routines ?? []}
      keyExtractor={(routine) => routine.routineId}
      renderItem={({ item }) => (
        <RoutineRow
          routine={item}
          members={view.snapshot?.members ?? []}
          changeState={(action) => changeState(item, action)}
          disabled={mode !== null || view.busy || view.stage !== "ready"}
          edit={() => {
            setMode(item);
            list.current?.scrollToOffset({ offset: 0, animated: false });
          }}
        />
      )}
      ListHeaderComponent={
        <RoutineHeader
          runtime={runtime}
          view={view}
          verify={verify}
          mode={mode}
          create={() => setMode("create")}
          reload={reload}
          close={() => discard(() => setMode(null))}
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
  mode,
  create,
  close,
  reload,
}: {
  runtime: RoutineRuntime;
  view: RoutineView;
  verify: () => void;
  mode: Mode;
  create: () => void;
  close: () => void;
  reload: () => void;
}) {
  return (
    <View style={{ gap: space.medium }}>
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.busy ? <Note>Working…</Note> : null}
      <Recovery runtime={runtime} view={view} verify={verify} reload={reload} />
      {view.snapshot?.members.length === 1 ? (
        <Note>Both household members must be available before creating routines.</Note>
      ) : null}
      <RoutineEditor runtime={runtime} view={view} mode={mode} create={create} close={close} />
    </View>
  );
}

function RoutineEditor({
  runtime,
  view,
  mode,
  create,
  close,
}: {
  runtime: RoutineRuntime;
  view: RoutineView;
  mode: Mode;
  create: () => void;
  close: () => void;
}) {
  return (
    <>
      {mode && view.snapshot ? (
        <>
          <RoutineForm
            runtime={runtime}
            view={view}
            routine={mode === "create" ? undefined : mode}
          />
          <NativeAction
            label="Cancel draft"
            disabled={view.busy || view.stage === "uncertain"}
            onPress={close}
          />
        </>
      ) : (
        <NativeAction
          label="Create routine"
          disabled={view.busy || view.stage !== "ready" || view.snapshot?.members.length !== 2}
          onPress={create}
        />
      )}
    </>
  );
}
