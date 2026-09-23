// SQL for the rollback-only fixture. No production activation entry point.
export function shoppingTableFenceSql() {
  return `do $restrict$ declare v_table text; v_columns text; begin
    foreach v_table in array array['grocery_items','shopping_sessions','shopping_session_items'] loop
      execute format('revoke insert,update,delete,truncate on public.%I from public,anon,authenticated,service_role',v_table);
      select string_agg(quote_ident(attname),',') into v_columns from pg_attribute
        where attrelid=('public.'||v_table)::regclass and attnum>0 and not attisdropped;
      execute format('revoke insert(%s),update(%s) on public.%I from public,anon,authenticated,service_role',v_columns,v_columns,v_table);
    end loop;
  end $restrict$;`;
}
export function shoppingTableProbeSql() {
  return `do $probe$ declare v_table text; begin
    foreach v_table in array array['grocery_items','shopping_sessions','shopping_session_items'] loop
      if has_any_column_privilege('authenticated',('public.'||v_table)::regclass,'INSERT,UPDATE')
        or has_table_privilege('authenticated',('public.'||v_table)::regclass,'DELETE,TRUNCATE') then
        raise exception 'Legacy table mutation grant remains'; end if;
      begin execute format('delete from public.%I where false',v_table);
        raise exception 'Legacy direct delete remained callable';
      exception when insufficient_privilege then null; end;
    end loop;
  end $probe$;`;
}
