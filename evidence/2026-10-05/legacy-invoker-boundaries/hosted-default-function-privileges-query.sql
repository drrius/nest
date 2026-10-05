select exists(
select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
join pg_roles r on r.oid=a.grantee
where d.defaclobjtype='f' and a.privilege_type='EXECUTE' and r.rolname='service_role'
and d.defaclrole=(select proowner from pg_proc where oid='public.archive_household_decision_option_versioned(uuid,boolean,timestamptz)'::regprocedure)
and d.defaclnamespace in (0,'public'::regnamespace)) as ownerDefaultServiceExecute;
