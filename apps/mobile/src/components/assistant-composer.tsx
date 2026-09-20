import { Host, TextInput, useNativeState, type TextInputRef } from "@expo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, useColorScheme } from "react-native";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { scheduleOnRN } from "react-native-worklets";
import type { ConversationRuntime, ConversationView } from "../assistant/conversation";
import { NativeAction } from "./native-action";
import { Card, Note } from "./page";
import { useQuiet } from "../theme";
export function AssistantComposer({
  runtime,
  view,
}: {
  runtime: ConversationRuntime;
  view: ConversationView;
}) {
  const draft = useNativeState("");
  const input = useRef<TextInputRef>(null);
  const submitted = useRef<{ text: string; previous: string | null } | null>(null);
  const [dirty, setDirty] = useState(false);
  const navigation = useNavigation(),
    colors = useQuiet(),
    scheme = useColorScheme();
  const changed = useCallback((text: string) => {
    "worklet";
    scheduleOnRN(setDirty, text.trim().length > 0);
  }, []);
  usePreventRemove(dirty || view.busy, ({ data }) =>
    Alert.alert(
      "Leave this conversation?",
      "Any text not sent will be lost. A response in progress will stop; saved messages remain private.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => navigation.dispatch(data.action) },
      ],
    ),
  );
  useEffect(() => {
    const sent = submitted.current;
    if (!sent || !view.savedOperation || view.savedOperation === sent.previous) return;
    if (draft.value.trim() === sent.text) {
      input.current?.clear();
      setDirty(false);
    }
    submitted.current = null;
  }, [view.savedOperation, draft]);
  const send = () => {
    submitted.current = { text: draft.value.trim(), previous: view.savedOperation };
    void runtime.send(draft.value);
  };
  const blocked = !view.loaded || view.busy || view.pending !== null || view.retryable;
  return (
    <Card>
      <Host
        matchContents
        seedColor={colors.accent}
        colorScheme={scheme === "dark" ? "dark" : "light"}
      >
        <TextInput
          ref={input}
          value={draft}
          onChangeText={changed}
          placeholder="Message Nest"
          multiline
          numberOfLines={3}
          maxLength={2000}
          editable={!blocked}
        />
      </Host>
      <NativeAction
        label={view.busy ? "Working…" : "Send"}
        disabled={blocked || !dirty}
        onPress={send}
      />
      {view.retryable ? (
        <>
          <Note>Your unsent message is retained here while this screen stays open.</Note>
          <NativeAction
            label="Retry the same message"
            onPress={() => {
              void runtime.retry();
            }}
          />
        </>
      ) : null}
    </Card>
  );
}
