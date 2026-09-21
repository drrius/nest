import { calendarChoreOwner } from "../calendar/chore-owner";
import { calendarChoreOperations } from "../calendar/chore-operations";
import { useState, useSyncExternalStore } from "react";
import { expoCalendarPort } from "../calendar/expo-calendar";
import { expoAgendaPort } from "../calendar/expo-agenda";
import { agendaOperations } from "../calendar/agenda-operations";
import { agendaOwner } from "../calendar/agenda-owner";
import { localDate } from "../calendar/agenda-day";
import { AgendaContent } from "../calendar/agenda-content";
import { partnerOwner } from "../calendar/partner-owner";
import { partnerOperations } from "../calendar/partner-operations";
import type { CalendarClient } from "../calendar/client";
import { useAgendaActivity } from "../calendar/use-agenda-activity";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function CalendarScreen() {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.calendar)
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
      client={session.calendar}
      verify={session.retry}
    />
  );
}
function CalendarAccount({
  account,
  client,
  verify,
}: {
  account: OfflineAccount;
  client: CalendarClient;
  verify: () => void;
}) {
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
  const [sharedOwner] = useState(() => partnerOwner(partnerOperations(account, client), Date.now));
  const partner = useSyncExternalStore(sharedOwner.subscribe, sharedOwner.getSnapshot);
  const [workOwner] = useState(() =>
    calendarChoreOwner(calendarChoreOperations(account, client), localDate(new Date())),
  );
  const chores = useSyncExternalStore(workOwner.subscribe, workOwner.getSnapshot);
  useAgendaActivity(runtime, partner, chores);
  return runtime && partner && chores ? (
    <AgendaContent runtime={runtime} partner={partner} chores={chores} verify={verify} />
  ) : (
    <Page>
      <Note>Opening your agenda…</Note>
    </Page>
  );
}
