import { useState, useSyncExternalStore } from "react";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { cookingOwner } from "../cooking/owner";
import type { CookingClient } from "../cooking/client";
import type { CookingRuntime } from "../cooking/runtime";
import { CookingFields } from "../components/cooking-fields";
import { Page, Note } from "../components/page";
import { PreferencePanel } from "../components/preference-panel";
import { SignInCard } from "../components/sign-in-card";
export default function CookingPreferencesScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.cooking)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Preferences
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.cooking}
      verify={session.retry}
    />
  );
}
function Preferences({ client, verify }: { client: CookingClient; verify: () => void }) {
  const [owner] = useState(() => cookingOwner(client, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <PreferencesContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Loading cooking preferences…</Note>
    </Page>
  );
}
function PreferencesContent({ runtime, verify }: { runtime: CookingRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return (
    <PreferencePanel view={view} actions={{ load: runtime.load, retry: runtime.retry, verify }}>
      <CookingFields key={view.generation} runtime={runtime} view={view} />
    </PreferencePanel>
  );
}
