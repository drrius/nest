import { StoredSession, decodeProtectedSession } from "./protected-session-record.ts";
import { verifyLogoutRotation } from "./logout-rotation.ts";
const key = "nest.auth.v1";
type Session = typeof StoredSession.Type;
interface Disk {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export function pendingLogoutCredentials(
  disk: Disk,
  serial: <A>(body: () => Promise<A>) => Promise<A>,
) {
  const readRecord = async () => {
    const raw = await disk.getItem(key);
    const record = decodeProtectedSession(raw);
    if (raw !== null && record === null) throw new Error("Logout credentials unavailable");
    return record;
  };
  return {
    completed: () => serial(async () => (await readRecord())?.cleanupComplete === true),
    complete: (expectedToken: string | null) =>
      serial(async () => {
        const record = await readRecord();
        if (!record && expectedToken === null) return;
        if (!record?.logoutPending || record.session.access_token !== expectedToken)
          throw new Error("Logout credentials changed");
        await disk.setItem(
          key,
          JSON.stringify({ ...record, cleanupRequired: false, cleanupComplete: true }),
        );
      }),
    read: () =>
      serial(async () => {
        const record = await readRecord();
        return record?.logoutPending ? record.session : null;
      }),
    replace: (expected: Session, replacement: Session) =>
      serial(async () => {
        const record = await readRecord();
        if (
          !record?.logoutPending ||
          (!sameTokens(record.session, expected) && !sameTokens(record.session, replacement))
        )
          throw new Error("Logout credentials changed");
        verifyLogoutRotation(expected, replacement);
        verifyLogoutRotation(record.session, replacement);
        await disk.setItem(key, JSON.stringify({ ...record, session: replacement, member: null }));
      }),
  };
}
export type PendingLogoutCredentials = ReturnType<typeof pendingLogoutCredentials>;
function sameTokens(left: Session, right: Session) {
  return left.access_token === right.access_token && left.refresh_token === right.refresh_token;
}
