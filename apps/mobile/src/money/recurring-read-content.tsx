import { FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import type { RecurringRule } from "@nest/contracts/recurring-read";
import { Card, Note, Page, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet, space } from "../theme";
import { formatChf } from "./format";
import type { RecurringReadRuntime, RecurringReadView } from "./recurring-read-runtime";
type Props = { runtime: RecurringReadRuntime; view: RecurringReadView; actor: string };
function ReadStatus({ runtime, view }: Omit<Props, "actor">) {
  return (
    <View style={{ gap: space.small }}>
      {!view.active ? (
        <Note>Recurring details are hidden while this screen is inactive.</Note>
      ) : null}
      {view.active && !view.online ? (
        <Note>Connect to view current recurring expenses.</Note>
      ) : null}
      {view.busy ? <Note>Loading current recurring expenses…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <NativeAction
        label="Reload recurring expenses"
        disabled={!view.active || !view.online || view.busy}
        onPress={() => void runtime.refresh()}
      />
    </View>
  );
}
function RuleSummary({ rule }: { rule: RecurringRule }) {
  const config = rule.configuration;
  return (
    <Section title={config.description}>
      <Note>
        {rule.status} ·{" "}
        {config.mode === "fixed" ? "Fixed amount configured" : "Variable confirmation"}
      </Note>
      <Note>
        {config.mode === "fixed"
          ? formatChf(config.amountCentimes)
          : "Amount and split confirmed each cycle"}
      </Note>
      <Note>
        Scheduled posting is not active yet. These rules do not currently create expenses.
      </Note>
      <Note>Next planned date: {rule.nextDueOn ?? "None"}</Note>
    </Section>
  );
}
function RuleRow({ rule }: { rule: RecurringRule }) {
  const router = useRouter();
  return (
    <Card>
      <RuleSummary rule={rule} />
      <NativeAction
        label={`View ${rule.configuration.description}`}
        onPress={() =>
          router.push({
            pathname: "/recurring-rule",
            params: { ruleId: rule.ruleId },
          })
        }
      />
    </Card>
  );
}
function RuleDetails({ rule, actor }: { rule: RecurringRule; actor: string }) {
  const router = useRouter();
  const config = rule.configuration,
    schedule = config.schedule;
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return (
    <>
      <RuleSummary rule={rule} />
      {rule.status !== "cancelled" ? (
        <NativeAction
          label="Edit recurring configuration"
          onPress={() =>
            router.push({ pathname: "/recurring-entry", params: { ruleId: rule.ruleId } })
          }
        />
      ) : null}
      <NativeAction
        label="Manage recurring state"
        onPress={() =>
          router.push({ pathname: "/recurring-state", params: { ruleId: rule.ruleId } })
        }
      />
      <Section title="Configuration">
        <Note>Payer: {config.payerId === actor ? "You" : "Other household member"}</Note>
        <Note>
          {schedule.kind === "weekly"
            ? `Every ${weekdays[schedule.weekday - 1]}`
            : `Day ${schedule.dayOfMonth} each month (last day in shorter months)`}
        </Note>
        <Note>Starts on {config.startDate}</Note>
        {config.allocations?.map((share) => (
          <Note key={share.memberId}>
            {share.memberId === actor ? "Your share" : "Other member’s share"}:{" "}
            {formatChf(share.centimes)}
          </Note>
        ))}
        {config.note ? <Note>{config.note}</Note> : null}
      </Section>
      <Section title="Authorization and history">
        <Note>Rule reference: {rule.ruleId}</Note>
        <Note>Authorized {rule.authorizedAt}</Note>
        <Note>Covered through: {rule.coveredThrough ?? "No completed cycle recorded"}</Note>
        <Note>
          A planned date is not evidence that an expense was posted. Check Money history for
          recorded entries.
        </Note>
      </Section>
    </>
  );
}
export function RecurringReadContent({ runtime, view, actor }: Props) {
  if (view.target.kind === "detail")
    return (
      <Page>
        <ReadStatus runtime={runtime} view={view} />
        {view.entry?.kind === "detail" ? (
          <RuleDetails rule={view.entry.value.rule} actor={actor} />
        ) : null}
      </Page>
    );
  return <RuleList runtime={runtime} view={view} />;
}
function RuleList({ runtime, view }: Omit<Props, "actor">) {
  const colors = useQuiet();
  const page = view.entry?.kind === "list" ? view.entry.value : null;
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={page?.rules ?? []}
      keyExtractor={(rule) => rule.ruleId}
      renderItem={({ item }) => <RuleRow rule={item} />}
      ListHeaderComponent={<ReadStatus runtime={runtime} view={view} />}
      ListEmptyComponent={page ? <Note>No recurring expenses on this page.</Note> : null}
      ListFooterComponent={
        <PageNavigation runtime={runtime} view={view} next={page?.next ?? null} />
      }
    />
  );
}
function PageNavigation({ runtime, view, next }: Omit<Props, "actor"> & { next: string | null }) {
  const after = view.target.kind === "list" ? view.target.after : null;
  return (
    <View style={{ gap: space.small }}>
      {after ? (
        <NativeAction
          label="First page"
          disabled={view.busy || !view.online || !view.active}
          onPress={() => void runtime.select({ kind: "list", after: null })}
        />
      ) : null}
      {next ? (
        <NativeAction
          label="Next page"
          onPress={() => void runtime.select({ kind: "list", after: next })}
        />
      ) : null}
    </View>
  );
}
