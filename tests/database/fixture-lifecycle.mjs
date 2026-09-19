import { rmSync } from "node:fs";

export function fixtureLifecycle(run, data, directory) {
  let attempted = false;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    try {
      if (attempted) shutdown(run, data);
      rmSync(directory, { recursive: true, force: true });
      stopped = true;
    } finally {
      process.removeListener("exit", stop);
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
    }
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
  return {
    stop,
    starting: () => {
      attempted = true;
    },
  };
}

function shutdown(run, data) {
  for (const mode of ["fast", "immediate"]) {
    try {
      run("pg_ctl", ["-D", data, "-m", mode, "-t", "10", "stop"]);
      return;
    } catch {
      if (!running(run, data)) return;
    }
  }
  throw new Error(`Fixture PostgreSQL could not stop; retained data for recovery at ${data}`);
}

function running(run, data) {
  try {
    run("pg_ctl", ["-D", data, "status"]);
    return true;
  } catch (error) {
    if (error.status === 3 || error.status === 4) return false;
    throw error;
  }
}
