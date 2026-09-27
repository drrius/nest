import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import type { MoneyEventSummary, MoneyHistory } from "@nest/contracts/money-history";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyReadStatus } from "./read-status";
import type { MoneyReadView, MoneyReadRuntime } from "./read-runtime";
import { eventNames, formatChf } from "./format";
import { space, useQuiet } from "../theme";
import { MoneyBalanceCard } from "./balance-card";
import { ActionMenu } from "../components/action-menu";
export function MoneyHeader({
  balance,
  history,
  actor,
  refreshBalance,
  refreshHistory,
}: {
  balance: MoneyReadView;
  history: MoneyReadView;
  actor: string;
  refreshBalance: () => void;
  refreshHistory: () => void;
}) {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 2;
  const summary = balance.entry?.kind === "balance" ? balance.entry.value : null;
  const own = summary?.members.find((member) => member.actorId === actor);
  return (
    <View style={{ gap: space.large }}>
      <Note maxFontSizeMultiplier={1.6}>All square, without the guesswork.</Note>
      <MoneyBalanceCard centimes={own?.centimes} />
      <MoneyReadStatus view={balance} label="balance" reload={refreshBalance} compact />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.medium }}>
        <View style={largeText ? { width: "100%" } : { flex: 1, minWidth: 120 }}>
          <NativeAction
            variant="primary"
            label="Add expense"
            onPress={() => router.push("/expense-entry")}
          />
        </View>
        <View style={largeText ? { width: "100%" } : { flex: 1, minWidth: 120 }}>
          <NativeAction
            variant="secondary"
            label="Settle up"
            onPress={() => router.push("/settlement-entry")}
          />
        </View>
        <ActionMenu
          label="More money actions"
          actions={[
            { label: "Receipt uploads", onPress: () => router.push("/receipt-uploads") },
            { label: "Set up recurring expense", onPress: () => router.push("/recurring-entry") },
            { label: "Bills to confirm", onPress: () => router.push("/due-bills") },
            { label: "Recurring expenses", onPress: () => router.push("/recurring-rules") },
            { label: "Refresh balance", onPress: refreshBalance, disabled: balance.busy },
            { label: "Refresh history", onPress: refreshHistory, disabled: history.busy },
          ]}
        />
      </View>
      <Section title="Recent activity">
        <MoneyReadStatus view={history} label="history" reload={refreshHistory} compact />
      </Section>
    </View>
  );
}
export function MoneyRow({ event }: { event: typeof MoneyEventSummary.Type }) {
  const router = useRouter(),
    colors = useQuiet();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${event.description}, ${formatChf(event.amountCentimes)}`}
      onPress={() => router.push({ pathname: "/money-event", params: { eventId: event.eventId } })}
      style={({ pressed }) => ({
        paddingVertical: space.medium,
        minHeight: 72,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: space.small,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: space.small,
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "500",
            flexGrow: 1,
            flexShrink: 1,
          }}
        >
          {event.description}
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "600",
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatChf(event.amountCentimes)}
        </Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 15 }}>
        {eventNames[event.kind]} · {event.occurredOn}
      </Text>
    </Pressable>
  );
}

export function MoneyNavigation({
  page,
  previous,
  setPrevious,
  runtime,
  busy,
  onNavigate,
}: {
  page: typeof MoneyHistory.Type | null;
  previous: (string | null)[];
  setPrevious: (value: (string | null)[]) => void;
  runtime: MoneyReadRuntime;
  busy: boolean;
  onNavigate: () => void;
}) {
  return (
    <View style={{ gap: space.small }}>
      {previous.length ? (
        <NativeAction
          label="Newer entries"
          disabled={busy}
          onPress={() => {
            onNavigate();
            const before = previous[previous.length - 1]!;
            setPrevious(previous.slice(0, -1));
            void runtime.changeTarget({ kind: "history", before });
          }}
        />
      ) : null}
      {page?.next ? (
        <NativeAction
          label="Earlier entries"
          disabled={busy}
          onPress={() => {
            onNavigate();
            setPrevious([...previous, page.before]);
            void runtime.changeTarget({ kind: "history", before: page.next });
          }}
        />
      ) : null}
    </View>
  );
}
