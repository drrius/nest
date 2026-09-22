import { FlatList, View } from "react-native";
import type { LegacyRecurringRule } from "@nest/contracts/legacy-recurring";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
import { formatChf } from "./format";
import type { RecurringReadRuntime, RecurringReadView } from "./recurring-read-runtime";
import {
  legacyRecurringPage,
  legacyDescription,
  legacyDateText,
  legacyWarnings,
} from "./legacy-recurring-display";
type Props = { runtime: RecurringReadRuntime; view: RecurringReadView; actor: string };
function LegacyRow({ row, actor }: { row: typeof LegacyRecurringRule.Type; actor: string }) {
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return (
    <Card>
      <Section title={legacyDescription(row.description)}>
        <Note>
          Legacy draft generation: {row.active ? "Active" : "Paused"}. This is not an automatic
          posting mandate.
        </Note>
        <Note>
          {formatChf(row.amountCentimes)} · Payer:{" "}
          {row.payerId === actor ? "You" : "Other household member"}
        </Note>
        <Note>
          {row.schedule.kind === "weekly"
            ? `Every ${weekdays[row.schedule.weekday - 1]}`
            : `Day ${row.schedule.dayOfMonth} each month`}
        </Note>
        <Note>Next legacy draft date: {legacyDateText(row.nextOccurrenceOn)}</Note>
        {row.allocations.kind === "valid"
          ? row.allocations.shares.map((share) => (
              <Note key={share.memberId}>
                {share.memberId === actor ? "Your share" : "Other member’s share"}:{" "}
                {formatChf(share.centimes)}
              </Note>
            ))
          : null}
        <Note>
          Pending drafts: {row.drafts.pending} · Posted: {row.drafts.posted} · Dismissed:{" "}
          {row.drafts.dismissed}
        </Note>
        <Note>Latest draft date: {legacyDateText(row.drafts.latestDraftOn)}</Note>
        {legacyWarnings(row).map((warning) => (
          <Note key={warning}>{warning}</Note>
        ))}
        <Note>Rule reference: {row.ruleId}</Note>
      </Section>
    </Card>
  );
}
function LegacyStatus({ runtime, view }: Omit<Props, "actor">) {
  return (
    <View style={{ gap: space.small }}>
      <Note>
        These retained rules created drafts in the previous app. Reading them does not approve
        automatic expenses or change any draft. Review existing drafts before setting up a
        replacement to avoid duplicates.
      </Note>
      {!view.active ? <Note>Legacy details are hidden while this screen is inactive.</Note> : null}
      {view.active && !view.online ? <Note>Connect to view legacy recurring expenses.</Note> : null}
      {view.busy ? <Note>Loading legacy recurring expenses…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <NativeAction
        label="Reload legacy recurring expenses"
        disabled={!view.active || !view.online || view.busy || view.verify}
        onPress={() => void runtime.refresh()}
      />
    </View>
  );
}
function LegacyNavigation({ runtime, view }: Omit<Props, "actor">) {
  const page = legacyRecurringPage(view);
  if (view.target.kind !== "legacy") return null;
  return (
    <View style={{ gap: space.small }}>
      {view.target.after !== null ? (
        <NativeAction
          label="First page"
          disabled={!page}
          onPress={() => void runtime.select({ kind: "legacy", after: null })}
        />
      ) : null}
      {page?.next ? (
        <NativeAction
          label="Next page"
          onPress={() => void runtime.select({ kind: "legacy", after: page.next })}
        />
      ) : null}
    </View>
  );
}
export function LegacyRecurringContent({ runtime, view, actor }: Props) {
  const colors = useQuiet(),
    page = legacyRecurringPage(view);
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={page?.rules ?? []}
      keyExtractor={(row) => row.ruleId}
      renderItem={({ item }) => <LegacyRow row={item} actor={actor} />}
      ListHeaderComponent={<LegacyStatus runtime={runtime} view={view} />}
      ListEmptyComponent={page ? <Note>No legacy recurring expenses on this page.</Note> : null}
      ListFooterComponent={<LegacyNavigation runtime={runtime} view={view} />}
    />
  );
}
