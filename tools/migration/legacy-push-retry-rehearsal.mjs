import assert from "node:assert/strict";

export function verifyLegacyPushRetry(db, seed) {
  const result = JSON.parse(db.sql(retrySql(seed)));
  assert.deepEqual(result, {
    expiredClaimReleased: true,
    staleFinalizationRefused: true,
    retryRetainsAttemptCount: true,
    failedClaimCountedOnce: true,
    pausedRetryPreserved: true,
    disabledSubscriptionSkipped: true,
  });
  return { ...result, edgeDeliveryVerified: false, externalRequestsDrained: false };
}

function retrySql(seed) {
  return `begin; ${seed}
    insert into public.push_subscriptions(id,household_id,member_id,endpoint,p256dh,auth)
    values('00000000-0000-4000-8000-000000004106','00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000002','https://push.example/nest-retry-fixture','fixture-key','fixture-auth');
    update public.push_outbox set claimed_at=now()-interval '2 minutes',
      claim_expires_at=now()-interval '1 minute'
      where id='00000000-0000-4000-8000-000000004104';
    do $probe$ begin
      perform public.run_drain_push_outbox('drain_push_outbox:nest-expired-baseline',50);
      if not exists(select 1 from public.push_outbox where id='00000000-0000-4000-8000-000000004104'
        and status='pending' and attempt_count=2 and claim_token is null
        and claimed_at is null and claim_expires_at is null and processed_at is null) then
        raise exception 'Expired subscribed claim was lost or counted as delivered'; end if;
      if public.finalize_push_outbox_claim('00000000-0000-4000-8000-000000004104',
        '00000000-0000-4000-8000-000000004105','sent',null,'{}'::uuid[]) then
        raise exception 'Stale expired claim finalized'; end if;
      update public.push_outbox set claim_token='00000000-0000-4000-8000-000000004107',
        claimed_at=now(),claim_expires_at=now()+interval '1 hour'
        where id='00000000-0000-4000-8000-000000004104';
      if not public.finalize_push_outbox_claim('00000000-0000-4000-8000-000000004104',
        '00000000-0000-4000-8000-000000004107','failed','fixture failure','{}'::uuid[]) then
        raise exception 'Current failed claim was not resolved'; end if;
      if public.finalize_push_outbox_claim('00000000-0000-4000-8000-000000004104',
        '00000000-0000-4000-8000-000000004107','failed','fixture replay','{}'::uuid[]) then
        raise exception 'Failed claim replay counted twice'; end if;
      if not exists(select 1 from public.push_outbox where id='00000000-0000-4000-8000-000000004104'
        and status='pending' and attempt_count=3 and claim_token is null and processed_at is null) then
        raise exception 'Failed retry changed terminal state or attempts'; end if;
    end $probe$;
    create temporary table retry_before as select to_jsonb(p) body from public.push_outbox p
      where id='00000000-0000-4000-8000-000000004104';
    do $pause$ begin
      perform private.nest_set_legacy_job_paused('drain_push_outbox',true);
      begin perform public.run_drain_push_outbox('drain_push_outbox:nest-expired-paused',50);
        raise exception 'Paused retry executed'; exception when sqlstate '55000' then null; end;
      if (select body from retry_before) is distinct from (select to_jsonb(p) from public.push_outbox p
        where id='00000000-0000-4000-8000-000000004104') then
        raise exception 'Pause changed retained retry'; end if;
      perform private.nest_set_legacy_job_paused('drain_push_outbox',false);
      perform public.run_drain_push_outbox('drain_push_outbox:nest-expired-retry',50);
      if not exists(select 1 from public.push_outbox where id='00000000-0000-4000-8000-000000004104'
        and status='pending' and attempt_count=3 and claim_token is null and processed_at is null) then
        raise exception 'Retry lost attempts or implied delivery'; end if;
      update public.push_subscriptions set disabled_at=now() where id='00000000-0000-4000-8000-000000004106';
      perform public.run_drain_push_outbox('drain_push_outbox:nest-expired-disabled',50);
      if not exists(select 1 from public.push_outbox where id='00000000-0000-4000-8000-000000004104'
        and status='skipped_no_subscription' and attempt_count=3 and processed_at is not null) then
        raise exception 'Disabled recipient was not skipped'; end if;
    end $pause$;
    select jsonb_build_object('expiredClaimReleased',true,'staleFinalizationRefused',true,
      'retryRetainsAttemptCount',true,'failedClaimCountedOnce',true,'pausedRetryPreserved',true,
      'disabledSubscriptionSkipped',true);
    rollback;`;
}
