import * as Schema from "effect/Schema";
import { DailySummarySnapshot } from "@nest/contracts/daily-summary";
const Output = Schema.Struct({ ok: Schema.Literal(true), value: DailySummarySnapshot });
export function summaryHandoff(part: { state?: unknown; output?: unknown }) {
  if (part.state !== "output-available") return null;
  const result = Schema.decodeUnknownOption(Output, { onExcessProperty: "error" })(part.output);
  if (result._tag === "None") return null;
  return {
    label: "Open your saved daily summary",
    href: {
      pathname: "/daily-summary" as const,
      params: { summaryId: result.value.value.summaryId },
    },
  };
}
