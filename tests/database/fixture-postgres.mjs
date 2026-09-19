import { execFileSync, execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

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
  let started = false;
  try {
    run("initdb", ["-D", data, "--auth=trust", "--no-locale", "-E", "UTF8"]);
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      join(directory, "server.log"),
      "-o",
      `-k ${socket} -h '' -p 55439 -c statement_timeout=5000 -c lock_timeout=3000`,
      "start",
    ]);
    started = true;
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
    const stop = registerCleanup(() => {
      run("pg_ctl", ["-D", data, "-m", "fast", "-t", "10", "stop"]);
      rmSync(directory, { recursive: true });
    });
    return {
      sql: (sql) =>
        execFileSync(join(bin, "psql"), [...args, "-c", sql], {
          encoding: "utf8",
          timeout: 10000,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim(),
      file: (file) =>
        execFileSync(join(bin, "psql"), [...args, "-f", file], {
          encoding: "utf8",
          timeout: 10000,
          stdio: ["pipe", "pipe", "pipe"],
        }),
      concurrent: (sql) =>
        execute(join(bin, "psql"), [...args, "-c", sql], { encoding: "utf8", timeout: 10000 }),
      stop,
    };
  } catch (error) {
    if (started) run("pg_ctl", ["-D", data, "-m", "fast", "stop"]);
    rmSync(directory, { recursive: true });
    throw error;
  }
}

function registerCleanup(cleanup) {
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    cleanup();
    stopped = true;
    process.removeListener("exit", stop);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  };
  const signal = (code) => {
    try {
      stop();
    } finally {
      process.exit(code);
    }
  };
  const interrupt = () => signal(130);
  const terminate = () => signal(143);
  process.once("exit", stop);
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  return stop;
}
