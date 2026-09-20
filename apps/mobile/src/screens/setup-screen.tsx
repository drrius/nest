import { useCallback, useState, useSyncExternalStore } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../session/provider";
import { setupOwner } from "../setup/owner";
import type { SetupClient } from "../setup/client";
import type { SetupRuntime } from "../setup/runtime";
import { Page, Note, Card, Section } from "../components/page";
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
          Set up everything here, or start quickly and return when you need a feature. You and your
          partner make your own personal choices. Optional setup never blocks Today.
        </Note>
      </Section>
      {view.error ? <Note>{view.error}</Note> : null}
      {view.busy ? <Note>Checking saved choices…</Note> : null}
      {view.verify ? (
        <NativeAction
          label="Verify account"
          disabled={view.busy}
          onPress={() => {
            verify();
            void runtime.load();
          }}
        />
      ) : (
        <>
          <SetupChoices status={view.status} />
          <NativeAction
            label="Refresh setup status"
            disabled={view.busy}
            onPress={() => {
              void runtime.load();
            }}
          />
        </>
      )}
      <Card>
        <Section title="Start with today" />
        <Note>
          Keep your current choices and come back through Profile and settings whenever you like.
        </Note>
        <NativeAction label="Start quickly" onPress={() => router.push("/household")} />
      </Card>
    </Page>
  );
}
