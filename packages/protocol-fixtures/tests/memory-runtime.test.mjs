import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { MemoryRuntime } from "../src/memory/runtime.ts";
import { memoryOwner } from "../src/memory/owner.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const memory = { id: id(100), revision: "1", content: "Private note" };
const approvalFor = (input) => ({
  id: id(102),
  operationId: input.operationId,
  change: {
    memoryId: input.memoryId,
    expectedRevision: input.expectedRevision,
    content: input.content,
  },
  status: "pending",
  expiresAt: "2099-01-01T00:00:00Z",
});
const failure = (code) => Effect.fail(new PreferenceFailure({ code }));
const base = (patch = {}) => ({
  list: () => Effect.succeed([]),
  approval: () => Effect.die("unexpected read"),
  propose: (input) => Effect.succeed(approvalFor(input)),
  decide: () => Effect.die("must require explicit consent"),
  remove: () => Effect.die("unexpected remove"),
  ...patch,
});
const uuid = () => {
  let n = 200;
  return () => id(n++);
};

test("proposing memory never confirms it; uncertain proposal retries immutable IDs and blocks new mutations", async () => {
  const calls = [];
  let decideCalls = 0;
  const runtime = new MemoryRuntime(
    base({
      propose: (input) => {
        calls.push(input);
        return calls.length === 1 ? failure("unavailable") : Effect.succeed(approvalFor(input));
      },
      decide: () => {
        decideCalls++;
        return Effect.succeed({ status: "denied" });
      },
    }),
    uuid(),
  );
  await runtime.load();
  await runtime.propose("First exact text");
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  await runtime.propose("Changed text");
  await runtime.load();
  await runtime.remove(memory);
  assert.equal(calls.length, 1);
  await runtime.retry();
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(runtime.getSnapshot().approval.change.content, "First exact text");
  assert.equal(decideCalls, 0);
  runtime.dismiss();
  assert.notEqual(runtime.getSnapshot().approval, null);
  await runtime.decide(false);
  assert.equal(decideCalls, 1);
  assert.equal(runtime.getSnapshot().approval, null);
});

test("lost confirmation cannot become denial or a new save; exact retry consumes once and reloads", async () => {
  const calls = [];
  let saved = false;
  const runtime = new MemoryRuntime(
    base({
      list: () => Effect.succeed(saved ? [memory] : []),
      decide: (input) => {
        calls.push(input);
        saved = true;
        return calls.length === 1 ? failure("unavailable") : Effect.succeed({ status: "consumed" });
      },
    }),
    uuid(),
  );
  await runtime.load();
  await runtime.propose(memory.content);
  await runtime.decide(true);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  await runtime.decide(false);
  await runtime.propose("different");
  await runtime.load();
  assert.equal(calls.length, 1);
  await runtime.retry();
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1].approved, true);
  assert.equal(runtime.getSnapshot().items[0].content, memory.content);
  assert.equal(runtime.getSnapshot().approval, null);
});

test("acknowledged deletion with failed reload only reloads and never resends removal", async () => {
  let reads = 0,
    writes = 0;
  const runtime = new MemoryRuntime(
    base({
      list: () =>
        ++reads === 1
          ? Effect.succeed([memory])
          : reads === 2
            ? failure("unavailable")
            : Effect.succeed([]),
      remove: () => {
        writes++;
        return Effect.succeed({ removed: true });
      },
    }),
    uuid(),
  );
  await runtime.load();
  await runtime.remove(memory);
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.retry();
  await runtime.remove(memory);
  assert.equal(writes, 1);
  await runtime.load();
  assert.deepEqual(runtime.getSnapshot().items, []);
  assert.equal(writes, 1);
});

test("conflicts stay blocked through failed reload, while authorization denial clears private content and form generation", async () => {
  let reads = 0;
  const runtime = new MemoryRuntime(
    base({
      list: () =>
        ++reads === 1
          ? Effect.succeed([memory])
          : reads === 2
            ? failure("unavailable")
            : failure("forbidden"),
      remove: () => failure("conflict"),
    }),
    uuid(),
  );
  await runtime.load();
  const generation = runtime.getSnapshot().generation;
  await runtime.remove(memory);
  assert.equal(runtime.getSnapshot().stage, "conflict");
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "conflict");
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.deepEqual(runtime.getSnapshot().items, []);
  assert.equal(runtime.getSnapshot().approval, null);
  assert.ok(runtime.getSnapshot().generation > generation);
});

test("resumed proposal never approves itself, and expired proposals can be dismissed without writes", async () => {
  const proposal = {
    ...approvalFor({
      operationId: id(101),
      memoryId: id(100),
      expectedRevision: "0",
      content: "Review me",
    }),
    expiresAt: "2000-01-01T00:00:00Z",
  };
  const runtime = new MemoryRuntime(
    base({ approval: () => Effect.succeed(proposal) }),
    uuid(),
    proposal.id,
  );
  await runtime.load();
  assert.equal(runtime.getSnapshot().approval.change.content, "Review me");
  runtime.dismiss();
  assert.equal(runtime.getSnapshot().approval, null);
});

test("disposal clears private state and late callbacks; strict remount gets a fresh runtime", async () => {
  let release;
  const client = base({
    list: () =>
      Effect.promise(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
  });
  const owner = memoryOwner(client, uuid(), null);
  const unsubscribe = owner.subscribe(() => {});
  const runtime = owner.getSnapshot();
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  unsubscribe();
  release([memory]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(runtime.getSnapshot().items, []);
  assert.equal(owner.getSnapshot(), null);
  const unmount = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), runtime);
  unmount();
});
