import type { MoneyEventSummary } from "@nest/contracts/money-history";
import { useState, useSyncExternalStore, useRef } from "react";
import { FlatList } from "react-native";
import { Note, Page } from "../components/page";
import { moneyReadOwner } from "../money/read-owner";
import { moneyReadOperations } from "../money/read-operations";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import type { MoneyReadRuntime } from "../money/read-runtime";
import { MoneyHeader, MoneyRow, MoneyNavigation } from "../money/overview-content";
import { useMoneyActivity } from "../money/use-activity";
import { space, useQuiet } from "../theme";
export default function MoneyScreen() {
  return (
    <MoneyScreenGate>
      {(props) => <Money key={props.account.session.lease} {...props} />}
    </MoneyScreenGate>
  );
}
function Money(props: MoneyScreenAccount) {
  const [owner] = useState(() =>
    moneyReadOwner(moneyReadOperations(props.account, props.client), [
      { kind: "balance" },
      { kind: "history", before: null },
    ]),
  );
  const runtimes = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtimes ? (
    <MoneyContent {...props} runtimes={runtimes} />
  ) : (
    <Page>
      <Note>Loading Money…</Note>
    </Page>
  );
}
function MoneyContent({
  runtimes,
  account,
  verify,
}: MoneyScreenAccount & { runtimes: readonly MoneyReadRuntime[] }) {
  const balance = useSyncExternalStore(runtimes[0]!.subscribe, runtimes[0]!.getSnapshot);
  const history = useSyncExternalStore(runtimes[1]!.subscribe, runtimes[1]!.getSnapshot);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const colors = useQuiet();
  const list = useRef<FlatList<typeof MoneyEventSummary.Type>>(null);
  useMoneyActivity(runtimes);
  if (balance.access === "verify" || history.access === "verify")
    return <VerifyMoney verify={verify} />;
  const page = history.entry?.kind === "history" ? history.entry.value : null;
  return (
    <FlatList
      ref={list}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={page?.events ?? []}
      keyExtractor={(event) => event.eventId}
      renderItem={({ item }) => <MoneyRow event={item} />}
      ListHeaderComponent={
        <MoneyHeader
          balance={balance}
          history={history}
          actor={account.session.actor}
          refreshBalance={() => void runtimes[0]!.refresh()}
          refreshHistory={() => void runtimes[1]!.refresh()}
        />
      }
      ListEmptyComponent={page && !history.busy ? <Note>No entries on this page.</Note> : null}
      ListFooterComponent={
        <MoneyNavigation
          page={page}
          previous={previous}
          setPrevious={setPrevious}
          runtime={runtimes[1]!}
          busy={history.busy}
          onNavigate={() => list.current?.scrollToOffset({ offset: 0, animated: false })}
        />
      }
    />
  );
}
