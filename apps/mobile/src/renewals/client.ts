import * as Effect from "effect/Effect";
import {
  RenewalListQuery,
  RenewalList,
  RenewalQuery,
  RenewalEnvelope,
} from "@nest/contracts/renewals";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { renewalRequests, validateRenewal, unavailableRenewal } from "./requests.ts";
import { renewalWriteClient } from "./write-client.ts";
export function renewalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = renewalRequests(apiUrl, account, credentials);
  return {
    ...renewalWriteClient(request),
    list: (after: string | null = null) =>
      Effect.gen(function* () {
        const query = yield* validateRenewal(RenewalListQuery, { after });
        const cursor = query.after?.toLowerCase() ?? null;
        const params = new URLSearchParams();
        if (cursor !== null) params.set("after", cursor);
        const result = yield* request(`v1/renewals?${params}`, RenewalList);
        if (result.after !== cursor) return yield* unavailableRenewal();
        return result;
      }),
    detail: (renewalId: string) =>
      Effect.gen(function* () {
        const query = yield* validateRenewal(RenewalQuery, { renewalId }),
          target = query.renewalId.toLowerCase();
        const result = yield* request(
          `v1/renewals/detail?${new URLSearchParams({ renewalId: target })}`,
          RenewalEnvelope,
        );
        if (result.renewal.renewalId !== target) return yield* unavailableRenewal();
        return result;
      }),
  };
}
export type RenewalClient = ReturnType<typeof renewalClient>;
