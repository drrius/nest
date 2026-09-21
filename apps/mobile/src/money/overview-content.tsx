import { View } from "react-native";
import { useRouter } from "expo-router";
import type { MoneyEventSummary, MoneyHistory } from "@nest/contracts/money-history";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyReadStatus } from "./read-status";
import type { MoneyReadView, MoneyReadRuntime } from "./read-runtime";
import { balanceTitle, eventNames, formatChf } from "./format";
import { space } from "../theme";
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
  const summary = balance.entry?.kind === "balance" ? balance.entry.value : null;
  const own = summary?.members.find((member) => member.actorId === actor);
  return (
    <View style={{ gap: space.large }}>
      <Section title={own ? balanceTitle(own.centimes) : "Your shared balance"}>
        <Note>Derived from all retained entries. This is not a bank balance.</Note>
        {summary ? (
          <Note>
            {summary.eventCount} retained entries
            {summary.openingEstablished ? " · Includes the original opening balance" : ""}
          </Note>
        ) : null}
        <MoneyReadStatus view={balance} label="balance" reload={refreshBalance} />
      </Section>
      <Section title="History">
        <Note>
          Original and corrective entries stay visible. This page does not determine your balance.
        </Note>
        <MoneyReadStatus view={history} label="history" reload={refreshHistory} />
      </Section>
    </View>
  );
}
export function MoneyRow({ event }: { event: typeof MoneyEventSummary.Type }) {
  const router = useRouter();
  return (
    <Card>
      <Section title={event.description} />
      <Note>
        {eventNames[event.kind]} · {formatChf(event.amountCentimes)}
      </Note>
      <Note>{event.occurredOn}</Note>
      <NativeAction
        label={`View ${event.description}`}
        onPress={() =>
          router.push({ pathname: "/money-event", params: { eventId: event.eventId } })
        }
      />
    </Card>
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
