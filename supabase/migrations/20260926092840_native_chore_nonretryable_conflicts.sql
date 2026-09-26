-- Preserve the retained implementation, its OID, ACL, and epoch receipt adapters.
-- Only its three explicit business-conflict raises become non-retryable.
do $patch$
declare v_definition text; v_updated text;
begin
  v_definition := pg_get_functiondef(
    'private.nest_complete_chore_before_epoch(uuid,uuid,date,date)'::regprocedure);
  if (length(v_definition)-length(replace(v_definition,
    'errcode = ''40001''','')))/length('errcode = ''40001''') <> 3 then
    raise exception 'Unexpected chore conflict definition';
  end if;
  v_updated := replace(v_definition,'errcode = ''40001''','errcode = ''PT412''');
  execute v_updated;
end;
$patch$;
