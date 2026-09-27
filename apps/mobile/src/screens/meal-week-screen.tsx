import type { MealWeekSnapshot } from "@nest/contracts/meals";
import type { CookingClient } from "../cooking/client";
import { allMealSlots, useVisibleMealSlots } from "../meals/use-visible-slots";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { MealSetupPrompt } from "../setup/meal-setup-prompt";
import { QuietAction } from "../components/quiet-action";
import { WeekToolbar } from "../meals/week-toolbar";
import { TodayGroceries } from "../today/groceries";
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
      <Note>Good food. One less daily decision.</Note>
      <WeekNavigation
        weekStart={view.weekStart}
        select={(week) => {
          router.setParams({ weekStart: week });
        }}
      />
      <WeekToolbar
        weekStart={view.weekStart}
        busy={view.busy}
        refresh={() => {
          void runtime.load();
        }}
      />
      <MealSetupPrompt />
      {view.busy ? <Note>Refreshing week…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.snapshot && !view.fresh ? <Note>Saved on this iPhone · may be out of date</Note> : null}
      {view.notice ? (
        <NativeAction
          label="Retry week"
          disabled={view.busy}
          onPress={() => {
            void runtime.load();
          }}
        />
      ) : null}
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
      <TodayGroceries />
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
      <QuietAction
        label={showAll ? "Use configured meal slots" : "Show all meal slots"}
        onPress={toggle}
      />
      {hidden ? (
        <Note>There are saved meals in hidden slots. Show all slots to view them.</Note>
      ) : null}
    </>
  );
}
