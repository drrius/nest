import { conversationOwner } from "../assistant/owner";
import { useState, useSyncExternalStore } from "react";
import { FlatList } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import * as Schema from "effect/Schema";
import { useChat } from "@ai-sdk/react";
import { useSession } from "../session/provider";
import type { AssistantClient } from "../assistant/client";
import type { ConversationRuntime } from "../assistant/conversation";
import { AssistantComposer } from "../components/assistant-composer";
import { AssistantMessageCard } from "../components/assistant-message";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
const Uuid = Schema.String.check(Schema.isUUID());
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const session = useSession();
  if (!Schema.is(Uuid)(id))
    return (
      <Page>
        <Note>This conversation link is invalid.</Note>
      </Page>
    );
  if (session.state.status !== "ready" || !session.assistant)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Conversation
      key={`${session.state.member.userId}:${session.state.member.householdId}:${id}`}
      client={session.assistant}
      id={id.toLowerCase()}
    />
  );
}
function Conversation({ client, id }: { client: AssistantClient; id: string }) {
  const [owner] = useState(() => conversationOwner(client, id, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ConversationContent runtime={runtime} />
  ) : (
    <Page>
      <Note>Loading private conversation…</Note>
    </Page>
  );
}
function ConversationContent({ runtime }: { runtime: ConversationRuntime }) {
  const { messages, status } = useChat({ chat: runtime.chat });
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const colors = useQuiet();
  return (
    <FlatList
      data={messages}
      keyExtractor={(message) => message.id}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      ListHeaderComponent={
        <>
          <Note>
            Private to you. Nest can complete requested chores, update groceries and edit your food
            preferences or shared cooking settings. Saved action receipts appear below. Money
            actions are not available here yet.
          </Note>
          {view.notice ? <Note>{view.notice}</Note> : null}
          {!view.loaded && view.busy ? <Note>Loading saved conversation…</Note> : null}
          <NativeAction
            label="Reload saved conversation"
            disabled={view.busy}
            onPress={() => {
              void runtime.load();
            }}
          />
          {status === "submitted" || status === "streaming" ? (
            <NativeAction
              label="Stop response"
              onPress={() => {
                void runtime.stop();
              }}
            />
          ) : null}
          {view.pending ? (
            <>
              <Note>
                If it remains unfinished, recovery is available after{" "}
                {new Date(view.pending.deadline).toLocaleTimeString()}. It will not generate another
                response.
              </Note>
              <NativeAction
                label="Recover interrupted response"
                disabled={view.busy}
                onPress={() => {
                  void runtime.recover();
                }}
              />
            </>
          ) : null}
        </>
      }
      ListEmptyComponent={
        view.loaded ? <Note>Ask about your household chores or groceries.</Note> : null
      }
      renderItem={({ item }) => <AssistantMessageCard message={item} />}
      ListFooterComponent={<AssistantComposer runtime={runtime} view={view} />}
    />
  );
}
