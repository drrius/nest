import { useState, useSyncExternalStore } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { foodOwner } from "../food/owner";
import type { FoodClient } from "../food/client";
import type { FoodRuntime } from "../food/runtime";
import { FoodFields } from "../components/food-fields";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function FoodPreferencesScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.food)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Preferences
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.food}
      verify={session.retry}
    />
  );
}
function Preferences({ client, verify }: { client: FoodClient; verify: () => void }) {
  const [owner] = useState(() => foodOwner(client, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <PreferencesContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Loading food preferences…</Note>
    </Page>
  );
}
function PreferencesContent({ runtime, verify }: { runtime: FoodRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const reload = () => {
    void runtime.load();
  };
  const review = () =>
    Alert.alert(
      "Reload saved preferences?",
      "This replaces the unsaved form with your current saved preferences.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reload", onPress: reload },
      ],
    );
  return (
    <Page>
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.stage === "verify" ? (
        <NativeAction
          label="Verify account"
          disabled={view.busy}
          onPress={() => {
            verify();
            reload();
          }}
        />
      ) : (
        <>
          {view.loaded ? (
            <FoodFields key={view.generation} runtime={runtime} view={view} />
          ) : (
            <Note>
              {view.busy ? "Loading food preferences…" : "Preferences have not been loaded."}
            </Note>
          )}
          {view.stage === "uncertain" ? (
            <NativeAction
              label="Retry exact save"
              disabled={view.busy}
              onPress={() => {
                void runtime.retry();
              }}
            />
          ) : null}
          {view.stage === "conflict" || view.stage === "reload" || !view.loaded ? (
            <NativeAction
              label="Reload saved preferences"
              disabled={view.busy}
              onPress={view.stage === "conflict" ? review : reload}
            />
          ) : null}
        </>
      )}
      <Note>
        Changes require a connection. Private drafts are kept only while this form is open.
      </Note>
    </Page>
  );
}
