import { useRef, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { Memory } from "@nest/contracts/memory";
import type { MemoryRuntime } from "../memory/runtime";
import type { MemoryView } from "../memory/state";
import { space, useQuiet } from "../theme";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
import { MemoryEditor } from "./memory-editor";
import { MemoryApprovalCard } from "./memory-approval";
type Props = { runtime: MemoryRuntime; view: MemoryView; verify: () => void };
type Editor = {
  selected: Memory | null | undefined;
  select: (memory: Memory | null | undefined) => void;
};
const locked = (view: MemoryView) => view.busy || view.stage !== "ready" || !view.loaded;
export function MemoryContentView({ runtime, view, verify }: Props) {
  const [selected, select] = useState<Memory | null | undefined>(undefined);
  const list = useRef<FlatList<Memory>>(null);
  const colors = useQuiet(),
    navigation = useNavigation();
  usePreventRemove(
    (selected === undefined || view.approval !== null) && (view.busy || view.stage === "uncertain"),
    ({ data }) => {
      Alert.alert(
        "Leave private memory?",
        "A request already sent may still finish. Retry details will be lost; reopen saved memory to check the result.",
        [
          { text: "Stay", style: "cancel" },
          { text: "Leave", onPress: () => navigation.dispatch(data.action) },
        ],
      );
    },
  );
  const edit = (memory: Memory) => {
    select(memory);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  return (
    <FlatList
      ref={list}
      data={view.loaded ? view.items : []}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      ListHeaderComponent={
        <MemoryHeader runtime={runtime} view={view} verify={verify} editor={{ selected, select }} />
      }
      renderItem={({ item, index }) => (
        <Card>
          <Section title={`Memory ${index + 1}`} />
          <Note>{item.content}</Note>
          <NativeAction
            label={`Edit memory ${index + 1}`}
            disabled={locked(view) || !!view.approval || selected !== undefined}
            onPress={() => edit(item)}
          />
          <NativeAction
            label={`Delete memory ${index + 1}`}
            disabled={locked(view) || !!view.approval || selected !== undefined}
            onPress={() => remove(runtime, item)}
          />
        </Card>
      )}
    />
  );
}
function remove(runtime: MemoryRuntime, memory: Memory) {
  Alert.alert(
    "Delete this saved memory?",
    "This removes the entry from saved memory. Existing conversation and approval history remains private to you.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete memory",
        style: "destructive",
        onPress: () => {
          void runtime.remove(memory);
        },
      },
    ],
  );
}
function MemoryHeader({ runtime, view, verify, editor }: Props & { editor: Editor }) {
  const reload = () => {
    if (editor.selected === undefined) {
      void runtime.load();
      return;
    }
    Alert.alert(
      "Reload saved memory?",
      "This discards the current draft and loads your saved memory.",
      [
        { text: "Keep draft", style: "cancel" },
        {
          text: "Reload",
          onPress: () => {
            void runtime.load();
          },
        },
      ],
    );
  };
  return (
    <View style={{ gap: space.medium }}>
      <Section title="Private memory" />
      <Note>
        Only you can view or change this memory. New and edited text needs your confirmation.
        Deleting memory does not erase existing private conversation or approval history.
      </Note>
      <Note>
        Changes need a connection. Drafts and retry details stay in memory only while this screen is
        open.
      </Note>
      {view.notice ? <Note>{view.notice}</Note> : null}
      {!view.loaded && view.busy ? <Note>Loading saved memory…</Note> : null}
      <MemoryRecovery runtime={runtime} view={view} verify={verify} reload={reload} />
      {view.loaded ? <MemoryForm runtime={runtime} view={view} editor={editor} /> : null}
      {view.items.length >= 64 ? (
        <Note>Your saved memory is full. Delete an entry before adding another.</Note>
      ) : null}
      {view.loaded && !view.items.length ? <Note>You have no saved memory.</Note> : null}
    </View>
  );
}
function MemoryForm({
  runtime,
  view,
  editor,
}: Pick<Props, "runtime" | "view"> & { editor: Editor }) {
  if (view.approval) return <MemoryApprovalCard runtime={runtime} view={view} />;
  if (editor.selected !== undefined)
    return (
      <MemoryEditor
        memory={editor.selected}
        runtime={runtime}
        disabled={locked(view)}
        cancel={() => editor.select(undefined)}
      />
    );
  return (
    <NativeAction
      label="Add memory"
      disabled={locked(view) || view.items.length >= 64}
      onPress={() => editor.select(null)}
    />
  );
}
function MemoryRecovery({ runtime, view, verify, reload }: Props & { reload: () => void }) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry exact request"
        disabled={view.busy}
        onPress={() => {
          void runtime.retry();
        }}
      />
    );
  if (view.stage === "verify")
    return (
      <>
        <NativeAction label="Verify account" onPress={verify} />
        <NativeAction label="Reload private memory" onPress={reload} />
      </>
    );
  return <NativeAction label="Reload saved memory" disabled={view.busy} onPress={reload} />;
}
