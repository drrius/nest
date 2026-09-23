import type { ReactNode } from "react";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import type { RecurringReminderClient } from "./client";
import type { RoutineClient } from "../routines/client";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
export interface ReminderEditorAccount {
  account: OfflineAccount;
  reminders: RecurringReminderClient;
  routines: RoutineClient;
  verify: () => void;
}
export function ReminderEditorGate({
  children,
}: {
  children: (props: ReminderEditorAccount) => ReactNode;
}) {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.recurringReminders || !session.routines)
    return (
      <Page>
        <Note>Sign in to manage recurring reminders.</Note>
      </Page>
    );
  if (offline.state.status !== "ready")
    return (
      <Page>
        <Note>
          {offline.state.status === "error"
            ? "Could not open saved reminder changes."
            : "Opening saved changes…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry saved changes" onPress={offline.retry} />
        ) : null}
      </Page>
    );
  return children({
    account: offline.state.account,
    reminders: session.recurringReminders,
    routines: session.routines,
    verify: session.retry,
  });
}
