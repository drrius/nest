import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { DailySummaryQuery } from "@nest/contracts/daily-summary";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import type { NotificationClient } from "../notifications/client";
import { summaryReadOwner } from "../notifications/summary-owner";
import { summaryReadOperations } from "../notifications/summary-operations";
import { SummaryContent } from "../notifications/summary-content";
import type { SummaryReadRuntime } from "../notifications/summary-runtime";
import { useSaveActivity } from "../money/use-save-activity";
export default function DailySummaryScreen() {
  const { summaryId } = useLocalSearchParams();
  const session = useSession(),
    offline = useOfflineAccount();
  if (!Schema.is(DailySummaryQuery)({ summaryId }))
    return (
      <Page>
        <Note>Invalid summary link.</Note>
      </Page>
    );
  if (session.state.status !== "ready" || !session.notification)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (offline.state.status !== "ready")
    return (
      <Page>
        <Note>Opening your account…</Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry account" onPress={offline.retry} />
        ) : null}
      </Page>
    );
  return (
    <OwnedSummary
      key={`${offline.state.account.session.lease}:${String(summaryId).toLowerCase()}`}
      account={offline.state.account}
      client={session.notification}
      summaryId={String(summaryId).toLowerCase()}
      verify={session.retry}
    />
  );
}
function OwnedSummary({
  account,
  client,
  summaryId,
  verify,
}: {
  account: OfflineAccount;
  client: NotificationClient;
  summaryId: string;
  verify: () => void;
}) {
  const [owner] = useState(() =>
    summaryReadOwner(summaryReadOperations(account, client), summaryId),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveSummary runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Opening your summary…</Note>
    </Page>
  );
}
function ActiveSummary({ runtime, verify }: { runtime: SummaryReadRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  return <SummaryContent runtime={runtime} view={view} verify={verify} />;
}
