import * as Schema from "effect/Schema";
import { Member } from "./contracts.ts";

export const StoredSession = Schema.Struct({
  user: Schema.Struct({ id: Schema.String.check(Schema.isUUID()) }),
  access_token: Schema.String.check(Schema.isNonEmpty()),
  refresh_token: Schema.String.check(Schema.isNonEmpty()),
  expires_at: Schema.Finite,
});
const Envelope = Schema.Struct({
  nestVersion: Schema.Literal(2),
  session: StoredSession,
  member: Schema.NullOr(Member),
  logoutPending: Schema.optional(Schema.Boolean),
  cleanupRequired: Schema.optional(Schema.Boolean),
});
export function decodeProtectedSession(raw: string | null): typeof Envelope.Type | null {
  let value: unknown;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
  if (Schema.is(Envelope)(value)) return value;
  // The previous adapter wrote the SDK session directly. Keep its complete
  // payload, but require online membership verification before caching identity.
  if (Schema.is(StoredSession)(value))
    return { nestVersion: 2 as const, session: value, member: null };
  return null;
}
