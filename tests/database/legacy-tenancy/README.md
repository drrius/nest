# Audited tenancy prerequisite

These three SQL files are byte-for-byte copies from Household OS commit `4a528c96caf41515a70291ccecbba9d7b35e3349`, deliberately audited for the native conversation store. They create households, membership (including real display-name/FK/unique constraints), the private schema, membership RLS/grants and the two-member cap.

The test bootstrap simulates only Supabase roles, `auth.users(id)` and `auth.uid()`. All inserted identities and households are synthetic. This is stronger than a handwritten membership-table approximation; it is not proof of a full Supabase installation or every legacy migration. Later profile-file triggers concern photo ownership and remain outside this focused prerequisite test. Full migration-history rehearsal remains mandatory before production application.

These are test inputs, not production migrations. Nest's candidate migrations are additive to the existing Household OS database. They must not be applied to an empty project or used to replace the existing history. No existing data, settings or schema was read from a running database for these tests.
