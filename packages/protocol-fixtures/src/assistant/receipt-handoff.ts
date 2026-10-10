import * as Schema from "effect/Schema";
import { ReceiptDeviceHandoff } from "@nest/contracts/receipt";
const Output = Schema.Struct({ ok: Schema.Literal(true), value: ReceiptDeviceHandoff });
const destinations = {
  "receipt-uploads": { label: "Review receipt uploads on your iPhone", href: "/receipt-uploads" },
  "expense-entry": {
    label: "Choose a receipt and review an expense on your iPhone",
    href: "/expense-entry",
  },
  "grocery-expense": {
    label: "Choose a receipt and review a grocery expense on your iPhone",
    href: "/grocery-expense",
  },
} as const;
export function receiptHandoff(
  part: { state?: unknown; output?: unknown },
  screen: keyof typeof destinations,
) {
  if (
    part.state !== "output-available" ||
    !Schema.is(Output)(part.output) ||
    part.output.value.screen !== screen
  )
    return null;
  return destinations[screen];
}
