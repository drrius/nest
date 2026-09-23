import { useState, useSyncExternalStore } from "react";
import { Link } from "expo-router";
import type { MealClient } from "../meals/client";
import type { MealWeekRuntime } from "../meals/runtime";
import type { OfflineAccount } from "../offline/owner";
import { mealWeekOwner } from "../meals/owner";
import { requestedMealWeek } from "../meals/route-week";
import { useMealWeekRefresh } from "../meals/use-refresh";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { TodayMealRows } from "./meal-rows";
export function TodayMeals({ date }: { date: string }) {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.meals) return null;
  if (offline.state.status !== "ready")
    return (
      <Section title="Meals today">
        <Note>
          {offline.state.status === "error"
            ? "Could not open saved meals."
            : "Opening saved meals…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry saved meals" onPress={offline.retry} />
        ) : null}
      </Section>
    );
  return (
    <MealOwner
      key={`${offline.state.account.session.lease}:${date}`}
      date={date}
      client={session.meals}
      account={offline.state.account}
    />
  );
}
function MealOwner({
  date,
  client,
  account,
}: {
  date: string;
  client: MealClient;
  account: OfflineAccount;
}) {
  const [owner] = useState(() =>
    mealWeekOwner(client, account, requestedMealWeek(undefined, date)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <Meals runtime={runtime} date={date} />
  ) : (
    <Section title="Meals today">
      <Note>Loading meals…</Note>
    </Section>
  );
}
function Meals({ runtime, date }: { runtime: MealWeekRuntime; date: string }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const session = useSession();
  useMealWeekRefresh(runtime);
  if (view.access === "verify")
    return (
      <Section title="Meals today">
        <Note>Verify your account before viewing meals.</Note>
        <NativeAction label="Verify account" onPress={session.retry} />
        <NativeAction
          label="Refresh meals"
          disabled={view.busy}
          onPress={() => {
            void runtime.load();
          }}
        />
      </Section>
    );
  return (
    <Section title="Meals today">
      {view.busy ? <Note>Refreshing meals…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.snapshot && !view.fresh ? <Note>Saved on this iPhone · may be out of date</Note> : null}
      {view.snapshot ? <TodayMealRows snapshot={view.snapshot} date={date} /> : null}
      {!view.snapshot && !view.busy ? (
        <NativeAction
          label="Retry meals"
          onPress={() => {
            void runtime.load();
          }}
        />
      ) : null}
      <Link href={{ pathname: "/meal-week", params: { weekStart: view.weekStart } }}>
        Open meal week
      </Link>
    </Section>
  );
}
