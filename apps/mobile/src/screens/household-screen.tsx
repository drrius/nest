import { TodayDailySummary } from "../today/daily-summary";
import { TodayPendingApprovals } from "../today/pending-approvals";
import { TodayRenewals } from "../today/renewals";
import { TodayToolbar } from "../today/toolbar";
import { TodayGroceries } from "../today/groceries";
import { View } from "react-native";
import { useChoreEditor } from "../chores/use-editor";
import { currentHouseholdDay, useTodayClock } from "../today/use-today-clock";
import { householdDate } from "@nest/domain/calendar";
import { TodayCalendar } from "../today/calendar";
import { TodayBills } from "../today/bills";
import { TodayMeals } from "../today/meals";
import { useState } from "react";
import { ChoreStatus, ChoreConflicts, DueChores } from "../components/chore-content";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
import { useSession } from "../session/provider";
import { useChores } from "../chores/use-chores";
import type { ChoreClient } from "../chores/client";
import type { Member } from "../session/contracts";
import { space } from "../theme";

export default function HouseholdScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.chores)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <HouseholdChores
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.chores}
      member={session.state.member}
      verify={session.retry}
    />
  );
}
function HouseholdChores({
  client,
  member,
  verify,
}: {
  client: ChoreClient;
  member: Member;
  verify: () => void;
}) {
  const controller = useChores(client, member.userId, member.householdId);
  const { view, refresh, complete, discard, retryChange } = controller;
  const editor = useChoreEditor(controller);
  const now = useTodayClock();
  const today = householdDate(new Date(now));
  const [everyone, setEveryone] = useState(false);
  if (view.access === "verify")
    return (
      <Page>
        <Note>{view.error}</Note>
        <NativeAction label="Verify account" onPress={verify} />
      </Page>
    );
  return (
    <DueChores
      view={view}
      {...editor}
      actor={member.userId}
      everyone={everyone}
      today={today}
      complete={(chore) => complete(chore, currentHouseholdDay())}
      header={
        <View style={{ gap: space.medium, paddingBottom: space.large }}>
          <TodayToolbar
            everyone={everyone}
            select={setEveryone}
            date={today}
            transfers={view.data?.transfers?.transfers.length ?? 0}
          />
          <ChoreStatus view={view} />
          {view.changeStage === "uncertain" ? (
            <NativeAction
              label="Retry exact chore change"
              onPress={() => {
                void retryChange();
              }}
            />
          ) : null}
          <ChoreConflicts view={view} discard={discard} />
        </View>
      }
      refresh={refresh}
      footer={
        <View style={{ gap: space.section, paddingTop: space.large }}>
          <TodayMeals date={today} />
          <TodayGroceries />
          <TodayCalendar now={now} />
          <TodayRenewals date={today} />
          <TodayPendingApprovals />
          <TodayBills date={today} />
          <TodayDailySummary />
        </View>
      }
    />
  );
}
