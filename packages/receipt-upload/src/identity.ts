import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  receiptRequest,
  responseJson,
  responseFailure,
  decodeFailure,
  type UploadConfig,
} from "./http.ts";
import { ReceiptUploadFailure } from "./bytes.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const AuthUser = Schema.Struct({ id: Uuid, is_anonymous: Schema.optional(Schema.Boolean) });
const Members = Schema.Array(Schema.Struct({ user_id: Uuid, household_id: Uuid }));
export interface UploadCaller {
  token: string;
  userId: string;
  householdId: string;
}
const read = (config: UploadConfig, token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* receiptRequest(config, token, path);
    if (!response.ok) return yield* responseFailure(response);
    return yield* responseJson(response);
  });
export function uploadCaller(config: UploadConfig, request: Request) {
  return Effect.gen(function* () {
    const header = request.headers.get("authorization") ?? "";
    if (!/^Bearer [^\s]+$/.test(header))
      return yield* new ReceiptUploadFailure({ code: "session" });
    const token = header.slice(7),
      raw = yield* read(config, token, "auth/v1/user");
    const user = yield* Schema.decodeUnknownEffect(AuthUser)(raw).pipe(
      Effect.mapError(decodeFailure),
    );
    if (user.is_anonymous) return yield* new ReceiptUploadFailure({ code: "session" });
    const query = new URLSearchParams({
      select: "user_id,household_id",
      user_id: `eq.${user.id}`,
      limit: "2",
    });
    const members = yield* Schema.decodeUnknownEffect(Members)(
      yield* read(config, token, `rest/v1/household_members?${query}`),
    ).pipe(Effect.mapError(decodeFailure));
    const member = members[0];
    if (members.length !== 1 || !member || member.user_id !== user.id)
      return yield* new ReceiptUploadFailure({ code: "forbidden" });
    if (
      request.headers.get("x-nest-household")?.toLowerCase() !== member.household_id.toLowerCase()
    )
      return yield* new ReceiptUploadFailure({ code: "forbidden" });
    return { token, userId: user.id.toLowerCase(), householdId: member.household_id.toLowerCase() };
  });
}
