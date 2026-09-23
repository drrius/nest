-- GATED internal validator. No jobs, item mutations or hosted activation.
create function private.nest_dated_reminder_settings(p_settings jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_date date; v_delivery jsonb; v_text text;
begin
  if p_settings is null or jsonb_typeof(p_settings) is distinct from 'object'
    or octet_length(p_settings::text)>2048
    or not(p_settings ?& array['enabled','recipientIds','localTime','localDate'])
    or p_settings-array['enabled','recipientIds','localTime','localDate']<>'{}'::jsonb
    or jsonb_typeof(p_settings->'localDate') is distinct from 'string' then
    raise exception 'Invalid dated reminder settings' using errcode='22023'; end if;
  v_text:=p_settings->>'localDate';
  if length(v_text)<>10 or v_text!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid reminder date' using errcode='22023'; end if;
  begin
    v_date:=v_text::date;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception 'Invalid reminder date' using errcode='22023';
  end;
  if not isfinite(v_date) or v_date not between date '0001-01-01' and date '9999-12-31'
    or to_char(v_date,'YYYY-MM-DD')<>v_text then
    raise exception 'Invalid reminder date' using errcode='22023'; end if;
  v_delivery:=private.nest_reminder_settings((p_settings-'localDate')||jsonb_build_object('daysBefore',0));
  return (v_delivery-'daysBefore')||jsonb_build_object('localDate',v_text);
end;
$$;
revoke all on function private.nest_dated_reminder_settings(jsonb) from public,anon,authenticated,service_role;
