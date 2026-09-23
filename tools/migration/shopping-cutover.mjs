import assert from "node:assert/strict";
const shoppingFunctions = [
  "cancel_shopping_session(uuid)",
  "claim_grocery_item(uuid,uuid)",
  "finish_shopping_session(uuid,text,date,bigint,text,boolean,text,bigint,uuid,jsonb)",
  "merge_grocery_items(uuid,uuid,text,text,text,uuid,text,integer,text)",
  "release_grocery_item(uuid,uuid)",
  "remove_grocery_item(uuid)",
  "start_shopping_session(uuid)",
];
export function verifyShoppingCutover(db) {
  const before = snapshot(db);
  const revokes = shoppingFunctions
    .map(
      (signature) =>
        `revoke all on function public.${signature} from public,anon,authenticated,service_role;`,
    )
    .join("\n");
  const probes = shoppingFunctions
    .map((signature) => {
      const [name, args] = signature.slice(0, -1).split("(");
      const call = `${name}(${args
        .split(",")
        .map((type) => `null::${type}`)
        .join(",")})`;
      return `if has_function_privilege('authenticated','public.${signature}','EXECUTE') then
        raise exception 'Legacy execute grant remains'; end if;
      begin perform public.${call}; raise exception 'Legacy command remained callable: ${name}';
      exception when insufficient_privilege then null; end;`;
    })
    .join("\n");
  const result = JSON.parse(
    db.sql(`begin; ${revokes}
    set local role authenticated;
    set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
    do $probe$ begin ${probes} end $probe$;
    select public.nest_grocery_snapshot('00000000-0000-4000-8000-000000000010');
    rollback;`),
  );
  assert.equal(result.items.length, 2);
  assert.equal(snapshot(db), before, "Shopping cutover rehearsal changed data or privileges");
  return {
    tested: true,
    restrictedEntryPoints: shoppingFunctions.length,
    rollbackVerified: true,
    nativeReadVerified: true,
    completeCutover: false,
  };
}
function snapshot(db) {
  return db.sql(`select jsonb_build_object(
    'functions',(select jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl) order by oid)
      from pg_proc where pronamespace='public'::regnamespace),
    'items',(select jsonb_agg(to_jsonb(i) order by id) from public.grocery_items i),
    'sessions',(select jsonb_agg(to_jsonb(s) order by id) from public.shopping_sessions s))`);
}
