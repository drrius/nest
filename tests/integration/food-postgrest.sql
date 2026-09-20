-- JWT bridge for disposable fixtures only; no production Auth implementation.
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$
  select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
