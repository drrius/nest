import { cleanupReceipt } from "./receipt-cleanup.ts";
import { commandBody } from "../request-body.ts";
import * as Effect from "effect/Effect";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { readReceipt, receiptLink } from "./receipt.ts";
export function receiptRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  const url = new URL(request.url),
    query = url.searchParams;
  if (url.pathname.endsWith("/cleanup"))
    return Effect.gen(function* () {
      if (query.size) return yield* new ApiFailure({ code: "invalid_request" });
      return yield* cleanupReceipt(config, caller, yield* commandBody(request, 2048));
    });
  if (query.size !== 1) return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  const input = Object.fromEntries(query);
  return url.pathname.endsWith("/link")
    ? receiptLink(config, caller, input)
    : readReceipt(config, caller, input);
}
