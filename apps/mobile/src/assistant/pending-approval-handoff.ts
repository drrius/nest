import * as Schema from "effect/Schema";
import { PendingFinancialApprovals } from "@nest/contracts/pending-financial-approvals";
const Output = Schema.Struct({ ok: Schema.Literal(true), value: PendingFinancialApprovals });
export function pendingApprovalHandoff(part: { state?: unknown; output?: unknown }) {
  if (part.state !== "output-available") return null;
  const result = Schema.decodeUnknownOption(Output, { onExcessProperty: "error" })(part.output);
  if (result._tag === "None") return null;
  return {
    label: "Open Today to review your current private approvals",
    href: "/household" as const,
  };
}
