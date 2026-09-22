import { FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import type { RecurringHistoryEntry } from "@nest/contracts/recurring-history";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
import { formatChf } from "./format";
import type { RecurringReadRuntime, RecurringReadView } from "./recurring-read-runtime";
import { cycleHistoryPage, cycleOriginText, cycleExpenseTarget } from "./recurring-history-display";
type Props = { runtime: RecurringReadRuntime; view: RecurringReadView; actor: string };
function CycleRow({ row, actor }: { row: typeof RecurringHistoryEntry.Type; actor: string }) {
  const router = useRouter();
  return (
    <Card>
      <Section title={row.configuration.description}>
        <Note>
          Due {row.cycle.dueOn} · {cycleOriginText(row, actor)}
        </Note>
        <Note>Original expense: {formatChf(row.amountCentimes)}</Note>
        <Note>Payer: {row.payerId === actor ? "You" : "Other household member"}</Note>
        <Note>
          Period: {row.cycle.startsOn} through {row.cycle.through}
        </Note>
        <Note>Recorded {row.recordedAt}</Note>
        {row.source === "manual" ? (
          <Note>
            The linked expense may differ from this rule’s configured amount or split. Its original
            financial history is preserved.
          </Note>
        ) : null}
        <NativeAction
          label={`View expense for ${row.cycle.dueOn}`}
          onPress={() => router.push(cycleExpenseTarget(row.eventId))}
        />
      </Section>
    </Card>
  );
}
function HistoryStatus({ runtime, view }: Omit<Props, "actor">) {
  return (
    <View style={{ gap: space.small }}>
      <Note>
        Recorded cycles retain the rule used at the time. Open an expense for its split and later
        corrections or refunds.
      </Note>
      {!view.active ? <Note>Cycle history is hidden while this screen is inactive.</Note> : null}
      {view.active && !view.online ? <Note>Connect to view cycle history.</Note> : null}
      {view.busy ? <Note>Loading cycle history…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <NativeAction
        label="Reload cycle history"
        disabled={!view.active || !view.online || view.busy || view.verify}
        onPress={() => void runtime.refresh()}
      />
    </View>
  );
}
function HistoryNavigation({ runtime, view }: Omit<Props, "actor">) {
  const page = cycleHistoryPage(view);
  if (view.target.kind !== "history") return null;
  const ruleId = view.target.ruleId;
  return (
    <View style={{ gap: space.small }}>
      {view.target.before !== null ? (
        <NativeAction
          label="Newest cycles"
          disabled={!page}
          onPress={() => void runtime.select({ kind: "history", ruleId, before: null })}
        />
      ) : null}
      {page?.next ? (
        <NativeAction
          label="Older cycles"
          onPress={() => void runtime.select({ kind: "history", ruleId, before: page.next })}
        />
      ) : null}
    </View>
  );
}
export function RecurringHistoryContent({ runtime, view, actor }: Props) {
  const colors = useQuiet(),
    page = cycleHistoryPage(view);
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={page?.cycles ?? []}
      keyExtractor={(row) => row.eventId}
      renderItem={({ item }) => <CycleRow row={item} actor={actor} />}
      ListHeaderComponent={<HistoryStatus runtime={runtime} view={view} />}
      ListEmptyComponent={
        page ? (
          <Note>
            No recorded cycles on this page. A planned date alone does not mean an expense was
            posted.
          </Note>
        ) : null
      }
      ListFooterComponent={<HistoryNavigation runtime={runtime} view={view} />}
    />
  );
}
