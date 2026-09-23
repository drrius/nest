import { Page, Section, Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { SummaryReadRuntime, SummaryReadView } from "./summary-runtime";
export function SummaryContent({
  runtime,
  view,
  verify,
}: {
  runtime: SummaryReadRuntime;
  view: SummaryReadView;
  verify: () => void;
}) {
  if (!view.active)
    return (
      <Page>
        <Note>Open your summary to read it.</Note>
      </Page>
    );
  const summary = view.entry?.summary;
  return (
    <Page>
      <Section title="Your daily summary">
        {!view.online ? <Note>Connect to read your saved summary.</Note> : null}
        {view.busy ? <Note>Opening your summary…</Note> : null}
        {view.notice ? <Note>{view.notice}</Note> : null}
        {view.verify ? <NativeAction label="Verify account" onPress={verify} /> : null}
        <NativeAction
          label="Retry summary"
          disabled={!view.online || view.busy}
          onPress={() => {
            void runtime.refresh();
          }}
        />
      </Section>
      {summary ? (
        <Section title={summary.date}>
          <Note>
            Saved when your daily summary was prepared. Counts may have changed since then.
            Responsibilities include yours and shared work.
          </Note>
          <Card>
            <Count label="Chores due" value={summary.choresDue} />
            <Count label="Overdue chores" value={summary.choresOverdue} />
            <Count label="Planned meals" value={summary.mealsPlanned} />
            <Count label="Renewals due" value={summary.renewalsDue} />
            <Count label="Cancellation deadlines" value={summary.cancellationDeadlines} />
          </Card>
          <Note>
            A renewal and its cancellation deadline can fall on the same day. These dates do not
            make payments or cancel subscriptions.
          </Note>
        </Section>
      ) : null}
    </Page>
  );
}
function Count({ label, value }: { label: string; value: { count: number; more: boolean } }) {
  return (
    <Note>
      {label}: {value.more ? "More than " : ""}
      {value.count}
    </Note>
  );
}
