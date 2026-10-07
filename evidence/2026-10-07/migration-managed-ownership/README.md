# Managed Auth and Storage ownership

Two read-only catalog observations on nest-test identify distinct owners for
Auth/Storage schemas and tables. The runtime role has schema USAGE and seven
measured table privileges, but no schema CREATE, inherited owner capability or
ability to SET ROLE to those owners. No users, sessions, object metadata, bytes
or credentials are read; no hosted permission or data is changed.

The disposable rehearsal previously made its runtime role owner of these
simulated objects. It now transfers the two schemas and four tables to separate
fixture roles before lowering the runtime owner. Explicit data grants, RLS and
the measured ownership matrix match the catalog observations. Partial managed
interfaces refuse configuration rather than reporting a match.

Nine focused fixture/runtime/lifecycle tests pass without failures or skips.
They include scoped definer session reads, another subject returning zero,
anonymous refusal, denied direct session reads, RLS-restricted Storage reads,
runtime data access without ownership, and refused managed DDL/owner-role use
on standard PostgreSQL. These last refusals are local behavior, not a hosted DDL
probe or a claim about platform administrative hooks.

The complete disposable rehearsal applies 54 legacy and 257 native migrations.
All existing boundary and recovery groups finish, and both financial/receipt
reconciliations pass. The full run is repeated because ownership affects those
paths. The later import-order-only cleanup changes no behavior; the focused
tests pass again after it. [Summary](summary.json), [focused results](focused.tap)
and [catalog metadata](hosted-observation.json) retain the bounded evidence.

Compilation still uses an administrative fixture role. Auth/Storage shapes,
provider behavior, object bytes/HTTP, function ownership, remaining grants and
API-role memberships remain simulated or unverified. Local PostgreSQL 18.6
differs from hosted 17.6, and pg_net remains explicitly excluded. Full hosted
permission parity, private call-chain semantics, external writer drainage,
representative production rehearsal and cutover remain open. No shipping app,
build 23, production environment or worker configuration changes.
