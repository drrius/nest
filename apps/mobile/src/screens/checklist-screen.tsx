import { GroceryList } from "../components/grocery-content";
import { NativeAction } from "../components/native-action";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
import { useSession } from "../session/provider";
import { useGroceries } from "../groceries/use-groceries";
import type { GroceryClient } from "../groceries/client";
import type { Member } from "../session/contracts";
export default function ChecklistScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.groceries)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Checklist
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.groceries}
      member={session.state.member}
      verify={session.retry}
    />
  );
}
function Checklist({
  client,
  member,
  verify,
}: {
  client: GroceryClient;
  member: Member;
  verify: () => void;
}) {
  const { view, refresh, check, discard } = useGroceries(client, member.userId, member.householdId);
  if (view.access === "verify")
    return (
      <Page>
        <Note>{view.error}</Note>
        <NativeAction label="Verify account" onPress={verify} />
      </Page>
    );
  return <GroceryList view={view} refresh={refresh} check={check} discard={discard} />;
}
