import * as Schema from "effect/Schema";
import { Member, type Member as MemberValue } from "./contracts.ts";
export const authKey = "nest.auth.v1";
interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface OfflineIdentity {
  read(): Promise<MemberValue | null>;
  save(member: MemberValue): Promise<void>;
  clear(): Promise<void>;
}
const Session = Schema.Struct({
  user: Schema.Struct({ id: Schema.String.check(Schema.isUUID()) }),
  access_token: Schema.String.check(Schema.isNonEmpty()),
  refresh_token: Schema.String.check(Schema.isNonEmpty()),
  expires_at: Schema.Number,
});
const Envelope = Schema.Struct({
  nestVersion: Schema.Literal(2),
  session: Session,
  member: Schema.NullOr(Member),
  logoutPending: Schema.optional(Schema.Boolean),
});
function decode(raw: string | null): typeof Envelope.Type | null {
  const value: unknown = raw === null ? null : JSON.parse(raw);
  if (Schema.is(Envelope)(value)) return value;
  // The previous adapter wrote the SDK session directly. Keep its complete
  // payload, but require online membership verification before caching identity.
  if (Schema.is(Session)(value)) return { nestVersion: 2 as const, session: value, member: null };
  return null;
}
// One serialized protected record makes SDK credential deletion also delete the
// cached identity. SDK auxiliary keys remain untouched by the envelope format.
export function protectedStorage(disk: Storage) {
  let tail: Promise<unknown> = Promise.resolve();
  let blocked = false;
  let closing = false;
  function serial<A>(body: () => Promise<A>): Promise<A> {
    const result = tail.then(body);
    tail = result.catch(() => undefined);
    return result;
  }
  const change = (member: MemberValue | null) =>
    serial(async () => {
      const record = decode(await disk.getItem(authKey));
      if (!record || closing || record.logoutPending) return;
      if (member && member.userId !== record.session.user.id) return;
      await disk.setItem(authKey, JSON.stringify({ ...record, member }));
      blocked = false;
    });
  const identity: OfflineIdentity = {
    read: () =>
      serial(async () => {
        if (blocked || closing) return null;
        const record = decode(await disk.getItem(authKey));
        if (!record || record.logoutPending) return null;
        return record.member?.userId === record.session.user.id ? record.member : null;
      }),
    save: (member) => {
      blocked = true;
      return change(member);
    },
    clear: () => {
      blocked = true;
      return change(null);
    },
  };
  const storage: Storage = {
    getItem: (key) =>
      serial(async () => {
        const raw = await disk.getItem(key);
        if (key !== authKey) return raw;
        const record = decode(raw);
        return record && !closing && !record.logoutPending ? JSON.stringify(record.session) : null;
      }),
    setItem: (key, value) =>
      serial(async () => {
        if (key !== authKey) return disk.setItem(key, value);
        const session: unknown = JSON.parse(value);
        if (!Schema.is(Session)(session)) throw new Error("Invalid persisted session");
        const previous = decode(await disk.getItem(key));
        if (closing || previous?.logoutPending) throw new Error("Local logout pending");
        const member = previous?.session.user.id === session.user.id ? previous.member : null;
        await disk.setItem(key, JSON.stringify({ nestVersion: 2, session, member }));
      }),
    removeItem: (key) => serial(() => disk.removeItem(key)),
  };
  const beginLogout = () => {
    closing = true;
    blocked = true;
    return serial(async () => {
      const record = decode(await disk.getItem(authKey));
      if (record)
        await disk.setItem(
          authKey,
          JSON.stringify({ ...record, member: null, logoutPending: true }),
        );
    });
  };
  const beginSignIn = () =>
    serial(async () => {
      const record = decode(await disk.getItem(authKey));
      if (closing || record?.logoutPending) await disk.removeItem(authKey);
      closing = false;
    });
  return { storage, identity, beginLogout, beginSignIn };
}
