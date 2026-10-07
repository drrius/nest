# Audited writer owner-role attributes

The earlier eight-definition comparison retained different owner names but did
not measure role attributes. This checkpoint verifies nest-test identity and
queries only PostgreSQL catalog metadata. All eight audited entry points remain
postgres-owned security definers. [Observed catalog](hosted-observation.json),
[query](hosted-role-query.sql).

The hosted owner is not a superuser, has BYPASSRLS, inherits role permissions,
and can create roles/databases and replicate. It has USAGE on public/private/auth/
storage, CREATE on public/private, and no CREATE on auth/storage. No table content,
Auth record, stored file, function body or job command is exported.

A fresh disposable PostgreSQL 18.6 cluster using the repository's existing fixture
bootstrap has owner drrius with superuser and BYPASSRLS. Its other measured role
flags match the hosted role. [Local bootstrap](local-bootstrap.json),
[attribute comparison](comparison.json). The fixture is stopped. The 311 migrations
and completed native journeys are not rerun. This fresh bootstrap observation is
not a second full-schema/privilege rehearsal.

The superuser difference is real and prevents treating owner privileges as
identical merely because the eight function bodies match. BYPASSRLS matches, but
that does not establish all effective table/function grants, inherited permissions,
nested private-function behavior or production parity. Those gates remain open.
No role, grant, function, schedule, worker or deployment is changed.

Two identical pure catalog SELECTs were issued during result capture; the second
result is retained. The first was displayed before its data was saved. Further
unchanged reads stop. The management connection reports transactionReadOnly=false;
no fresh read-only transaction guarantee is claimed. Only the authorized test
project is queried. Production, credentials and application records are untouched.
