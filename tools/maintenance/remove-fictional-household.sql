-- One-time owner-authorized removal of Nest's isolated synthetic fixture.
-- Never use this script for a real household or for Household OS.
begin;
set local lock_timeout = '5s';
create temporary table purge_rows(relation oid, location tid, primary key(relation,location)) on commit drop;
create temporary table restore_triggers(relation oid, name name, enabled "char") on commit drop;
create temporary table preserved_rows(relation text, signature text) on commit drop;

do $$
declare t record; fk record; changed integer; total integer; join_sql text;
begin
  if not exists(select 1 from public.households where id='be772ffd-3ab5-41d5-8438-647a79a553da'
      and name='Nest fictional test household') then raise exception 'Fixture identity mismatch'; end if;
  if (select count(*) from auth.users where
      (id='791f7261-6c9d-4061-9c8a-57aa6e0b0200' and email='nest-test-member-a@example.invalid') or
      (id='e5f80cfd-b69a-4aa0-a267-75784e943676' and email='nest-test-member-b@example.invalid') or
      (id='c9aef3f3-bfc1-4fd0-bf52-f8ab3f90d74e' and email='nest-test-outsider@example.invalid'))<>3
    then raise exception 'Synthetic account identities mismatch'; end if;
  insert into purge_rows select tableoid,ctid from public.households
    where id='be772ffd-3ab5-41d5-8438-647a79a553da';
  insert into purge_rows select tableoid,ctid from auth.users where id in
    ('791f7261-6c9d-4061-9c8a-57aa6e0b0200','e5f80cfd-b69a-4aa0-a267-75784e943676','c9aef3f3-bfc1-4fd0-bf52-f8ab3f90d74e');
  for t in select c.table_schema,c.table_name from information_schema.columns c
    join information_schema.tables b using(table_schema,table_name)
    where column_name='household_id' and c.table_schema in ('public','private') and b.table_type='BASE TABLE' loop
    execute format('insert into preserved_rows select %L,md5(coalesce(string_agg(to_jsonb(r)::text,'''' order by to_jsonb(r)::text),'''')) from %I.%I r where household_id=$1',
      format('%I.%I',t.table_schema,t.table_name),t.table_schema,t.table_name) using 'c24c01d9-cc89-42db-88aa-16f9ceebbb82'::uuid;
    execute format('insert into purge_rows select tableoid,ctid from %I.%I where household_id=$1 on conflict do nothing',
      t.table_schema,t.table_name) using 'be772ffd-3ab5-41d5-8438-647a79a553da'::uuid;
  end loop;
  loop
    total:=0;
    for fk in select c.oid,c.conrelid,c.confrelid,c.conkey,c.confkey from pg_constraint c
      join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
      where c.contype='f' and n.nspname in ('public','private','auth') loop
      select string_agg(format('child.%I=parent.%I',a.attname,b.attname),' and ' order by k.i)
        into join_sql from generate_subscripts(fk.conkey,1) k(i)
        join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=fk.conkey[k.i]
        join pg_attribute b on b.attrelid=fk.confrelid and b.attnum=fk.confkey[k.i];
      execute format('insert into purge_rows select child.tableoid,child.ctid from %s child join %s parent on %s join purge_rows p on p.relation=parent.tableoid and p.location=parent.ctid on conflict do nothing',
        fk.conrelid::regclass,fk.confrelid::regclass,join_sql);
      get diagnostics changed=row_count; total:=total+changed;
    end loop;
    exit when total=0;
  end loop;
  for t in select distinct relation from purge_rows loop
    if exists(select 1 from pg_attribute where attrelid=t.relation and attname='household_id' and not attisdropped) then
      execute format('select count(*) from %s r join purge_rows p on p.relation=r.tableoid and p.location=r.ctid where r.household_id<>$1',t.relation::regclass)
        into changed using 'be772ffd-3ab5-41d5-8438-647a79a553da'::uuid;
      if changed<>0 then raise exception 'Cross-household dependency; abort cleanup'; end if;
    end if;
    insert into restore_triggers select tgrelid,tgname,tgenabled from pg_trigger
      where tgrelid=t.relation and not tgisinternal and tgenabled<>'D'
      and (select n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=t.relation) in ('public','private');
  end loop;
  -- Fixture-only deletion needs to bypass append-only business triggers, never FK checks.
  for t in select * from restore_triggers loop
    execute format('alter table %s disable trigger %I',t.relation::regclass,t.name);
  end loop;
  while exists(select 1 from purge_rows) loop
    total:=0;
    for t in select distinct relation from purge_rows loop
      begin
        execute format('delete from %s r using purge_rows p where p.relation=r.tableoid and p.location=r.ctid',t.relation::regclass);
        get diagnostics changed=row_count; total:=total+changed;
        execute format('delete from purge_rows p where p.relation=$1 and not exists(select 1 from %s r where r.ctid=p.location)',t.relation::regclass) using t.relation;
      exception when foreign_key_violation then null;
      end;
    end loop;
    if total=0 and exists(select 1 from purge_rows) then raise exception 'Unresolved fixture dependencies; rollback'; end if;
  end loop;
  for t in select * from restore_triggers loop
    execute format('alter table %s enable %s trigger %I',t.relation::regclass,
      case t.enabled when 'A' then 'always' when 'R' then 'replica' else '' end,t.name);
  end loop;
  for t in select * from preserved_rows loop
    execute format('select count(*) from (select md5(coalesce(string_agg(to_jsonb(r)::text,'''' order by to_jsonb(r)::text),'''')) signature from %s r where household_id=$1) s where signature<>$2',t.relation)
      into changed using 'c24c01d9-cc89-42db-88aa-16f9ceebbb82'::uuid,t.signature;
    if changed<>0 then raise exception 'Real household data changed; rollback'; end if;
  end loop;
  if not exists(select 1 from public.household_members where user_id='15679bb6-8963-4fda-b5d2-e1e1bb7c58e9'
      and household_id='c24c01d9-cc89-42db-88aa-16f9ceebbb82') then raise exception 'Real membership changed'; end if;
end $$;
commit;
