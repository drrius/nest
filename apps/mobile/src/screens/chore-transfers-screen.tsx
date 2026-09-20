import { responseChore, transferReady } from "../chores/transfer-state";
import { FlatList } from "react-native";
import type { PendingChoreTransfer } from "@nest/contracts/chore-transfers";
import { useSession } from "../session/provider";
import { useChores } from "../chores/use-chores";
import { useChoreChangeNavigation } from "../chores/use-change-navigation";
import type { ChoreClient } from "../chores/client";
import type { Member } from "../session/contracts";
import { Card, Note, Page, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
import { ChoreStatus } from "../components/chore-content";
import { space, useQuiet } from "../theme";

export default function ChoreTransfersScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.chores)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Transfers
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.chores}
      member={session.state.member}
      verify={session.retry}
    />
  );
}
function Transfers({
  client,
  member,
  verify,
}: {
  client: ChoreClient;
  member: Member;
  verify: () => void;
}) {
  const controller = useChores(client, member.userId, member.householdId);
  const { view } = controller,
    colors = useQuiet();
  useChoreChangeNavigation(false, view.pendingWrite);
  if (view.access === "verify")
    return (
      <Page>
        <Note>{view.error}</Note>
        <NativeAction label="Verify account" onPress={verify} />
      </Page>
    );
  const snapshot = view.data?.transfers;
  return (
    <FlatList
      data={snapshot?.transfers ?? []}
      keyExtractor={(request) => request.requestId}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      ListHeaderComponent={
        <>
          <Note>
            Accepting changes responsibility for this occurrence only. Future alternating turns stay
            the same. Send a request from an assigned chore’s menu on Today.
          </Note>
          <Note>
            You can view saved requests offline. Sending or responding needs a connection.
          </Note>
          <ChoreStatus view={view} />
          {view.changeStage === "uncertain" ? (
            <NativeAction
              label="Retry exact chore change"
              onPress={() => {
                void controller.retryChange();
              }}
            />
          ) : null}
          <NativeAction label="Refresh requests and saved changes" onPress={controller.refresh} />
        </>
      }
      ListEmptyComponent={
        <Note>
          {snapshot ? "No pending handover requests." : "Handover requests have not loaded yet."}
        </Note>
      }
      renderItem={({ item }) => (
        <TransferRow request={item} actor={member.userId} controller={controller} />
      )}
    />
  );
}
function TransferRow({
  request,
  actor,
  controller,
}: {
  request: typeof PendingChoreTransfer.Type;
  actor: string;
  controller: ReturnType<typeof useChores>;
}) {
  const { view } = controller;
  const incoming = request.toMemberId === actor;
  const counterpart = incoming ? request.fromMemberId : request.toMemberId;
  const name = counterpartName(controller, counterpart);
  const chore = responseChore(view, actor, request);
  const disabled = !transferReady(view) || !chore || chore.done || chore.pending;
  return (
    <Card>
      <Section title={request.title} />
      <Note>Due {request.dueDate}</Note>
      <Note>
        {incoming
          ? `${name} asks you to take this turn.`
          : `Waiting for ${name} to accept. It is still your turn.`}
      </Note>
      {incoming ? (
        <>
          <NativeAction
            label="Accept this turn"
            disabled={disabled}
            onPress={() => {
              void controller.respondTransfer(request, "accept");
            }}
          />
          <NativeAction
            label="Decline handover"
            disabled={disabled}
            onPress={() => {
              void controller.respondTransfer(request, "decline");
            }}
          />
        </>
      ) : null}
    </Card>
  );
}

function counterpartName(controller: ReturnType<typeof useChores>, actor: string) {
  return (
    controller.view.data?.transfers?.members.find((member) => member.actorId === actor)
      ?.displayName || "Your partner"
  );
}
