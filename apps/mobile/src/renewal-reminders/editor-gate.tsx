import type { ReactNode } from "react";
import { useSession } from "../session/provider";
import { RenewalScreenGate, type RenewalScreenAccount } from "../renewals/screen-gate";
import type { RenewalReminderClient } from "./client";
import type { RoutineClient } from "../routines/client";
import { Page, Note } from "../components/page";
export interface ReminderEditorAccount extends RenewalScreenAccount {
  reminders: RenewalReminderClient;
  routines: RoutineClient;
}
export function ReminderEditorGate({
  children,
}: {
  children: (props: ReminderEditorAccount) => ReactNode;
}) {
  const { renewalReminders: reminders, routines } = useSession();
  if (!reminders || !routines)
    return (
      <Page>
        <Note>Sign in to manage renewals.</Note>
      </Page>
    );
  return (
    <RenewalScreenGate>{(props) => children({ ...props, reminders, routines })}</RenewalScreenGate>
  );
}
