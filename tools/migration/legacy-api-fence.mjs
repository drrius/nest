// Catalog-wide experiment inside the disposable rehearsal transaction only.
// Owner jobs, in-flight work, views and non-public schemas need separate auditing.
export function legacyApiFenceSql() {
  return `do $fence$ declare v_object record; v_columns text; v_role text; begin
    for v_object in select p.oid, p.oid::regprocedure::text as signature
      from pg_proc p where p.pronamespace='public'::regnamespace
        and p.prokind='f' and left(p.proname,5)<>'nest_' loop
      execute format('revoke all on function %s from public,anon,authenticated,service_role',v_object.signature);
      foreach v_role in array array['anon','authenticated','service_role'] loop
        if has_function_privilege(v_role,v_object.oid,'EXECUTE') then
          raise exception 'Legacy function still executable: % by %',v_object.signature,v_role;
        end if;
      end loop;
    end loop;
    for v_object in select oid,relname from pg_class where relnamespace='public'::regnamespace
      and relkind in ('r','p') and left(relname,5)<>'nest_' loop
      execute format('revoke insert,update,delete,truncate on public.%I from public,anon,authenticated,service_role',v_object.relname);
      select string_agg(quote_ident(attname),',') into v_columns from pg_attribute
        where attrelid=v_object.oid and attnum>0 and not attisdropped;
      if v_columns is not null then
        execute format('revoke insert(%s),update(%s) on public.%I from public,anon,authenticated,service_role',v_columns,v_columns,v_object.relname);
      end if;
      foreach v_role in array array['anon','authenticated','service_role'] loop
        if has_any_column_privilege(v_role,v_object.oid,'INSERT,UPDATE')
          or has_table_privilege(v_role,v_object.oid,'DELETE,TRUNCATE') then
          raise exception 'Legacy table still writable: % by %',v_object.relname,v_role;
        end if;
      end loop;
    end loop;
  end $fence$;`;
}
