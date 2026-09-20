import { startFixturePostgres } from "./fixture-postgres.mjs";
import { aiChoreTransferFiles } from "./ai-chore-transfer-files.mjs";
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
export function transferJournalFixture() {
  const db = startFixturePostgres();
  for (const file of aiChoreTransferFiles) db.file(file);
  let sequence = 1000;
  const next = () => id(sequence++);
  function start(actor = id(1)) {
    const conversation = next(),
      turn = next();
    const message = {
      id: turn,
      role: "user",
      parts: [{ type: "text", text: "Answer this handover" }],
    };
    const claim = JSON.parse(
      db.sql(
        as(
          `select public.nest_begin_ai_turn('${id(10)}','${conversation}','${turn}',0,${json(message)})`,
          actor,
        ),
      ),
    );
    return { actor, conversation, turn, claim };
  }
  function create() {
    const definition = {
      title: "Journal handover",
      schedule: { kind: "daily" },
      assignment: { policy: "assigned", memberId: id(1) },
    };
    const routine = JSON.parse(
      db.sql(as(`select public.nest_create_routine('${id(10)}','${next()}',${json(definition)})`)),
    );
    const input = JSON.parse(
      db.sql(`select jsonb_build_object('occurrenceId',id,'expectedDueDate',due_date,'recipientId','${id(2)}')
      from public.routine_occurrences where routine_id='${routine.routineId}' and role='current'`),
    );
    return { routine, input };
  }
  const command = (turn, tool, input, call = "handover") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, tool, input, call) =>
    JSON.parse(db.sql(as(command(turn, tool, input, call), turn.actor)));
  function pending() {
    const created = create(),
      turn = start();
    const saved = execute(turn, "requestChoreTransfer", created.input);
    return {
      ...created,
      turn,
      saved,
      response: { requestId: saved.value.requestId, action: "accept" },
    };
  }
  return { db, start, create, next, command, execute, pending };
}
