import type { ReactNode } from "react";
import { useSession } from "../session/provider";
import { RenewalScreenGate, type RenewalScreenAccount } from "./screen-gate";
import type { MoneyClient } from "../money/client";
import type { RoutineClient } from "../routines/client";
import { Page, Note } from "../components/page";
export interface RenewalEditorAccount extends RenewalScreenAccount {
  money: MoneyClient;
  routines: RoutineClient;
}
export function RenewalEditorGate({
  children,
}: {
  children: (props: RenewalEditorAccount) => ReactNode;
}) {
  const { money, routines } = useSession();
  if (!money || !routines)
    return (
      <Page>
        <Note>Sign in to manage renewals.</Note>
      </Page>
    );
  return (
    <RenewalScreenGate>{(props) => children({ ...props, money, routines })}</RenewalScreenGate>
  );
}
