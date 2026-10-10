import * as Encoding from "effect/Encoding";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID());
const Claims = Schema.Struct({ sub: Uuid, session_id: Uuid });

// Identity comparisons only; authentication always requires server verification.
export function tokenIdentity(token: string) {
  try {
    if (token.length > 65536) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const decoded = Encoding.decodeBase64UrlString(parts[1]!);
    if (Result.isFailure(decoded)) throw new Error();
    const claims = Schema.decodeUnknownSync(Claims)(JSON.parse(decoded.success));
    return { actor: claims.sub.toLowerCase(), session: claims.session_id.toLowerCase() };
  } catch {
    throw new Error("Session identity unavailable");
  }
}
