import assert from "node:assert/strict";
import { excludedBoundaryId as id } from "./legacy-excluded-boundary-calls.mjs";
import {
  excludedFlow as flow,
  excludedRows as rows,
  excludedPerform as perform,
  excludedSnapshot as snapshot,
} from "./legacy-excluded-boundary-observer.mjs";
import {
  invokerFixture,
  invokerArchive as archive,
  invokerAttention as attention,
} from "./legacy-invoker-boundary-calls.mjs";

export function invokerFlows(db, cases) {
  for (const actor of [1, 2]) {
    archiveFlows(db, cases, actor);
    for (const page of [0, 1, 2, 10000])
      attentionFlow(db, cases, { actor, kind: "inventory", page });
    attentionFlow(db, cases, { actor, kind: "commitments", page: 0 });
    attentionFlow(db, cases, { actor, kind: "inventory", page: 0, query: "No matching records" });
  }
  for (const actor of [10021, 10023, null])
    for (const kind of ["inventory", "commitments"])
      attentionFlow(db, cases, { actor, kind, page: 0 });
}

function archiveFlows(db, cases, actor) {
  for (const restoring of [false, true]) {
    const option = restoring ? 10003 : 1312;
    const optionRows = rows("public.decision_options", `id='${id(option)}'`);
    const command = archive({
      option,
      archived: restoring ? "false" : "true",
      version: "(select version from invoker_original_version)",
    });
    const value = flow(db, cases, {
      actor,
      name: "archive_household_decision_option_versioned",
      reason: restoring
        ? "current-version-restore-old-version-refused"
        : "current-version-archive-old-version-refused",
      setup: restoring
        ? `update public.decision_options set archived_at=now() where id='${id(option)}';`
        : "",
      body: `create temporary table invoker_original_version as select updated_at version from public.decision_options where id='${id(option)}';
        ${perform(command)} ${snapshot("invoker_after_archive", optionRows)}
        do $$ begin
          begin perform ${command}; raise exception 'Old archive revision unexpectedly accepted';
          exception when serialization_failure then
            if sqlerrm<>'This option changed. Reload before trying again' then raise; end if;
          end;
        end $$;`,
      observation: `jsonb_build_object('unchangedAfterConflict',(select body=${optionRows} from invoker_after_archive),
        'archived',(select archived_at is not null from public.decision_options where id='${id(option)}'),
        'chosen',(select chosen from public.decision_options where id='${id(option)}'),
        'versionAdvanced',(select updated_at>(select version from invoker_original_version) from public.decision_options where id='${id(option)}'),
        'decisionStatus',(select status from public.household_decisions where id='${id(1311)}'))`,
    });
    assert.deepEqual(value, {
      unchangedAfterConflict: true,
      archived: !restoring,
      chosen: false,
      versionAdvanced: true,
      decisionStatus: "considering",
    });
  }
}

function attentionFlow(db, cases, { actor, kind, page, query = "Boundary" }) {
  const command = attention({ kind, page, query });
  const state = `jsonb_build_array(${rows("public.household_assets")},${rows("public.household_commitments")})`;
  const value = flow(db, cases, {
    actor,
    name: "list_home_attention_records",
    reason: `${kind}-page-${page}-${query === "Boundary" ? "tenant-isolation" : "empty-filter"}`,
    setup: `${invokerFixture()} create temporary table invoker_read_only as select ${state} body;`,
    body: `create temporary table invoker_attention_result as select ${command} body;`,
    observation: `jsonb_build_object('readOnly',(select body=${state} from invoker_read_only),
      'count',(select body->'count' from invoker_attention_result),
      'ids',(select coalesce(jsonb_agg(value->>'id' order by ordinal),'[]') from invoker_attention_result,
        jsonb_array_elements(body->'rows') with ordinality as item(value,ordinal)),
      'households',(select coalesce(jsonb_agg(distinct value->>'household_id'),'[]') from invoker_attention_result,
        jsonb_array_elements(body->'rows') item(value)))`,
  });
  assert.equal(value.readOnly, true);
  assert.deepEqual(value, expectedAttention({ actor, kind, page, query }));
}

function expectedAttention({ actor, kind, page, query }) {
  const own = actor === 1 || actor === 2,
    foreign = actor === 10021;
  if (query !== "Boundary" || (!own && !foreign))
    return { readOnly: true, count: 0, ids: [], households: [] };
  const ids = foreign
    ? [id(kind === "inventory" ? 10221 : 10321)]
    : kind === "commitments"
      ? [id(10301), id(10300)]
      : Array.from({ length: 25 }, (_, n) => n)
          .sort((a, b) => (a % 3) - (b % 3) || a - b)
          .map((n) => id(10400 + n));
  const pageIds = ids.slice(page * 20, (page + 1) * 20);
  return {
    readOnly: true,
    count: ids.length,
    ids: pageIds,
    households: pageIds.length ? [id(foreign ? 10020 : 10)] : [],
  };
}
