import * as Schema from "effect/Schema";
import { StoredSession } from "./protected-session-record.ts";
import { tokenIdentity } from "./token-identity.ts";

export function verifyLogoutRotation(before: typeof StoredSession.Type, value: unknown) {
  if (!Schema.is(StoredSession)(value)) throw new Error("Logout credentials unavailable");
  const previous = tokenIdentity(before.access_token),
    next = tokenIdentity(value.access_token);
  if (
    previous.actor !== next.actor ||
    previous.session !== next.session ||
    before.user.id.toLowerCase() !== previous.actor ||
    value.user.id.toLowerCase() !== previous.actor ||
    value.expires_at < before.expires_at
  )
    throw new Error("Logout identity changed");
  return value;
}
