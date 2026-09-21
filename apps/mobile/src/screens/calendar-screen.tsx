import { useCallback, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { expoCalendarPort } from "../calendar/expo-calendar";
import { expoAgendaPort } from "../calendar/expo-agenda";
import { agendaOperations } from "../calendar/agenda-operations";
import { agendaOwner } from "../calendar/agenda-owner";
import { localDate } from "../calendar/agenda-day";
import { AgendaContent } from "../calendar/agenda-content";
import type { AgendaRuntime } from "../calendar/agenda-runtime";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function CalendarScreen() {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready")
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (process.env.EXPO_OS !== "ios")
    return (
      <Page>
        <Note>Device calendars require an iPhone development build.</Note>
      </Page>
    );
  if (offline.state.status !== "ready")
    return (
      <Page>
        <Note>
          {offline.state.status === "error"
            ? "Could not open your saved calendar choices."
            : "Opening your calendar choices…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry" onPress={offline.retry} />
        ) : null}
      </Page>
    );
  return (
    <CalendarAccount
      key={offline.state.account.session.lease}
      account={offline.state.account}
      verify={session.retry}
    />
  );
}
function CalendarAccount({ account, verify }: { account: OfflineAccount; verify: () => void }) {
  const [owner] = useState(() =>
    agendaOwner(
      agendaOperations(account, {
        ...expoAgendaPort,
        requestPermission: () => expoCalendarPort.requestPermission(),
      }),
      localDate(new Date()),
    ),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  useAgendaActivity(runtime);
  return runtime ? (
    <AgendaContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening your agenda…</Note>
    </Page>
  );
}
function useAgendaActivity(runtime: AgendaRuntime | null) {
  useFocusEffect(
    useCallback(() => {
      if (!runtime) return;
      const activity = () => runtime.setActive(AppState.currentState === "active");
      activity();
      const subscription = AppState.addEventListener("change", activity);
      const timer = setInterval(() => {
        void runtime.refresh();
      }, 60000);
      return () => {
        clearInterval(timer);
        subscription.remove();
        runtime.setActive(false);
      };
    }, [runtime]),
  );
}
