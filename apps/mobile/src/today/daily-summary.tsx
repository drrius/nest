import { useState, useSyncExternalStore } from "react";
import { Link } from "expo-router";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import type { NotificationClient } from "../notifications/client";
import { summaryReadOwner } from "../notifications/summary-owner";
import { summaryReadOperations } from "../notifications/summary-operations";
import type { SummaryReadRuntime } from "../notifications/summary-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useQuiet } from "../theme";
export function TodayDailySummary() {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.notification) return null;
  return (
    <Section title="Your saved daily summary">
      {offline.state.status === "ready" ? (
        <SummaryOwner
          key={offline.state.account.session.lease}
          account={offline.state.account}
          client={session.notification}
          verify={session.retry}
        />
      ) : (
        <>
          <Note>
            {offline.state.status === "error" ? "Could not open your account." : "Opening account…"}
          </Note>
          {offline.state.status === "error" ? (
            <NativeAction label="Retry account" onPress={offline.retry} />
          ) : null}
        </>
      )}
    </Section>
  );
}
function SummaryOwner({
  account,
  client,
  verify,
}: {
  account: OfflineAccount;
  client: NotificationClient;
  verify: () => void;
}) {
  const [owner] = useState(() => summaryReadOwner(summaryReadOperations(account, client), null));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <Summary runtime={runtime} verify={verify} />
  ) : (
    <Note>Loading your summary…</Note>
  );
}
function Summary({ runtime, verify }: { runtime: SummaryReadRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const colors = useQuiet();
  useSaveActivity(runtime);
  return (
    <>
      {!view.online ? <Note>Connect to find your saved summary.</Note> : null}
      {view.busy ? <Note>Loading your summary…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.loaded && !view.entry ? (
        <Note>No daily summary has been saved for you yet.</Note>
      ) : null}
      {view.entry ? (
        <>
          <Note>
            Saved for {view.entry.summary.date}. This snapshot may differ from today’s live
            information.
          </Note>
          <Link
            href={{ pathname: "/daily-summary", params: { summaryId: view.entry.summaryId } }}
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 12 }}
          >
            Open saved summary
          </Link>
        </>
      ) : null}
      <NativeAction
        label="Refresh summary"
        disabled={view.busy || !view.active || !view.online}
        onPress={() => void runtime.refresh()}
      />
      {view.verify ? <NativeAction label="Verify account" onPress={verify} /> : null}
    </>
  );
}
