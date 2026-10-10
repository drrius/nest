import * as Schema from "effect/Schema";
import { CalendarIds } from "./selection.ts";

// Display selection grants no busy-sharing consent and stores no personal event content.
export const AgendaSelection = Schema.Struct({ calendarIds: CalendarIds });
export type AgendaSelection = typeof AgendaSelection.Type;
