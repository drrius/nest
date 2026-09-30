import * as Schema from "effect/Schema";
import type { PushProtectedDisk } from "./protected-attempt.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const key = "nest.push.installation.v1";
export async function readPushInstallation(disk: PushProtectedDisk): Promise<string | null> {
  const saved = await disk.getItem(key);
  if (saved === null) return null;
  if (!Schema.is(Uuid)(saved)) throw new Error("Protected installation unavailable");
  return saved.toLowerCase();
}
// One singleton per app process. Identity is returned only after durable storage.
// A corrupt/unreadable identifier must not silently create a second registration.
export function protectedPushInstallation(disk: PushProtectedDisk, randomId: () => string) {
  let tail: Promise<unknown> = Promise.resolve();
  return () => {
    const result = tail.then(async () => {
      const saved = await readPushInstallation(disk);
      if (saved !== null) return saved;
      const id = randomId();
      if (!Schema.is(Uuid)(id)) throw new Error("Invalid installation identity");
      const canonical = id.toLowerCase();
      await disk.setItem(key, canonical);
      return canonical;
    });
    tail = result.catch(() => undefined);
    return result;
  };
}
