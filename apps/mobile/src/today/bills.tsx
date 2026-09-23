import { useSyncExternalStore } from "react";
import { Link } from "expo-router";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useDueBills } from "../money/use-due-bills";
import { useSaveActivity } from "../money/use-save-activity";
import { DueBillRow, DueBillStatus } from "../money/due-bill-content";
import type { MoneyScreenAccount } from "../money/screen-gate";
import type { RecurringReadRuntime } from "../money/recurring-read-runtime";
export function TodayBills({ date }: { date: string }) {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.money) return null;
  if (offline.state.status !== "ready")
    return (
      <Section title="Bills to confirm">
        <Note>
          {offline.state.status === "error" ? "Could not open your account." : "Opening account…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry account" onPress={offline.retry} />
        ) : null}
      </Section>
    );
  return (
    <BillOwner
      key={`${offline.state.account.session.lease}:${date}`}
      account={offline.state.account}
      client={session.money}
      verify={session.retry}
    />
  );
}
function BillOwner(props: MoneyScreenAccount) {
  const runtime = useDueBills(props);
  return (
    <Section title="Bills to confirm">
      {runtime ? (
        <Bills runtime={runtime} verify={props.verify} />
      ) : (
        <Note>Loading due bills…</Note>
      )}
    </Section>
  );
}
function Bills({ runtime, verify }: { runtime: RecurringReadRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const page = view.entry?.kind === "due-variable" ? view.entry.value : null;
  return (
    <>
      <DueBillStatus view={view} runtime={runtime} verify={verify} />
      {page?.rules.slice(0, 3).map((rule) => (
        <DueBillRow key={rule.ruleId} rule={rule} />
      ))}
      {page && !page.rules.length ? <Note>No variable bills awaiting confirmation.</Note> : null}
      {page && (page.rules.length > 3 || page.next) ? <Note>More bills await review.</Note> : null}
      <Link href="/due-bills">View all due bills</Link>
    </>
  );
}
