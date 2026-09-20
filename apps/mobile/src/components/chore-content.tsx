import { ChoreMenu } from "../chores/menu";
import type { ChoreChoice } from "../chores/menu-types";
import { useRef, type ReactNode } from "react";
import type { ChoreData } from "../chores/flow";
import { space, useQuiet } from "../theme";
import { ActivityIndicator, Alert, FlatList, View } from "react-native";
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
      {view.changeNotice ? <Note>{view.changeNotice}</Note> : null}
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
  choose,
  editor,
  editing,
}: {
  view: ChoreView;
  choose: (choice: ChoreChoice) => void;
  editor: ReactNode;
  editing: string | null;
  header: ReactNode;
  footer: ReactNode;
  actor: string;
  everyone: boolean;
  today: string;
  complete: (chore: Chore) => void;
}) {
  const colors = useQuiet();
  const list = useRef<FlatList<ChoreData["chores"][number]>>(null);
  const select = (choice: ChoreChoice) => {
    choose(choice);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const chores =
    view.data?.chores.filter(
      (chore) =>
        chore.dueDate <= today &&
        (everyone || chore.assigneeId === null || chore.assigneeId === actor),
    ) ?? [];
  return (
    <FlatList
      ref={list}
      data={chores}
      keyExtractor={(chore) => chore.occurrenceId}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      ListHeaderComponent={
        <>
          {header}
          {editor}
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
        <ChoreItem
          item={item}
          actor={actor}
          view={view}
          editing={editing !== null}
          choose={select}
          complete={complete}
        />
      )}
    />
  );
}

function ChoreItem({
  item,
  actor,
  view,
  editing,
  choose,
  complete,
}: {
  item: ChoreData["chores"][number];
  actor: string;
  view: ChoreView;
  editing: boolean;
  choose: (choice: ChoreChoice) => void;
  complete: (chore: Chore) => void;
}) {
  const blocked = view.changeStage !== "ready" || editing;
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.small }}>
        <ChoreRow chore={item} actor={actor} onComplete={() => complete(item)} disabled={blocked} />
        <ChoreMenu
          chore={item}
          canTransfer={
            item.assigneeId === actor &&
            view.data?.transfers?.members.length === 2 &&
            !view.data.transfers.transfers.some(
              (request) => request.occurrenceId === item.occurrenceId,
            )
          }
          choose={choose}
          disabled={blocked || item.done || item.pending || view.stale || view.syncing}
        />
      </View>
    </Card>
  );
}
