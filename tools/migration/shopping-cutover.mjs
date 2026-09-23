import { shoppingTableFenceSql, shoppingTableProbeSql } from "./shopping-table-fence.mjs";
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
    db.sql(`begin; ${revokes} ${shoppingTableFenceSql()}
    set local role authenticated;
    set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
    do $probe$ begin ${probes} end $probe$;
    ${shoppingTableProbeSql()}
    do $native$ declare v_version bigint; v_first jsonb; v_retry jsonb; begin
      select native_version into v_version from public.grocery_items
        where id='00000000-0000-4000-8000-000000000810';
      v_first:=public.nest_set_grocery_checked(
        '00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000001400',
        '00000000-0000-4000-8000-000000000810',v_version,true);
      v_retry:=public.nest_set_grocery_checked(
        '00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000001400',
        '00000000-0000-4000-8000-000000000810',v_version,true);
      if v_first is distinct from v_retry then raise exception 'Native retry changed result'; end if;
      if (select count(*) from public.nest_grocery_check_receipts
        where operation_id='00000000-0000-4000-8000-000000001400')<>1 then
        raise exception 'Native retry duplicated receipt'; end if;
    end $native$;
    select public.nest_grocery_snapshot('00000000-0000-4000-8000-000000000010');
    rollback;`),
  );
  assert.equal(result.items.length, 2);
  assert.equal(
    result.items.find((item) => item.itemId === "00000000-0000-4000-8000-000000000810")?.checked,
    true,
  );
  assert.equal(snapshot(db), before, "Shopping cutover rehearsal changed data or privileges");
  return {
    tested: true,
    restrictedEntryPoints: shoppingFunctions.length,
    rollbackVerified: true,
    nativeReadVerified: true,
    nativeCheckVerified: true,
    nativeRetryVerified: true,
    restrictedTables: 3,
    completeCutover: false,
  };
}
function snapshot(db) {
  return db.sql(`select jsonb_build_object(
    'functions',(select jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl) order by oid)
      from pg_proc where pronamespace='public'::regnamespace),
    'tableAcls',(select jsonb_agg(jsonb_build_object('oid',oid,'acl',relacl) order by oid) from pg_class where relnamespace='public'::regnamespace),
    'columnAcls',(select jsonb_agg(jsonb_build_object('table',attrelid,'number',attnum,'acl',attacl) order by attrelid,attnum) from pg_attribute where attrelid in (select oid from pg_class where relnamespace='public'::regnamespace)),
    'receipts',(select jsonb_agg(to_jsonb(r) order by actor_id,household_id,operation_id) from public.nest_grocery_check_receipts r),
    'items',(select jsonb_agg(to_jsonb(i) order by id) from public.grocery_items i),
    'sessions',(select jsonb_agg(to_jsonb(s) order by id) from public.shopping_sessions s))`);
}
