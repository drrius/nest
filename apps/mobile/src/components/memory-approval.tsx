import { useState } from "react";
import type { MemoryRuntime } from "../memory/runtime";
import { approvalCanSave, type MemoryView } from "../memory/state";
import { Card, Section, Note } from "./page";
import { NativeAction } from "./native-action";
export function MemoryApprovalCard({
  runtime,
  view,
}: {
  runtime: MemoryRuntime;
  view: MemoryView;
}) {
  const [openedAt] = useState(() => Date.now());
  const approval = view.approval;
  if (!approval) return null;
  const active =
    ["pending", "approved"].includes(approval.status) && Date.parse(approval.expiresAt) > openedAt;
  const disabled = view.busy || view.stage !== "ready";
  const canSave = approvalCanSave(view);
  return (
    <Card>
      <Section title="Allow Nest to remember this?" />
      <Note>{approval.change.content}</Note>
      <Note>
        Private to you. Confirm only if you want this exact text saved for future conversations.
      </Note>
      {!active ? (
        <>
          <Note>
            {approval.status === "consumed"
              ? "This memory was already saved. The current list is below."
              : "This proposal was declined or has expired. It cannot save a new memory."}
          </Note>
          <NativeAction label="Close proposal" onPress={runtime.dismiss} disabled={disabled} />
        </>
      ) : (
        <>
          {!canSave ? (
            <Note>
              The memory changed or your list is full. Decline this proposal, then edit the current
              saved memory.
            </Note>
          ) : null}
          <NativeAction
            label="Confirm and save memory"
            onPress={() => {
              void runtime.decide(true);
            }}
            disabled={disabled || !canSave}
          />
          <NativeAction
            label="Do not remember this"
            onPress={() => {
              void runtime.decide(false);
            }}
            disabled={disabled}
          />
        </>
      )}
    </Card>
  );
}
