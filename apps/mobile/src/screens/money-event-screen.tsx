import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Schema from "effect/Schema";
import { MoneyDetailQuery } from "@nest/contracts/money-detail";
import type { MoneyDetail } from "@nest/contracts/money-detail";
import { Card, Note, Page, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { moneyReadOwner } from "../money/read-owner";
import { moneyReadOperations } from "../money/read-operations";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import type { MoneyReadRuntime } from "../money/read-runtime";
import { MoneyReadStatus } from "../money/read-status";
import { useMoneyActivity } from "../money/use-activity";
import { eventNames, formatChf, payerLabel } from "../money/format";
export default function MoneyEventScreen() {
  const { eventId } = useLocalSearchParams();
  if (typeof eventId !== "string" || !Schema.is(MoneyDetailQuery)({ eventId }))
    return (
      <Page>
        <Note>This financial entry link is invalid.</Note>
      </Page>
    );
  return (
    <MoneyScreenGate>
      {(props) => (
        <Detail key={`${props.account.session.lease}:${eventId}`} {...props} eventId={eventId} />
      )}
    </MoneyScreenGate>
  );
}
function Detail(props: MoneyScreenAccount & { eventId: string }) {
  const [owner] = useState(() =>
    moneyReadOwner(moneyReadOperations(props.account, props.client), [
      { kind: "detail", eventId: props.eventId },
    ]),
  );
  const runtimes = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtimes ? (
    <DetailContent {...props} runtimes={runtimes} />
  ) : (
    <Page>
      <Note>Loading entry…</Note>
    </Page>
  );
}
function DetailContent({
  runtimes,
  account,
  verify,
}: MoneyScreenAccount & { runtimes: readonly MoneyReadRuntime[] }) {
  const runtime = runtimes[0]!,
    view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useMoneyActivity(runtimes);
  if (view.access === "verify") return <VerifyMoney verify={verify} />;
  const detail = view.entry?.kind === "detail" ? view.entry.value : null;
  return (
    <Page>
      <MoneyReadStatus view={view} label="entry" reload={() => void runtime.refresh()} />
      {detail ? <Entry detail={detail} actor={account.session.actor} /> : null}
    </Page>
  );
}
function Entry({ detail, actor }: { detail: typeof MoneyDetail.Type; actor: string }) {
  const { event } = detail;
  return (
    <>
      <Section title={event.description}>
        <Note>
          {eventNames[event.kind]} · {formatChf(event.amountCentimes)}
        </Note>
        <Note>{event.occurredOn}</Note>
        {event.payerId ? <Note>{payerLabel(event.kind, event.payerId === actor)}</Note> : null}
        <Note>
          Recorded by {event.createdBy === actor ? "you" : "your partner"} · {event.createdAt}
        </Note>
      </Section>
      <Section title="How this affects your balance">
        <Note>
          Positive changes increase what a person is owed or reduce what they owe. Negative changes
          do the reverse.
        </Note>
        {detail.shares.map((share) => (
          <Card key={share.memberId}>
            <Note>
              {share.memberId === actor ? "You" : "Your partner"} ·{" "}
              {formatChf(share.deltaCentimes, true)}
            </Note>
            {share.allocatedCentimes !== null ? (
              <Note>Allocated share: {formatChf(share.allocatedCentimes)}</Note>
            ) : null}
          </Card>
        ))}
      </Section>
      <EntryExtras detail={detail} />
    </>
  );
}
function EntryExtras({ detail }: { detail: typeof MoneyDetail.Type }) {
  const router = useRouter(),
    { event } = detail;
  const open = (eventId: string) => router.push({ pathname: "/money-event", params: { eventId } });
  return (
    <>
      {detail.receiptTotalCentimes != null ? (
        <Section title="Grocery purchase">
          <Note>Receipt total: {formatChf(detail.receiptTotalCentimes)}</Note>
          <Note>
            Shared amount: {formatChf(event.amountCentimes)}. Only this amount affects your balance.
          </Note>
        </Section>
      ) : null}
      {detail.category ? (
        <Section title="Category">
          <Note>{detail.category.name}</Note>
        </Section>
      ) : null}
      {detail.note ? (
        <Section title="Note">
          <Note>{detail.note}</Note>
        </Section>
      ) : null}
      {event.hasReceipt ? (
        <NativeAction
          label="View receipt"
          onPress={() => router.push({ pathname: "/receipt", params: { eventId: event.eventId } })}
        />
      ) : null}
      {event.relatedEventId ? (
        <NativeAction
          label="View related original entry"
          onPress={() => open(event.relatedEventId!)}
        />
      ) : null}
      {detail.reversedById ? (
        <Section title="Reversal recorded">
          <Note>Both entries remain in history.</Note>
          <NativeAction label="View reversal" onPress={() => open(detail.reversedById!)} />
        </Section>
      ) : null}
      <EntryActions detail={detail} />
      {event.kind === "settlement" ? (
        <Note>
          This records an entered payment; Nest does not transfer money or verify bank transactions.
        </Note>
      ) : null}
    </>
  );
}

function EntryActions({ detail }: { detail: typeof MoneyDetail.Type }) {
  const router = useRouter(),
    { event } = detail;
  return (
    <>
      {["expense", "replacement"].includes(event.kind) && detail.reversedById === null ? (
        <NativeAction
          label="Record a refund"
          onPress={() =>
            router.push({ pathname: "/refund-entry", params: { sourceEventId: event.eventId } })
          }
        />
      ) : null}
      {["expense", "replacement"].includes(event.kind) && detail.reversedById === null ? (
        <NativeAction
          label="Link to a recurring cycle"
          onPress={() =>
            router.push({ pathname: "/recurring-manual", params: { eventId: event.eventId } })
          }
        />
      ) : null}
      {event.kind !== "reversal" ? (
        <NativeAction
          label="Correct this entry"
          onPress={() =>
            router.push({ pathname: "/correction-entry", params: { sourceEventId: event.eventId } })
          }
        />
      ) : null}
    </>
  );
}
