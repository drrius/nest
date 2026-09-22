import * as Effect from "effect/Effect";
import { RenewalReminderQuery, RenewalReminderEnvelope } from "@nest/contracts/reminders";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { renewalRequests, validateRenewal, unavailableRenewal } from "../renewals/requests.ts";
import { renewalReminderWriteClient } from "./write-client.ts";
export function renewalReminderClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = renewalRequests(apiUrl, account, credentials);
  return {
    ...renewalReminderWriteClient(request),
    detail: (renewalId: string) =>
      Effect.gen(function* () {
        const query = yield* validateRenewal(RenewalReminderQuery, { renewalId }),
          target = query.renewalId.toLowerCase();
        const result = yield* request(
          `v1/renewal-reminders/detail?${new URLSearchParams({ renewalId: target })}`,
          RenewalReminderEnvelope,
        );
        if (result.renewalId !== target) return yield* unavailableRenewal();
        return result;
      }),
  };
}
export type RenewalReminderClient = ReturnType<typeof renewalReminderClient>;
