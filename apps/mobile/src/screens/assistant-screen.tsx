import { FlatList, Text } from "react-native";
import { Link, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
import { NativeAction } from "../components/native-action";
import { useQuiet, space } from "../theme";
import { useConversations } from "../assistant/use-conversations";
import type { AssistantClient } from "../assistant/client";
export default function AssistantScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.assistant)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Conversations
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.assistant}
    />
  );
}
function Conversations({ client }: { client: AssistantClient }) {
  const view = useConversations(client),
    colors = useQuiet(),
    router = useRouter();
  return (
    <FlatList
      data={view.items}
      keyExtractor={(item) => item.conversationId}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      refreshing={view.busy}
      onRefresh={view.refresh}
      ListHeaderComponent={
        <>
          <Note>Your conversations are private. An internet connection is needed to chat.</Note>
          <NativeAction
            label="New conversation"
            onPress={() =>
              router.push({ pathname: "/conversation", params: { id: Crypto.randomUUID() } })
            }
          />
          {view.error ? <Note>{view.error}</Note> : null}
          {view.error ? (
            <NativeAction
              label="Reload conversations"
              onPress={view.refresh}
              disabled={view.busy}
            />
          ) : null}
        </>
      }
      ListEmptyComponent={
        <Note>
          {view.loaded
            ? "No saved conversations yet."
            : view.busy
              ? "Loading private conversations…"
              : "Conversations are unavailable."}
        </Note>
      }
      renderItem={({ item }) => (
        <Link
          href={{ pathname: "/conversation", params: { id: item.conversationId } }}
          style={{ paddingVertical: 16, color: colors.accent, fontSize: 17 }}
        >
          <Text>Conversation · {new Date(item.createdAt).toLocaleString()}</Text>
        </Link>
      )}
      ListFooterComponent={
        view.cursor ? (
          <NativeAction label="Older conversations" onPress={view.more} disabled={view.busy} />
        ) : null
      }
    />
  );
}
