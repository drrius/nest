-- Gated private polling state. No HTTP request or hosted schedule is enabled.
create table private.nest_push_receipt_polls (
  attempt_id uuid primary key references private.nest_push_delivery_attempts(id),
  delivery_id uuid not null references private.nest_push_deliveries(id),
  ticket_id text not null unique,
  next_at timestamptz not null, deadline timestamptz not null,
  polls integer not null default 0 check(polls between 0 and 8),
  closed boolean not null default false,
  check(isfinite(next_at) and isfinite(deadline))
);
alter table private.nest_push_receipt_polls enable row level security;
revoke all on private.nest_push_receipt_polls from public,anon,authenticated,service_role;
create index nest_push_receipt_polls_due on private.nest_push_receipt_polls(next_at,attempt_id) where not closed;
create index nest_push_receipt_polls_delivery on private.nest_push_receipt_polls(delivery_id);
insert into private.nest_push_receipt_polls(attempt_id,delivery_id,ticket_id,next_at,deadline)
  select a.id,a.delivery_id,d.ticket_id,a.started_at+interval '15 minutes',a.started_at+interval '24 hours'
  from private.nest_push_delivery_attempts a join private.nest_push_deliveries d on d.attempt_id=a.id where d.state='ticket';

alter function private.nest_finish_push_send(uuid,uuid,jsonb) rename to nest_finish_push_send_record;
create function private.nest_finish_push_send(p_delivery uuid,p_attempt uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ack jsonb;
begin
  v_ack:=private.nest_finish_push_send_record(p_delivery,p_attempt,p_result);
  if v_ack->'result'->>'status'='ticket' then
    insert into private.nest_push_receipt_polls(attempt_id,delivery_id,ticket_id,next_at,deadline)
      select a.id,a.delivery_id,v_ack->'result'->>'ticketId',a.started_at+interval '15 minutes',a.started_at+interval '24 hours'
      from private.nest_push_delivery_attempts a where a.id=p_attempt
      on conflict(attempt_id) do nothing;
  end if;
  return v_ack;
end;
$$;
revoke all on function private.nest_finish_push_send(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

alter function private.nest_finish_push_receipt(uuid,uuid,text,jsonb) rename to nest_finish_push_receipt_record;
create function private.nest_finish_push_receipt(p_delivery uuid,p_attempt uuid,p_ticket text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_ack jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  -- An expired polling budget is uncertainty, not evidence contradicting a late
  -- actual provider receipt. The immutable receipt writer still binds all IDs.
  update private.nest_push_deliveries set state='ticket'
    where id=p_delivery and attempt_id=p_attempt and ticket_id=p_ticket and state='unknown';
  v_ack:=private.nest_finish_push_receipt_record(p_delivery,p_attempt,p_ticket,p_result);
  update private.nest_push_receipt_polls set closed=true where attempt_id=p_attempt;
  return v_ack;
end;
$$;
revoke all on function private.nest_finish_push_receipt(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

-- Each sweep inspects at most 100 indexed due rows. Moving next_at at claim time
-- bounds duplicate polling even when a worker crashes before the HTTP read.
create function private.nest_claim_push_receipt_polls()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_scanned integer:=0; v_poll private.nest_push_receipt_polls;
  v_delivery private.nest_push_deliveries; v_result jsonb:='[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  v_now:=clock_timestamp();
  for v_poll in select * from private.nest_push_receipt_polls where not closed and next_at<=v_now
    order by next_at,attempt_id limit 100 for update skip locked loop
    v_scanned:=v_scanned+1;
    select * into v_delivery from private.nest_push_deliveries where id=v_poll.delivery_id for update;
    if v_delivery.attempt_id is distinct from v_poll.attempt_id or v_delivery.state<>'ticket' then
      update private.nest_push_receipt_polls set closed=true where attempt_id=v_poll.attempt_id;
    elsif v_poll.deadline<=v_now or v_poll.polls>=8 then
      update private.nest_push_receipt_polls set closed=true where attempt_id=v_poll.attempt_id;
      update private.nest_push_deliveries set state='unknown' where id=v_delivery.id;
    else
      update private.nest_push_receipt_polls set polls=polls+1,
        next_at=least(deadline,v_now+make_interval(secs=>least(3600,900*power(2,v_poll.polls)::integer)))
        where attempt_id=v_poll.attempt_id;
      v_result:=v_result||jsonb_build_array(jsonb_build_object('version',1,'deliveryId',v_delivery.id,
        'attemptId',v_poll.attempt_id,'ticketId',v_poll.ticket_id));
    end if;
  end loop;
  return jsonb_build_object('scanned',v_scanned,'claims',v_result);
end;
$$;
revoke all on function private.nest_claim_push_receipt_polls() from public,anon,authenticated,service_role;
