import { useCallback, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { calendarRenewalOwner } from "../calendar/renewal-owner";
import { calendarRenewalOperations } from "../calendar/renewal-operations";
import { CalendarRenewalRow } from "../calendar/renewal-content";
import type { CalendarRenewalRuntime, CalendarRenewalView } from "../calendar/renewal-runtime";
import type { CalendarClient } from "../calendar/client";
import type { OfflineAccount } from "../offline/owner";
import { useOfflineAccount } from "../offline/provider";
import { useSession } from "../session/provider";
import { Section, Note } from "../components/page";
import { QuietAction } from "../components/quiet-action";
import { NativeAction } from "../components/native-action";

export function TodayRenewals({ date }: { date: string }) {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.calendar) return null;
  return (
    <>
      {offline.state.status === "ready" ? (
        <RenewalOwner
          key={`${offline.state.account.session.lease}:${date}`}
          account={offline.state.account}
          client={session.calendar}
          date={date}
          verify={session.retry}
        />
      ) : (
        <>
          <Note>
            {offline.state.status === "error" ? "Could not open your account." : "Opening account…"}
          </Note>
          {offline.state.status === "error" ? (
            <NativeAction label="Retry account" onPress={offline.retry} />
          ) : null}
        </>
      )}
    </>
  );
}
function RenewalOwner({
  account,
  client,
  date,
  verify,
}: {
  account: OfflineAccount;
  client: CalendarClient;
  date: string;
  verify: () => void;
}) {
  const [owner] = useState(() =>
    calendarRenewalOwner(calendarRenewalOperations(account, client), date),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? <Renewals runtime={runtime} verify={verify} /> : <Note>Loading renewals…</Note>;
}
function Renewals({ runtime, verify }: { runtime: CalendarRenewalRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      void runtime.setEnabled(true);
      const activity = () => {
        void runtime.setActive(AppState.currentState === "active");
      };
      activity();
      const subscription = AppState.addEventListener("change", activity);
      return () => {
        subscription.remove();
        void runtime.setActive(false);
      };
    }, [runtime]),
  );
  if (noRenewalsToday(view)) return null;
  return (
    <Section title="Renewals today">
      {view.busy ? <Note>Refreshing renewals…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <RenewalRows view={view} />
      {view.notice || !view.access ? (
        <NativeAction
          label={view.access ? "Refresh renewals" : "Verify account"}
          disabled={view.busy || !view.active}
          onPress={() => {
            if (view.access) void runtime.refresh();
            else verify();
          }}
        />
      ) : null}
      <QuietAction label="Manage renewals" onPress={() => router.push("/renewals")} />
    </Section>
  );
}

function RenewalRows({ view }: { view: CalendarRenewalView }) {
  return (
    <>
      {view.rows?.slice(0, 3).map((row) => (
        <CalendarRenewalRow key={row.renewalId} row={row} date={view.date} />
      ))}
      {view.rows?.length === 0 ? <Note>No renewals or cancellation deadlines today.</Note> : null}
      {view.next || (view.rows?.length ?? 0) > 3 ? (
        <Note>More renewals are available in Manage renewals.</Note>
      ) : null}
    </>
  );
}

function noRenewalsToday(view: CalendarRenewalView) {
  return view.access && view.rows?.length === 0 && !view.notice && !view.next;
}
