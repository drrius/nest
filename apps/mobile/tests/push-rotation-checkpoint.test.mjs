import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pushRotationCheckpoint } from "../src/push/rotation-checkpoint.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = require("effect/Effect");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("checkpoint binds account, installation, revision and token without storing the raw token", async () => {
  const values = new Map();
  const disk = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async () => {},
  };
  const account = { actor: id(1), household: id(2) };
  const hash = (token) => Effect.sync(() => createHash("sha256").update(token).digest("hex"));
  const make = (owner = account) => pushRotationCheckpoint({ account: owner, disk, hash });
  const receipt = {
    action: "register",
    actorId: id(1),
    householdId: id(2),
    installationId: id(3),
    revision: id(4),
  };
  assert.equal(await Effect.runPromise(make().matches(id(3), id(4), "secret-token")), false);
  await Effect.runPromise(make().record(receipt, "secret-token"));
  assert.equal([...values.values()][0].includes("secret-token"), false);
  assert.equal(await Effect.runPromise(make().matches(id(3), id(4), "secret-token")), true);
  assert.equal(await Effect.runPromise(make().matches(id(3), id(5), "secret-token")), false);
  assert.equal(await Effect.runPromise(make().matches(id(3), id(4), "changed-token")), false);
  assert.equal(await Effect.runPromise(make().matches(id(6), id(4), "secret-token")), false);
  assert.equal(
    await Effect.runPromise(
      make({ actor: id(7), household: id(2) }).matches(id(3), id(4), "secret-token"),
    ),
    false,
  );
  await assert.rejects(
    Effect.runPromise(make().record({ ...receipt, actorId: id(7) }, "secret-token")),
  );
  values.set([...values.keys()][0], "malformed");
  assert.equal(await Effect.runPromise(make().matches(id(3), id(4), "secret-token")), false);
});
