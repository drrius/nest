import { useState, useSyncExternalStore } from "react";
import { Link } from "expo-router";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { MoneyScreenAccount } from "../money/screen-gate";
import { pendingApprovalOperations } from "../money/pending-approval-operations";
import { pendingApprovalOwner } from "../money/pending-approval-owner";
import { pendingApprovalLink } from "../money/pending-approval-link";
import type {
  PendingApprovalView,
  PendingApprovalRuntime,
} from "../money/pending-approval-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useQuiet } from "../theme";

export function TodayPendingApprovals() {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.money) return null;
  return (
    <Section title="Your financial approvals">
      <Note>Private to you. Open a proposal to review its details before deciding.</Note>
      {offline.state.status === "ready" ? (
        <ApprovalOwner
          key={offline.state.account.session.lease}
          account={offline.state.account}
          client={session.money}
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
function ApprovalOwner({ account, client, verify }: MoneyScreenAccount) {
  const [owner] = useState(() => pendingApprovalOwner(pendingApprovalOperations(account, client)));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <Approvals runtime={runtime} verify={verify} />
  ) : (
    <Note>Loading approvals…</Note>
  );
}
function Approvals({ runtime, verify }: { runtime: PendingApprovalRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  return (
    <>
      <ApprovalRows view={view} />
      <NativeAction
        label={view.verify ? "Verify account" : "Refresh approvals"}
        disabled={view.busy || !view.active || !view.online}
        onPress={() => {
          if (view.verify) verify();
          else void runtime.select(null);
        }}
      />
      {view.entry?.next ? (
        <NativeAction
          label="Next approvals"
          onPress={() => void runtime.select(view.entry!.next)}
          disabled={view.busy}
        />
      ) : null}
      {view.after ? (
        <NativeAction
          label="Back to first approvals"
          onPress={() => void runtime.select(null)}
          disabled={view.busy}
        />
      ) : null}
    </>
  );
}

function ApprovalRows({ view }: { view: PendingApprovalView }) {
  const colors = useQuiet();
  return (
    <>
      {!view.online ? <Note>Connect to view your pending approvals.</Note> : null}
      {view.busy ? <Note>Loading approvals…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.entry?.approvals.map((row) => {
        const link = pendingApprovalLink(row);
        return (
          <Link
            key={row.approvalId}
            href={link.href}
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 12 }}
          >
            {link.label}
          </Link>
        );
      })}
      {view.entry?.approvals.length === 0 ? (
        <Note>
          {view.after ? "No further pending approvals." : "No pending financial approvals."}
        </Note>
      ) : null}
    </>
  );
}
