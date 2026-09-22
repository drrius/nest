import * as Schema from "effect/Schema";
import { PushDeviceCommand, canonicalPushDevice } from "@nest/contracts/push-registration";
import type { Account } from "../offline/contracts.ts";
export interface PushProtectedDisk {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
const Uuid = Schema.String.check(Schema.isUUID());
const Envelope = Schema.Struct({
  version: Schema.Literal(1),
  actor: Uuid,
  household: Uuid,
  command: PushDeviceCommand,
});
const same = Schema.toEquivalence(PushDeviceCommand);
function keyFor(account: Account) {
  Schema.decodeUnknownSync(Schema.Struct({ actor: Uuid, household: Uuid }))(account, {
    onExcessProperty: "error",
  });
  return `nest.push.pending.v1.${account.actor.toLowerCase()}.${account.household.toLowerCase()}`;
}
function readEnvelope(raw: string | null, account: Account): PushDeviceCommand | null {
  if (raw === null) return null;
  try {
    const value = Schema.decodeUnknownSync(Envelope)(JSON.parse(raw), {
      onExcessProperty: "error",
    });
    if (
      value.actor !== account.actor.toLowerCase() ||
      value.household !== account.household.toLowerCase()
    )
      throw new Error("Account mismatch");
    return canonicalPushDevice(value.command);
  } catch {
    // Never attach schema input/cause: the persisted command contains a push token.
    throw new Error("Protected push state unavailable");
  }
}
// One application-owned instance serializes read/modify/write. Disk must be
// device-only protected storage; SQLite/AsyncStorage are not valid adapters.
export function protectedPushAttempts(disk: PushProtectedDisk) {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(body: () => Promise<T>) => {
    const result = tail.then(body);
    tail = result.catch(() => undefined);
    return result;
  };
  const read = async (account: Account) =>
    readEnvelope(await disk.getItem(keyFor(account)), account);
  return {
    read: (account: Account) => serial(() => read(account)),
    stage: (account: Account, input: PushDeviceCommand) =>
      serial(async () => {
        let command: PushDeviceCommand;
        try {
          command = canonicalPushDevice(
            Schema.decodeUnknownSync(PushDeviceCommand)(input, { onExcessProperty: "error" }),
          );
        } catch {
          throw new Error("Invalid push command");
        }
        const previous = await read(account);
        if (previous !== null && !same(previous, command))
          throw new Error("Push operation unresolved");
        if (previous !== null) return previous;
        await disk.setItem(
          keyFor(account),
          JSON.stringify({
            version: 1,
            actor: account.actor.toLowerCase(),
            household: account.household.toLowerCase(),
            command,
          }),
        );
        return command;
      }),
    clear: (account: Account, command: PushDeviceCommand) =>
      serial(async () => {
        const previous = await read(account);
        if (previous === null) return;
        if (!same(previous, canonicalPushDevice(command)))
          throw new Error("Push operation changed");
        await disk.removeItem(keyFor(account));
      }),
  };
}
