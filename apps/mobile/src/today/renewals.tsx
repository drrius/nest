import { useCallback, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { calendarRenewalOwner } from "../calendar/renewal-owner";
import { calendarRenewalOperations } from "../calendar/renewal-operations";
import { CalendarRenewalRow } from "../calendar/renewal-content";
import type { CalendarRenewalRuntime, CalendarRenewalView } from "../calendar/renewal-runtime";
import type { CalendarClient } from "../calendar/client";
import type { OfflineAccount } from "../offline/owner";
import { useOfflineAccount } from "../offline/provider";
import { useSession } from "../session/provider";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";

export function TodayRenewals({ date }: { date: string }) {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.calendar) return null;
  return (
    <Section title="Household renewals today">
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
      <Link href="/renewals">Manage renewals</Link>
    </Section>
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
  return (
    <>
      {view.busy ? <Note>Refreshing renewals…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <RenewalRows view={view} />
      <NativeAction
        label={view.access ? "Refresh renewals" : "Verify account"}
        disabled={view.busy || !view.active}
        onPress={() => {
          if (view.access) void runtime.refresh();
          else verify();
        }}
      />
    </>
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
