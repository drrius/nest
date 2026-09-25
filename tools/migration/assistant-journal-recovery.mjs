import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const command = (entry, call = "committed-call") => `select public.nest_execute_ai_command(
  '${id(11)}','${entry.conversation}','${entry.turn}','${call}','addGrocery',${json(entry.input)})`;
const finish = (entry) => `select public.nest_finish_ai_turn(
  '${id(11)}','${entry.conversation}','${entry.turn}','interrupted',null)`;

export function seedAssistantJournalRecovery(db) {
  const entries = [false, true].map((terminal, index) => {
    const entry = {
      conversation: id(5000 + index * 10),
      turn: id(5001 + index * 10),
      input: {
        name: `Synthetic recovery grocery ${index}`,
        quantity: null,
        unit: null,
        categoryId: null,
      },
    };
    const message = {
      id: entry.turn,
      role: "user",
      parts: [{ type: "text", text: "Private recovery fixture" }],
    };
    db.sql(
      as(
        4,
        `select public.nest_begin_ai_turn('${id(11)}','${entry.conversation}',
      '${entry.turn}',0,${json(message)})`,
      ),
    );
    entry.result = JSON.parse(db.sql(as(4, command(entry))));
    assert.equal(entry.result.ok, true);
    if (terminal) db.sql(as(4, finish(entry)));
    entry.snapshot = snapshot(db, 4, entry);
    assert.equal(entry.snapshot.turns[0].state, terminal ? "interrupted" : "running");
    assert.deepEqual(entry.snapshot.commands[0].result, entry.result);
    entry.grocery = db.sql(
      `select to_jsonb(g) from public.grocery_items g where id='${entry.result.value.target}'`,
    );
    return entry;
  });
  return entries;
}

export function verifyAssistantJournalRecovery(db, entries) {
  for (const entry of entries) {
    assert.deepEqual(snapshot(db, 4, entry), entry.snapshot);
    for (const actor of [5, 3])
      assert.deepEqual(snapshot(db, actor, entry), { conversations: [], turns: [], commands: [] });
    assert.throws(
      () => db.sql(`set role anon; select * from public.nest_ai_commands`),
      /permission denied/,
    );
    for (const query of [command(entry), command(entry, "new-call"), finish(entry)])
      assert.throws(() => db.sql(as(4, query)), /permission denied/);
    assert.equal(
      db.sql(
        `select to_jsonb(g) from public.grocery_items g where id='${entry.result.value.target}'`,
      ),
      entry.grocery,
    );
    assert.deepEqual(snapshot(db, 4, entry), entry.snapshot);
  }
  return {
    runningAndInterruptedTurnsPreserved: true,
    privateCommandResultsPreserved: true,
    partnerAndOutsiderHidden: true,
    replayAndFinalizationRefused: true,
  };
}

function snapshot(db, actor, entry) {
  return JSON.parse(
    db.sql(
      as(
        actor,
        `select jsonb_build_object(
    'conversations',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.nest_ai_conversations c where id='${entry.conversation}'),
    'turns',(select coalesce(jsonb_agg(to_jsonb(t) order by operation_id),'[]') from public.nest_ai_turns t where conversation_id='${entry.conversation}'),
    'commands',(select coalesce(jsonb_agg(to_jsonb(c) order by sequence),'[]') from public.nest_ai_commands c where conversation_id='${entry.conversation}'))`,
      ),
    ),
  );
}
