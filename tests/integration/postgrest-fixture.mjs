import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { startFixturePostgres } from "../database/fixture-postgres.mjs";

function token(secret, user) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role: "authenticated",
    sub: user,
    exp: Math.floor(Date.now() / 1000) + 300,
  })}`;
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}

function probe(socketPath) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ socketPath, path: "/" }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    request.setTimeout(500, () => request.destroy(new Error("Readiness timeout")));
    request.once("error", reject);
    request.end();
  });
}

async function ready(child, socket) {
  if (!child.pid) throw new Error("PostgREST could not start");
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error("PostgREST exited before readiness");
    if ((await probe(socket).catch(() => 0)) === 200) return;
    await delay(100);
  }
  throw new Error("PostgREST did not become ready");
}

function bridge(socket, users) {
  return createServer((request, response) => {
    if (request.url === "/auth/v1/user") {
      const user = users.get(request.headers.authorization?.slice(7));
      response.writeHead(user ? 200 : 401, { "content-type": "application/json" });
      response.end(JSON.stringify(user ? { id: user } : {}));
      return;
    }
    const upstream = httpRequest(
      {
        socketPath: socket,
        path: request.url.replace(/^\/rest\/v1/, ""),
        method: request.method,
        headers: request.headers,
      },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      },
    );
    upstream.once("error", () => response.writeHead(503).end());
    request.once("aborted", () => upstream.destroy());
    request.pipe(upstream);
  });
}

async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}

export async function postgrestFixture(t) {
  if (!process.env.NEST_TEST_POSTGREST_BIN)
    throw new Error("Set NEST_TEST_POSTGREST_BIN to a verified PostgREST binary");
  const db = startFixturePostgres();
  let child;
  let server;
  const terminate = () => child?.kill("SIGTERM");
  process.prependOnceListener("SIGINT", terminate);
  process.prependOnceListener("SIGTERM", terminate);
  process.once("exit", terminate);
  t.after(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (child) await stop(child);
    } finally {
      process.removeListener("SIGINT", terminate);
      process.removeListener("SIGTERM", terminate);
      process.removeListener("exit", terminate);
      db.stop();
    }
  });
  db.file("tests/database/legacy-chore-fixture.sql");
  db.file("tests/integration/chore-postgrest.sql");
  db.file("supabase/migrations/20260919205503_native_chore_receipts.sql");
  const socketDirectory = db.sql("show unix_socket_directories");
  const socket = join(socketDirectory, "postgrest.sock");
  const secret = randomBytes(32).toString("hex");
  const query = new URLSearchParams({
    host: socketDirectory,
    port: "55439",
    user: db.sql("select current_user"),
  });
  child = spawn(process.env.NEST_TEST_POSTGREST_BIN, [], {
    stdio: "ignore",
    env: {
      ...process.env,
      PGRST_DB_URI: `postgresql:///postgres?${query}`,
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: secret,
      PGRST_SERVER_UNIX_SOCKET: socket,
      PGRST_DB_CONFIG: "false",
      PGRST_LOG_LEVEL: "error",
    },
  });
  child.on("error", () => undefined);
  await ready(child, socket);
  const user = "00000000-0000-4000-8000-000000000001";
  const outsider = "00000000-0000-4000-8000-000000000003";
  const bearer = token(secret, user);
  const otherBearer = token(secret, outsider);
  server = bridge(
    socket,
    new Map([
      [bearer, user],
      [otherBearer, outsider],
    ]),
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { db, bearer, otherBearer, url: `http://127.0.0.1:${server.address().port}` };
}
