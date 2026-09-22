import { fixture as dismissal, id, run } from "./legacy-dismissal-fixture.mjs";
import { payload } from "../database/native-expense-helpers.mjs";
export { id, run };
export async function fixture(t, extraFiles = []) {
  const f = await dismissal(t, [
    "supabase/migrations/20260922023409_native_legacy_draft_confirmation.sql",
    ...extraFiles,
  ]);
  return {
    ...f,
    command: {
      ...f.command,
      input: {
        ...f.command.input,
        expense: payload({
          description: "Reviewed draft expense",
          note: "Reviewed note. ".repeat(220),
        }),
      },
    },
  };
}
