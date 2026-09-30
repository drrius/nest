import test from "node:test";
import assert from "node:assert/strict";
import { protectedPushAttempts } from "../src/push/protected-attempt.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const command = {
  operationId: id(2),
  installationId: id(3),
  expectedRevision: null,
  action: "register",
  token: "ExponentPushToken[ProtectedFixture]",
};
function diskFixture() {
  const values = new Map();
  const disk = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
  return { values, disk };
}
test("protected attempt survives adapter restart and refuses intent replacement or foreign reads", async () => {
  const { disk } = diskFixture();
  const store = protectedPushAttempts(disk);
  await Promise.all([store.stage(account, command), store.stage(account, command)]);
  const restarted = protectedPushAttempts(disk);
  assert.deepEqual(await restarted.read(account), command);
  assert.equal(await restarted.read({ ...account, actor: id(4) }), null);
  const changed = { ...command, token: "changed" };
  await assert.rejects(restarted.stage(account, changed), /unresolved/);
  await assert.rejects(restarted.clear(account, changed), /changed/);
  assert.deepEqual(await restarted.read(account), command);
  await restarted.clear(account, command);
  assert.equal(await restarted.read(account), null);
});
test("protected write failures and corrupt records never look like successful staging", async () => {
  const { disk, values } = diskFixture();
  const failed = protectedPushAttempts({
    ...disk,
    setItem: async () => {
      throw new Error("locked");
    },
  });
  await assert.rejects(failed.stage(account, command), /locked/);
  assert.equal(await failed.read(account), null);
  const store = protectedPushAttempts(disk);
  await store.stage(account, command);
  for (const key of values.keys()) values.set(key, JSON.stringify({ token: command.token }));
  await assert.rejects(store.read(account), (error) => !String(error).includes(command.token));
  await assert.rejects(store.stage(account, command), /unavailable/);
});
