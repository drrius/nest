import type { MealWeekSnapshot } from "@nest/contracts/meals";
import type { CookingClient } from "../cooking/client";
import { allMealSlots, useVisibleMealSlots } from "../meals/use-visible-slots";
import { useState, useSyncExternalStore } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { householdDate } from "@nest/domain/calendar";
import { requestedMealWeek } from "../meals/route-week";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import { mealWeekOwner } from "../meals/owner";
import type { MealClient } from "../meals/client";
import type { MealWeekRuntime } from "../meals/runtime";
import { useMealWeekRefresh } from "../meals/use-refresh";
import { MealWeekBoard, WeekNavigation } from "../meals/board";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
import { space, useQuiet } from "../theme";
export default function MealWeekScreen() {
  const params = useLocalSearchParams();
  const weekStart = requestedMealWeek(params.weekStart, householdDate(new Date()));
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.meals || !session.cooking)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (offline.state.status !== "ready")
    return (
      <Page>
        <Note>
          {offline.state.status === "error"
            ? "Could not open saved meals."
            : "Opening saved meals…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry saved meals" onPress={offline.retry} />
        ) : null}
      </Page>
    );
  return (
    <Meals
      key={`${offline.state.account.session.lease}:${weekStart}`}
      weekStart={weekStart}
      account={offline.state.account}
      client={session.meals}
      cooking={session.cooking}
      verify={session.retry}
    />
  );
}
function Meals({
  client,
  account,
  verify,
  cooking,
  weekStart,
}: {
  weekStart: string;
  client: MealClient;
  cooking: CookingClient;
  account: OfflineAccount;
  verify: () => void;
}) {
  const [owner] = useState(() => mealWeekOwner(client, account, weekStart));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <WeekContent runtime={runtime} verify={verify} cooking={cooking} />
  ) : (
    <Page>
      <Note>Loading meals…</Note>
    </Page>
  );
}
function WeekContent({
  runtime,
  verify,
  cooking,
}: {
  runtime: MealWeekRuntime;
  verify: () => void;
  cooking: CookingClient;
}) {
  const router = useRouter();
  const visibility = useVisibleMealSlots(cooking);
  const [showAll, setShowAll] = useState(false);
  const slots = showAll ? allMealSlots : visibility.slots;
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const colors = useQuiet();
  useMealWeekRefresh(runtime);
  if (view.access === "verify")
    return (
      <Page>
        <Note>{view.notice}</Note>
        <NativeAction label="Verify account" onPress={verify} />
        <NativeAction
          label="Refresh meals"
          disabled={view.busy}
          onPress={() => {
            void runtime.load();
          }}
        />
      </Page>
    );
  return (
    <Page>
      <WeekLinks weekStart={view.weekStart} />
      <WeekNavigation
        weekStart={view.weekStart}
        select={(week) => {
          router.setParams({ weekStart: week });
        }}
      />
      {view.busy ? <Note>Refreshing week…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.snapshot && !view.fresh ? <Note>Saved on this iPhone · may be out of date</Note> : null}
      <NativeAction
        label="Refresh week"
        disabled={view.busy}
        onPress={() => {
          void runtime.load();
        }}
      />
      <Link href="/checklist" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Groceries
      </Link>
      <Link
        href="/cooking-preferences"
        style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
      >
        Household cooking preferences
      </Link>
      <SlotControls
        snapshot={view.snapshot}
        visibility={visibility}
        showAll={showAll}
        toggle={() => setShowAll(!showAll)}
      />
      {view.snapshot ? (
        <MealWeekBoard
          snapshot={view.snapshot}
          visibleSlots={slots}
          canAdd={view.fresh && !view.busy}
        />
      ) : null}
    </Page>
  );
}

function SlotControls({
  snapshot,
  visibility,
  showAll,
  toggle,
}: {
  snapshot: MealWeekSnapshot | null;
  visibility: ReturnType<typeof useVisibleMealSlots>;
  showAll: boolean;
  toggle: () => void;
}) {
  const hidden =
    !showAll && snapshot?.entries.some((entry) => !visibility.slots.includes(entry.slot));
  return (
    <>
      {visibility.notice ? <Note>{visibility.notice}</Note> : null}
      <NativeAction label={showAll ? "Use configured slots" : "Show all slots"} onPress={toggle} />
      {hidden ? (
        <Note>There are saved meals in hidden slots. Show all slots to view them.</Note>
      ) : null}
    </>
  );
}

function WeekLinks({ weekStart }: { weekStart: string }) {
  const colors = useQuiet();
  return (
    <>
      <Link href="/meal-library" style={{ color: colors.accent, fontSize: 17 }}>
        Saved meals and recipes
      </Link>
      <Link
        href={{ pathname: "/meal-proposal", params: { weekStart: weekStart } }}
        style={{ color: colors.accent, fontSize: 17, paddingVertical: space.medium }}
      >
        Plan with AI or resume a preview
      </Link>
      <Link
        href={{ pathname: "/meal-ingredients", params: { weekStart: weekStart } }}
        style={{ color: colors.accent, fontSize: 17, paddingVertical: space.medium }}
      >
        Review ingredients for groceries
      </Link>
    </>
  );
}
