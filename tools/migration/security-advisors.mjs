import { execFileSync } from "node:child_process";
export function runFixtureAdvisors(db, binary) {
  if (!binary) return { ran: false, reason: "NEST_TEST_SUPABASE_BIN not configured" };
  const connection = JSON.parse(
    db.sql(`select json_build_object(
    'socket',current_setting('unix_socket_directories'),'port',current_setting('port'),'user',current_user)`),
  );
  if (!connection.socket.startsWith("/tmp/nest-db-") || connection.socket.includes(","))
    throw new Error("Advisors require the disposable fixture socket");
  const url = `postgresql://${encodeURIComponent(connection.user)}@localhost:${connection.port}/postgres?host=${encodeURIComponent(connection.socket)}`;
  let output;
  try {
    output = execFileSync(
      binary,
      ["db", "advisors", "--db-url", url, "--type", "security", "--fail-on", "error"],
      { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    throw new Error(
      `Fixture advisors failed: ${error.stdout?.toString() ?? ""} ${error.stderr?.toString() ?? error.message}`,
    );
  }
  return { ran: true, passedErrorGate: true, output: output.trim() };
}
