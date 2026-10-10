import { execFileSync, execFile } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { fixtureLifecycle } from "./fixture-lifecycle.mjs";

const execute = promisify(execFile);

function sessionArguments(role) {
  if (role === undefined) return [];
  if (!/^[a-z][a-z0-9_]*$/u.test(role)) throw new Error("Invalid disposable fixture role");
  return ["-c", `set session authorization "${role}"`];
}

export function startFixturePostgres() {
  const bin = process.env.NEST_TEST_PG_BIN;
  if (!bin)
    throw new Error(
      "Set NEST_TEST_PG_BIN to a PostgreSQL server binary directory. Tests create their own cluster; no existing database URL is accepted.",
    );
  const directory = mkdtempSync(join(tmpdir(), "nest-db-"));
  const data = join(directory, "data");
  const socket = join(directory, "socket");
  mkdirSync(socket, { mode: 0o700 });
  const run = (command, args) =>
    execFileSync(join(bin, command), args, {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  const lifecycle = fixtureLifecycle(run, data, directory);
  try {
    run("initdb", ["-D", data, "--auth=trust", "--no-locale", "-E", "UTF8"]);
    lifecycle.starting();
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      join(directory, "server.log"),
      "-o",
      `-k ${socket} -h '' -p 55439 -c statement_timeout=5000 -c lock_timeout=3000`,
      "start",
    ]);
    const args = [
      "-X",
      "-h",
      socket,
      "-p",
      "55439",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-qAt",
    ];
    return {
      sql: (sql, role) =>
        execFileSync(join(bin, "psql"), [...args, ...sessionArguments(role), "-c", sql], {
          encoding: "utf8",
          timeout: 10000,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim(),
      file: (file, role) =>
        execFileSync(join(bin, "psql"), [...args, ...sessionArguments(role), "-f", file], {
          encoding: "utf8",
          timeout: 10000,
          stdio: ["pipe", "pipe", "pipe"],
        }),
      concurrent: (sql, role) =>
        execute(join(bin, "psql"), [...args, ...sessionArguments(role), "-c", sql], {
          encoding: "utf8",
          timeout: 10000,
        }),
      stop: lifecycle.stop,
    };
  } catch (error) {
    try {
      lifecycle.stop();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Fixture startup and cleanup failed");
    }
    throw error;
  }
}
