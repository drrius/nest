import { useCallback, useState, useSyncExternalStore } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../session/provider";
import { setupOwner } from "../setup/owner";
import type { SetupClient } from "../setup/client";
import type { SetupRuntime } from "../setup/runtime";
import { Page, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SetupChoices } from "../components/setup-choices";
import { SignInCard } from "../components/sign-in-card";
export default function SetupScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.setup)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Setup
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.setup}
      verify={session.retry}
    />
  );
}
function Setup({ client, verify }: { client: SetupClient; verify: () => void }) {
  const [owner] = useState(() => setupOwner(client));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <SetupContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening setup…</Note>
    </Page>
  );
}
function SetupContent({ runtime, verify }: { runtime: SetupRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    router = useRouter();
  useFocusEffect(
    useCallback(() => {
      void runtime.load();
      return runtime.cancel;
    }, [runtime]),
  );
  return (
    <Page>
      <Section title="At your own pace">
        <Note>
          A few choices help Nest fit your household. You and your partner can set these up
          separately, now or whenever you need them.
        </Note>
      </Section>
      {view.error ? <Note>{view.error}</Note> : null}
      {view.busy ? <Note>Checking saved choices…</Note> : null}
      {view.verify ? (
        <NativeAction label="Verify account" disabled={view.busy} onPress={verify} />
      ) : (
        <SetupChoices status={view.status} />
      )}
      <NativeAction
        variant="quiet"
        label="Refresh setup status"
        disabled={view.busy}
        onPress={() => {
          void runtime.load();
        }}
      />
      <NativeAction
        variant="primary"
        label="Go to Today"
        onPress={() => router.push("/household")}
      />
    </Page>
  );
}
