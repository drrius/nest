import { useChoreEditor } from "../chores/use-editor";
import { currentHouseholdDay, useHouseholdDay } from "../today/use-household-day";
import { TodayMeals } from "../today/meals";
import { useState } from "react";
import { Link } from "expo-router";
import { ChoreStatus, ChoreConflicts, DueChores } from "../components/chore-content";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
import { useSession } from "../session/provider";
import { useChores } from "../chores/use-chores";
import type { ChoreClient } from "../chores/client";
import type { Member } from "../session/contracts";
import { useQuiet } from "../theme";

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
  const today = useHouseholdDay();
  const [everyone, setEveryone] = useState(false);
  const colors = useQuiet();
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
        <>
          <NativeAction
            label={everyone ? "Everyone · Show me + shared" : "Me + shared · Show everyone"}
            onPress={() => setEveryone(!everyone)}
          />
          <HouseholdLinks count={view.data?.transfers?.transfers.length ?? 0} />
          <ChoreStatus view={view} />
          {view.changeStage === "uncertain" ? (
            <NativeAction
              label="Retry exact chore change"
              onPress={() => {
                void retryChange();
              }}
            />
          ) : null}
          <Link
            href="/settings"
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
          >
            Profile and settings
          </Link>
          <NativeAction label="Refresh and retry saved changes" onPress={refresh} />
          <ChoreConflicts view={view} discard={discard} />
        </>
      }
      footer={
        <>
          <TodayMeals date={today} />
          <Link href="/" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
            Household account
          </Link>
        </>
      }
    />
  );
}

function HouseholdLinks({ count }: { count: number }) {
  const colors = useQuiet();
  return (
    <>
      <Link href="/checklist" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Groceries
      </Link>
      <Link href="/assistant" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Private assistant
      </Link>
      <Link href="/meal-week" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Meals
      </Link>
      <Link href="/agenda" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Calendar
      </Link>
      <Link href="/finances" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Money
      </Link>
      <Link href="/renewals" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Manage renewals
      </Link>
      <Link href="/routines" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Manage routines
      </Link>
      <Link
        href="/chore-transfers"
        style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
      >
        Chore handovers
        {count ? ` · ${count}` : ""}
      </Link>
    </>
  );
}
