import { householdDate } from "@nest/domain/calendar";
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

const todayDate = () => householdDate(new Date());
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
  const { view, refresh, complete, discard } = useChores(client, member.userId, member.householdId);
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
      actor={member.userId}
      everyone={everyone}
      today={todayDate()}
      complete={(chore) => complete(chore, todayDate())}
      header={
        <>
          <NativeAction
            label={everyone ? "Everyone · Show me + shared" : "Me + shared · Show everyone"}
            onPress={() => setEveryone(!everyone)}
          />
          <Link
            href="/checklist"
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
          >
            Groceries
          </Link>
          <Link
            href="/assistant"
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
          >
            Private assistant
          </Link>
          <Link
            href="/routines"
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
          >
            Manage routines
          </Link>
          <ChoreStatus view={view} />
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
        <Link href="/" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
          Household account
        </Link>
      }
    />
  );
}
