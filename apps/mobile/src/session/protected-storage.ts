import * as Schema from "effect/Schema";
import { type Member as MemberValue } from "./contracts.ts";
import { StoredSession, decodeProtectedSession } from "./protected-session-record.ts";
import { pendingLogoutCredentials } from "./pending-logout-credentials.ts";
import { verifyLogoutRotation } from "./logout-rotation.ts";
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
// One serialized protected record makes SDK credential deletion also delete the
// cached identity. SDK auxiliary keys remain untouched by the envelope format.
export function protectedStorage(disk: Storage) {
  const serial = serializeStorage();
  let blocked = false;
  let closing = false;
  const change = (member: MemberValue | null) =>
    serial(async () => {
      const record = decodeProtectedSession(await disk.getItem(authKey));
      if (!record || closing || record.logoutPending) return;
      if (member && member.userId !== record.session.user.id) return;
      await disk.setItem(authKey, JSON.stringify({ ...record, member }));
      blocked = false;
    });
  const identity: OfflineIdentity = {
    read: () =>
      serial(async () => {
        if (blocked || closing) return null;
        const record = decodeProtectedSession(await disk.getItem(authKey));
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
        const record = decodeProtectedSession(raw);
        return record && !closing && !record.logoutPending ? JSON.stringify(record.session) : null;
      }),
    setItem: (key, value) => serial(() => persistSdkSession(disk, { key, value }, closing)),
    removeItem: (key) =>
      serial(async () => {
        if (key === authKey && decodeProtectedSession(await disk.getItem(key))?.cleanupRequired)
          throw new Error("Logout cleanup required");
        await disk.removeItem(key);
      }),
  };
  const beginLogout = (cleanupRequired = false) => {
    closing = true;
    blocked = true;
    return serial(() => persistLogout(disk, cleanupRequired));
  };
  const beginSignIn = () =>
    serial(async () => {
      const record = decodeProtectedSession(await disk.getItem(authKey));
      if (record?.cleanupRequired) throw new Error("Logout cleanup required");
      if (!record || closing || record.logoutPending) await disk.removeItem(authKey);
      closing = false;
    });
  return {
    storage,
    identity,
    beginLogout,
    beginSignIn,
    logoutCredentials: pendingLogoutCredentials(disk, serial),
  };
}

function serializeStorage() {
  let tail: Promise<unknown> = Promise.resolve();
  return <A>(body: () => Promise<A>): Promise<A> => {
    const result = tail.then(body);
    tail = result.catch(() => undefined);
    return result;
  };
}

async function persistLogout(disk: Storage, cleanupRequired: boolean) {
  const record = decodeProtectedSession(await disk.getItem(authKey));
  if (record)
    await disk.setItem(
      authKey,
      JSON.stringify({
        ...record,
        member: null,
        logoutPending: true,
        cleanupRequired: record.cleanupComplete ? false : record.cleanupRequired || cleanupRequired,
      }),
    );
  return record?.session.access_token ?? null;
}

async function persistSdkSession(
  disk: Storage,
  input: { key: string; value: string },
  closing: boolean,
) {
  const { key, value } = input;
  if (key !== authKey) return disk.setItem(key, value);
  const session: unknown = JSON.parse(value);
  if (!Schema.is(StoredSession)(session)) throw new Error("Invalid persisted session");
  const previous = decodeProtectedSession(await disk.getItem(key));
  if (previous?.cleanupRequired) {
    verifyLogoutRotation(previous.session, session);
    return disk.setItem(key, JSON.stringify({ ...previous, session, member: null }));
  }
  if (closing || previous?.logoutPending) throw new Error("Local logout pending");
  const member = previous?.session.user.id === session.user.id ? previous.member : null;
  await disk.setItem(key, JSON.stringify({ nestVersion: 2, session, member }));
}
