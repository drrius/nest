import { useState, useSyncExternalStore } from "react";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { notificationOwner } from "../notifications/owner";
import type { NotificationClient } from "../notifications/client";
import type { NotificationRuntime } from "../notifications/runtime";
import { NotificationFields } from "../components/notification-fields";
import { Page, Note } from "../components/page";
import { PreferencePanel } from "../components/preference-panel";
import { SignInCard } from "../components/sign-in-card";
export default function NotificationPreferencesScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.notification)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Preferences
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.notification}
      verify={session.retry}
    />
  );
}
function Preferences({ client, verify }: { client: NotificationClient; verify: () => void }) {
  const [owner] = useState(() => notificationOwner(client, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <PreferencesContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Loading notification preferences…</Note>
    </Page>
  );
}
function PreferencesContent({
  runtime,
  verify,
}: {
  runtime: NotificationRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return (
    <PreferencePanel view={view} actions={{ load: runtime.load, retry: runtime.retry, verify }}>
      <NotificationFields key={view.generation} runtime={runtime} view={view} />
    </PreferencePanel>
  );
}
