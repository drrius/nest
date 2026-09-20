import { useState } from "react";
import { Host, Column, Text, TextInput, useNativeState } from "@expo/ui";
import { Alert, useColorScheme } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as Schema from "effect/Schema";
import { MemoryContent, type Memory } from "@nest/contracts/memory";
import type { MemoryRuntime } from "../memory/runtime";
import { useQuiet } from "../theme";
import { Card, Section, Note } from "./page";
import { NativeAction } from "./native-action";
export function MemoryEditor({
  memory,
  runtime,
  disabled,
  cancel,
}: {
  memory: Memory | null;
  runtime: MemoryRuntime;
  disabled: boolean;
  cancel: () => void;
}) {
  const content = useNativeState(memory?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const colors = useQuiet(),
    scheme = useColorScheme(),
    navigation = useNavigation();
  const discard = (leave: () => void) => {
    if (content.value === (memory?.content ?? "") && !disabled) return leave();
    Alert.alert(
      "Leave this memory draft?",
      "Unsaved text and retry details will be lost. A request already sent may still finish. Reopen saved memory to check it.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: leave },
      ],
    );
  };
  usePreventRemove(true, ({ data }) => discard(() => navigation.dispatch(data.action)));
  const submit = () => {
    const value = content.value.trim();
    if (!Schema.is(MemoryContent)(value)) return setError("Enter text of up to 1,000 characters.");
    setError(null);
    void runtime.propose(value, memory ?? undefined);
  };
  return (
    <Card>
      <Section title={memory ? "Edit memory" : "New memory"} />
      <Note>You will review the exact text before allowing Nest to remember it.</Note>
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Text>What should Nest remember?</Text>
          <TextInput
            value={content}
            multiline
            numberOfLines={5}
            maxLength={1000}
            editable={!disabled}
            placeholder="Something you want Nest to remember"
          />
        </Column>
      </Host>
      {error ? <Note>{error}</Note> : null}
      <NativeAction label="Review memory" onPress={submit} disabled={disabled} />
      <NativeAction label="Cancel draft" onPress={() => discard(cancel)} disabled={disabled} />
    </Card>
  );
}
