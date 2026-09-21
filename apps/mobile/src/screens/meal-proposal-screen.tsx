import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { householdDate } from "@nest/domain/calendar";
import { requestedProposalScope, type ProposalScope } from "../meals/proposal-handoff";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import type { MealClient } from "../meals/client";
import { mealProposalOwner } from "../meals/proposal-owner";
import { ProposalPreview } from "../meals/proposal-preview";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function MealProposalScreen() {
  const session = useSession(),
    offline = useOfflineAccount(),
    params = useLocalSearchParams();
  const scope = requestedProposalScope(params, householdDate(new Date()));
  if (!scope)
    return (
      <Page>
        <Note>This proposal link is invalid. Open Meals and choose your week.</Note>
      </Page>
    );
  const routeKey = typeof scope === "string" ? scope : `${scope.weekStart}:${scope.proposalId}`;
  if (session.state.status !== "ready" || !session.meals)
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
            ? "Could not open saved proposal requests."
            : "Opening saved proposal requests…"}
        </Note>
        {offline.state.status === "error" ? (
          <NativeAction label="Retry" onPress={offline.retry} />
        ) : null}
      </Page>
    );
  return (
    <Proposal
      key={`${offline.state.account.session.lease}:${routeKey}`}
      account={offline.state.account}
      meals={session.meals}
      scope={scope}
      verify={session.retry}
    />
  );
}
function Proposal({
  account,
  meals,
  scope,
  verify,
}: {
  account: OfflineAccount;
  meals: MealClient;
  scope: ProposalScope;
  verify: () => void;
}) {
  const [owner] = useState(() => mealProposalOwner(meals, account, scope, Crypto.randomUUID));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ProposalPreview runtime={runtime} verify={verify} library={meals.library} />
  ) : (
    <Page>
      <Note>Opening your private proposal…</Note>
    </Page>
  );
}
