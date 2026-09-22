import { FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import type { LegacyRecurringDraft } from "@nest/contracts/legacy-recurring-drafts";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
import { formatChf } from "./format";
import { legacyDateText, legacyDescription } from "./legacy-recurring-display";
import { legacyDraftPage, legacyDraftWarning } from "./legacy-draft-display";
import { cycleExpenseTarget } from "./recurring-history-display";
import type { RecurringReadRuntime, RecurringReadView } from "./recurring-read-runtime";
type Props = { runtime: RecurringReadRuntime; view: RecurringReadView; actor: string };
function DraftRow({ row, actor }: { row: typeof LegacyRecurringDraft.Type; actor: string }) {
  const router = useRouter(),
    warning = legacyDraftWarning(row);
  return (
    <Card>
      <Section title={legacyDescription(row.description)}>
        <Note>
          Status: {row.status} · {legacyDateText(row.occurredOn)}
        </Note>
        <Note>
          Retained amount:{" "}
          {row.amountCentimes === null ? "Not specified" : formatChf(row.amountCentimes)}
        </Note>
        <Note>
          Payer:{" "}
          {row.payerId === null
            ? "Not specified"
            : row.payerId === actor
              ? "You"
              : "Other household member"}
        </Note>
        {row.allocations.kind === "valid" ? (
          row.allocations.shares.map((share) => (
            <Note key={share.memberId}>
              {share.memberId === actor ? "Your share" : "Other member’s share"}:{" "}
              {formatChf(share.centimes)}
            </Note>
          ))
        ) : (
          <Note>The retained split needs review. No replacement has been assumed.</Note>
        )}
        {row.updatedAt.kind === "unsupported" ? (
          <Note>The retained edit version needs review.</Note>
        ) : null}
        {row.sourceKind === "shopping" ? (
          <Note>
            This linked draft came from legacy shopping. Review its origin before reconciling.
          </Note>
        ) : null}
        {warning ? <Note>{warning}</Note> : null}
        {row.eventId ? (
          <NativeAction
            label="View linked financial event"
            onPress={() => router.push(cycleExpenseTarget(row.eventId!))}
          />
        ) : (
          <Note>No financial event is linked to this draft.</Note>
        )}
        <Note>Draft reference: {row.draftId}</Note>
      </Section>
    </Card>
  );
}
function DraftHeader({ runtime, view }: Omit<Props, "actor">) {
  return (
    <View style={{ gap: space.small }}>
      <Note>
        These are original draft values, which may differ from the current rule. Reading them does
        not confirm or dismiss anything. Linked financial history includes later corrections and
        refunds; it does not prove a payment occurred.
      </Note>
      {!view.active ? <Note>Drafts are hidden while this screen is inactive.</Note> : null}
      {view.active && !view.online ? <Note>Connect to review retained drafts.</Note> : null}
      {view.busy ? <Note>Loading retained drafts…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <NativeAction
        label="Reload retained drafts"
        disabled={!view.active || !view.online || view.busy || view.verify}
        onPress={() => void runtime.refresh()}
      />
    </View>
  );
}
function DraftNavigation({ runtime, view }: Omit<Props, "actor">) {
  const page = legacyDraftPage(view);
  if (view.target.kind !== "legacy-drafts") return null;
  const ruleId = view.target.ruleId;
  return (
    <View style={{ gap: space.small }}>
      {view.target.after !== null ? (
        <NativeAction
          label="First page"
          disabled={!page}
          onPress={() => void runtime.select({ kind: "legacy-drafts", ruleId, after: null })}
        />
      ) : null}
      {page?.next ? (
        <NativeAction
          label="Next page"
          onPress={() => void runtime.select({ kind: "legacy-drafts", ruleId, after: page.next })}
        />
      ) : null}
    </View>
  );
}
export function LegacyDraftContent({ runtime, view, actor }: Props) {
  const colors = useQuiet(),
    page = legacyDraftPage(view);
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={page?.drafts ?? []}
      keyExtractor={(row) => row.draftId}
      renderItem={({ item }) => <DraftRow row={item} actor={actor} />}
      ListHeaderComponent={<DraftHeader runtime={runtime} view={view} />}
      ListEmptyComponent={page ? <Note>No retained drafts on this page.</Note> : null}
      ListFooterComponent={<DraftNavigation runtime={runtime} view={view} />}
    />
  );
}
