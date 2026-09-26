-- Paused/archived/missing routines are terminal conflicts; NOWAIT lock races are not.
do $patch$
declare v_definition text;
  v_clause text := 'if not found then raise exception ''occurrence_conflict'' using errcode=''40001''; end if;';
begin
  v_definition := pg_get_functiondef(
    'private.nest_complete_chore_before_epoch(uuid,uuid,date,date)'::regprocedure);
  if (length(v_definition)-length(replace(v_definition,v_clause,'')))/length(v_clause) <> 1 then
    raise exception 'Unexpected retained routine guard';
  end if;
  execute replace(v_definition,v_clause,replace(v_clause,'40001','PT412'));
end;
$patch$;
