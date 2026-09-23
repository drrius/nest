import { useState, useSyncExternalStore } from "react";
import { Link } from "expo-router";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import { agendaOwner } from "../calendar/agenda-owner";
import { agendaOperations } from "../calendar/agenda-operations";
import { expoAgendaPort } from "../calendar/expo-agenda";
import { expoCalendarPort } from "../calendar/expo-calendar";
import { localDate } from "../calendar/agenda-day";
import type { AgendaRuntime } from "../calendar/agenda-runtime";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";
import { useTodayAgenda } from "./use-today-agenda";
import { TodayCalendarRows } from "./calendar-rows";
export function TodayCalendar({ now }: { now: number }) {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || process.env.EXPO_OS !== "ios") return null;
  if (offline.state.status !== "ready")
    return (
      <Section title="Your calendar today">
        <Note>
          {offline.state.status === "error"
            ? "Could not open your calendar choices."
            : "Opening your calendar choices…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry calendar choices" onPress={offline.retry} />
        ) : null}
      </Section>
    );
  const date = localDate(new Date(now));
  return (
    <CalendarOwner
      key={`${offline.state.account.session.lease}:${date}`}
      account={offline.state.account}
      date={date}
      now={now}
    />
  );
}
function CalendarOwner({
  account,
  date,
  now,
}: {
  account: OfflineAccount;
  date: string;
  now: number;
}) {
  const [owner] = useState(() =>
    agendaOwner(
      agendaOperations(account, {
        ...expoAgendaPort,
        requestPermission: () => expoCalendarPort.requestPermission(),
      }),
      date,
    ),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <Calendar runtime={runtime} now={now} />
  ) : (
    <Section title="Your calendar today">
      <Note>Opening your agenda…</Note>
    </Section>
  );
}
function Calendar({ runtime, now }: { runtime: AgendaRuntime; now: number }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const session = useSession(),
    colors = useQuiet();
  useTodayAgenda(runtime, now);
  return (
    <Section title="Your calendar today">
      {!view.access ? (
        <>
          <Note>Verify your account before opening your calendar.</Note>
          <NativeAction label="Verify account" onPress={session.retry} />
        </>
      ) : (
        <TodayCalendarRows view={view} now={now} />
      )}
      <Link
        href={{ pathname: "/agenda", params: { date: view.date } }}
        style={{ color: colors.accent, fontSize: 17, paddingVertical: 12 }}
      >
        Open Calendar
      </Link>
    </Section>
  );
}
