import type { ReactNode } from "react";
import { space, useQuiet } from "../theme";
import { ActivityIndicator, Alert, FlatList } from "react-native";
import type { Chore } from "@nest/contracts/chores";
import type { ChoreView } from "../chores/runtime";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
import { ChoreRow } from "./chore-row";

export function ChoreStatus({ view }: { view: ChoreView }) {
  return (
    <>
      {view.syncing ? <ActivityIndicator accessibilityLabel="Syncing chores" /> : null}
      {view.error ? <Note>{view.error}</Note> : null}
      {view.stale && view.data?.loaded ? (
        <Note>Showing saved chores. Changes will sync when you reconnect and retry.</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
    </>
  );
}
export function ChoreConflicts({
  view,
  discard,
}: {
  view: ChoreView;
  discard: (operation: string) => void;
}) {
  const conflicts = view.data?.pending.filter((operation) => operation.status === "conflict") ?? [];
  const confirm = (operation: string) =>
    Alert.alert(
      "Keep the current chore?",
      "Remove this failed completion and any queued changes that depended on it. The household record will not change. You can review the current chore and complete it again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Keep current chore", onPress: () => discard(operation) },
      ],
    );
  return (
    <>
      {conflicts.map((operation) => (
        <Card key={operation.operation}>
          <Note>
            {view.data?.chores.find((chore) => chore.occurrenceId === operation.target)?.title ??
              "A saved chore"}{" "}
            changed before this completion could be applied. Review the current chore before trying
            again.
          </Note>
          <NativeAction label="Keep current chore" onPress={() => confirm(operation.operation)} />
        </Card>
      ))}
    </>
  );
}
export function DueChores({
  view,
  actor,
  everyone,
  today,
  complete,
  header,
  footer,
}: {
  view: ChoreView;
  header: ReactNode;
  footer: ReactNode;
  actor: string;
  everyone: boolean;
  today: string;
  complete: (chore: Chore) => void;
}) {
  const colors = useQuiet();
  const chores =
    view.data?.chores.filter(
      (chore) =>
        chore.dueDate <= today &&
        (everyone || chore.assigneeId === null || chore.assigneeId === actor),
    ) ?? [];
  return (
    <FlatList
      data={chores}
      keyExtractor={(chore) => chore.occurrenceId}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      ListHeaderComponent={
        <>
          {header}
          <Section title="Due and overdue" />
        </>
      }
      ListFooterComponent={<>{footer}</>}
      ListEmptyComponent={
        <Note>
          {view.data?.loaded ? "No chores due for this view." : "Your chores have not loaded yet."}
        </Note>
      }
      renderItem={({ item }) => (
        <Card>
          <ChoreRow chore={item} actor={actor} onComplete={() => complete(item)} />
        </Card>
      )}
    />
  );
}
