import * as Schema from "effect/Schema";
import { AgendaSelection } from "../calendar/agenda-selection.ts";
import type { Database } from "./database.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
export function readAgendaSelection(database: Database, session: Session) {
  return scoped(database, session, async (tx) => {
    const rows = await tx.all<{ data: string }>(
      "SELECT data FROM agenda_selection WHERE actor=? AND household=?",
      [session.actor, session.household],
    );
    if (!rows.length) return null;
    try {
      return Schema.decodeUnknownSync(AgendaSelection, { onExcessProperty: "error" })(
        JSON.parse(rows[0]!.data),
      );
    } catch {
      return fail("storage");
    }
  });
}
export function saveAgendaSelection(
  database: Database,
  session: Session,
  selection: AgendaSelection | null,
) {
  let data: string | null = null;
  if (selection !== null) {
    try {
      data = JSON.stringify(
        Schema.decodeUnknownSync(AgendaSelection, { onExcessProperty: "error" })(selection),
      );
    } catch {
      return fail("invalid_input");
    }
  }
  return scoped(database, session, async (tx) => {
    if (selection === null)
      await tx.run("DELETE FROM agenda_selection WHERE actor=? AND household=?", [
        session.actor,
        session.household,
      ]);
    else
      await tx.run(
        "INSERT INTO agenda_selection(actor,household,data) VALUES(?,?,?) ON CONFLICT(actor,household) DO UPDATE SET data=excluded.data",
        [session.actor, session.household, data],
      );
  });
}
