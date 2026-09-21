import * as Effect from "effect/Effect";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { readReceipt, receiptLink } from "./receipt.ts";
export function receiptRoute(url: URL, config: IdentityConfig, caller: AuthorizedCaller) {
  const query = url.searchParams;
  if (query.size !== 1) return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  const input = Object.fromEntries(query);
  return url.pathname.endsWith("/link")
    ? receiptLink(config, caller, input)
    : readReceipt(config, caller, input);
}
