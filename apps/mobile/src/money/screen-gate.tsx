import type { ReactNode } from "react";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import type { MoneyClient } from "./client";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
import { NativeAction } from "../components/native-action";
export interface MoneyScreenAccount {
  account: OfflineAccount;
  client: MoneyClient;
  verify: () => void;
}
export function MoneyScreenGate({
  children,
}: {
  children: (props: MoneyScreenAccount) => ReactNode;
}) {
  const session = useSession(),
    offline = useOfflineAccount();
  if (session.state.status !== "ready" || !session.money)
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
            ? "Could not open saved Money views."
            : "Opening saved Money views…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry saved views" onPress={offline.retry} />
        ) : null}
      </Page>
    );
  return children({ account: offline.state.account, client: session.money, verify: session.retry });
}
export function VerifyMoney({ verify }: { verify: () => void }) {
  return (
    <Page>
      <Note>Verify your account before viewing Money.</Note>
      <NativeAction label="Verify account" onPress={verify} />
    </Page>
  );
}
