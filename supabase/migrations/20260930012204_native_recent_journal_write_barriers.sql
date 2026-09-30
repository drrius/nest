-- Additive repair: journals created after the original barrier installation
-- must participate in owner-controlled freeze/drain. This does not activate it.
alter table private.nest_routine_creation_cancellations enable row level security;
alter table private.nest_ai_cancelled_turns enable row level security;
revoke all on private.nest_routine_creation_cancellations,
  private.nest_ai_cancelled_turns, private.nest_apns_delivery_attempts
  from public,anon,authenticated,service_role;

create trigger nest_household_write_barrier
  before insert or update or delete or truncate
  on private.nest_routine_creation_cancellations for each statement
  execute function private.nest_household_write_barrier();
alter table private.nest_routine_creation_cancellations
  enable always trigger nest_household_write_barrier;

create trigger nest_household_write_barrier
  before insert or update or delete or truncate
  on private.nest_ai_cancelled_turns for each statement
  execute function private.nest_household_write_barrier();
alter table private.nest_ai_cancelled_turns
  enable always trigger nest_household_write_barrier;

create trigger nest_household_write_barrier
  before insert or update or delete or truncate
  on private.nest_apns_delivery_attempts for each statement
  execute function private.nest_household_write_barrier();
alter table private.nest_apns_delivery_attempts
  enable always trigger nest_household_write_barrier;
