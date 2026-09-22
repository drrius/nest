import type { ReactNode } from "react";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import type { RenewalClient } from "./client";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
import { NativeAction } from "../components/native-action";
export interface RenewalScreenAccount {
  account: OfflineAccount;
  client: RenewalClient;
  verify: () => void;
}
export function RenewalScreenGate({
  children,
}: {
  children: (props: RenewalScreenAccount) => ReactNode;
}) {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.renewals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (offline.state.status !== "ready")
    return (
      <Page>
        <Note>
          {offline.state.status === "error"
            ? "Could not open renewal recovery."
            : "Opening renewal recovery…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry saved views" onPress={offline.retry} />
        ) : null}
      </Page>
    );
  return children({
    account: offline.state.account,
    client: session.renewals,
    verify: session.retry,
  });
}
export function VerifyRenewal({ verify }: { verify: () => void }) {
  return (
    <Page>
      <Note>Verify your account before viewing renewals.</Note>
      <NativeAction label="Verify account" onPress={verify} />
    </Page>
  );
}
