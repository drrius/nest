import { type ReactNode, useState, useSyncExternalStore } from "react";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { notificationOwner } from "../notifications/owner";
import type { NotificationClient } from "../notifications/client";
import type { NotificationRuntime } from "../notifications/runtime";
import { PushEnrollment } from "../components/push-enrollment";
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
    >
      {session.pushDevices ? (
        <PushEnrollment
          account={{
            actor: session.state.member.userId,
            household: session.state.member.householdId,
          }}
          client={session.pushDevices}
        />
      ) : null}
    </Preferences>
  );
}
function Preferences({
  client,
  verify,
  children,
}: {
  client: NotificationClient;
  verify: () => void;
  children: ReactNode;
}) {
  const [owner] = useState(() => notificationOwner(client, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <PreferencesContent runtime={runtime} verify={verify}>
      {children}
    </PreferencesContent>
  ) : (
    <Page>
      <Note>Loading notification preferences…</Note>
    </Page>
  );
}
function PreferencesContent({
  runtime,
  verify,
  children,
}: {
  children: ReactNode;
  runtime: NotificationRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return (
    <PreferencePanel view={view} actions={{ load: runtime.load, retry: runtime.retry, verify }}>
      <NotificationFields key={view.generation} runtime={runtime} view={view} />
      {children}
    </PreferencePanel>
  );
}
