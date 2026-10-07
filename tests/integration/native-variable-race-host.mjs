import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { variableCycleRaceFixture } from "./variable-cycle-race-fixture.mjs";
import { id } from "./recurring-variable-fixture.mjs";

const output = resolve(process.argv[2] ?? "");
if (!output.startsWith("/tmp/nest-variable-race-"))
  throw new Error("Expected owned temporary output");
let active;

async function closeCase() {
  if (!active) return;
  for (const cleanup of active.cleanups.toReversed()) await cleanup();
  active = undefined;
}

async function setup(first) {
  if (!["save", "cancel"].includes(first)) throw new Error("Unknown race order");
  await closeCase();
  const cleanups = [];
  const f = await variableCycleRaceFixture({ after: (fn) => cleanups.push(fn) }, first);
  active = { f, cleanups };
  return {
    actor: id(1),
    partner: id(2),
    household: id(10),
    bearer: f.bearer,
    input: f.command.input,
  };
}

async function control(path) {
  const f = active?.f;
  if (!f) throw new Error("No active fixture");
  if (path === "/control/state") return f.state();
  if (path === "/control/release-save") {
    f.releaseSave();
    return { released: true };
  }
  if (path === "/control/release") {
    await f.release();
    return { released: true };
  }
  if (path === "/control/outcome")
    return {
      ...f.state(),
      events: Number(f.db.sql("select count(*) from public.financial_events")),
      cycles: Number(f.db.sql("select count(*) from public.nest_recurring_cycles")),
      receipts: Number(f.db.sql("select count(*) from public.nest_recurring_cycle_receipts")),
      tombstones: Number(
        f.db.sql("select count(*) from public.nest_recurring_cycle_save_cancellations"),
      ),
      ledger: Number(f.db.sql("select count(*) from public.ledger_entries")),
      ledgerSum: f.db.sql(
        "select coalesce(sum(receivable_delta_cents),0) from public.ledger_entries",
      ),
    };
  throw new Error("Unknown fixture control");
}

const server = createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/control/")) {
      const value = request.url.startsWith("/control/setup/")
        ? await setup(request.url.split("/").at(-1))
        : await control(request.url);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
      return;
    }
    const f = active?.f;
    if (!f) throw new Error("No active fixture");
    const { request: forward } = await import("node:http");
    const upstream = forward(
      new URL(request.url, f.raceURL),
      { method: request.method, headers: request.headers },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      },
    );
    upstream.once("error", () => response.destroy());
    request.pipe(upstream);
  } catch {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "fixture_control_failed" }));
  }
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
writeFileSync(output, JSON.stringify({ port: server.address().port }) + "\n", { mode: 0o600 });
process.stdout.write("Owned local native race fixture listening; no hosted connections.\n");
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await closeCase();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    process.exit(0);
  });
