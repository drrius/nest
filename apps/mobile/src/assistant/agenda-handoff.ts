import * as Schema from "effect/Schema";
import { CalendarAgendaHandoff } from "@nest/contracts/calendar";
const Output = Schema.Struct({ ok: Schema.Literal(true), value: CalendarAgendaHandoff });
export function agendaHandoff(part: { state?: unknown; output?: unknown }) {
  if (part.state !== "output-available") return null;
  const result = Schema.decodeUnknownExit(Output)(part.output, { onExcessProperty: "error" });
  if (result._tag === "Failure") return null;
  return { label: "Open your private agenda on your iPhone", href: "/calendar" as const };
}
