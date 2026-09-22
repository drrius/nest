import test from "node:test";
import assert from "node:assert/strict";
import { protectedPushInstallation } from "../src/push/installation.ts";
const id = "123e4567-e89b-4000-8000-000000000001";
test("concurrent installation reads persist one identity and reconstruction retains it", async () => {
  let value = null,
    generated = 0,
    writes = 0;
  const disk = {
    getItem: async () => value,
    setItem: async (_, next) => {
      writes++;
      value = next;
    },
    removeItem: async () => {},
  };
  const read = protectedPushInstallation(disk, () => {
    generated++;
    return id.toUpperCase();
  });
  assert.deepEqual(await Promise.all([read(), read(), read()]), [id, id, id]);
  assert.equal(generated, 1);
  assert.equal(writes, 1);
  assert.equal(
    await protectedPushInstallation(disk, () => {
      throw new Error("must not generate");
    })(),
    id,
  );
  value = "corrupt";
  await assert.rejects(read(), /unavailable/);
  assert.equal(generated, 1);
});
test("failed protected write never returns a usable installation identity", async () => {
  let value = null,
    fail = true;
  const disk = {
    getItem: async () => value,
    setItem: async (_, next) => {
      if (fail) throw new Error("locked");
      value = next;
    },
    removeItem: async () => {},
  };
  const read = protectedPushInstallation(disk, () => id);
  await assert.rejects(read(), /locked/);
  assert.equal(value, null);
  fail = false;
  assert.equal(await read(), id);
});
