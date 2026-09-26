# Isolated hosted test backend

Created 26 September 2026 with owner authorization in `drrius's Org` on the Free plan; Supabase quoted USD 0/month. Project: `nest-test`, ref `tkjixmujjoustdiedfmw`, Zurich (`eu-central-2`). [Dashboard](https://supabase.com/dashboard/project/tkjixmujjoustdiedfmw).

Production `household-os` (`fdtqmcfwhbddswdpnmcq`) was not modified. This project contains fictional data only.

## Installed schema

The initial 55 legacy and 204 native source migrations were installed in batches. An additional native grocery conflict migration is now installed and its AI journal compatibility fix (261 source migrations total). [Source hashes and test-only adjustments](nest-test-migration-manifest.csv) record each input. Hosted migration batches cover these zero-based, end-exclusive slices:

| Hosted migration | Source slice                         |
| ---------------- | ------------------------------------ |
| `20260926090658` | legacy 0–4                           |
| `20260926090730` | legacy 4–7                           |
| `20260926090830` | legacy 7–8                           |
| `20260926090923` | legacy 8–18                          |
| `20260926091021` | legacy 18–36                         |
| `20260926091034` | legacy 36–55 (batch name ends in 54) |
| `20260926091055` | native 0–40                          |
| `20260926091126` | native 40–80                         |
| `20260926091141` | native 80–120                        |
| `20260926091214` | native 120–160                       |
| `20260926091244` | native 160–204                       |

Eight legacy cron-registration blocks were omitted. Search indexes use ordinary transactional creation instead of CONCURRENTLY on this initially empty database. The pg_net extension is included. Failed initial cron/index batches rolled back before corrected retries. No scheduled workers were enabled; the verified cron-job count was zero.

## Real Auth and access checks

Three fictional Auth users were created through the admin API, with random passwords and confirmed `example.invalid` addresses. No invitation or confirmation emails were sent. Password sign-in is a test harness only; the native app still uses Apple sign-in.

- Test Alex: `791f7261-6c9d-4061-9c8a-57aa6e0b0200`.
- Test Sam: `e5f80cfd-b69a-4aa0-a267-75784e943676`.
- Nonmember: `c9aef3f3-bfc1-4fd0-bf52-f8ab3f90d74e`.
- Fictional household: `be772ffd-3ab5-41d5-8438-647a79a553da`.

Both members received HTTP 200 from the local Nest API's `/v1/session` using real hosted Auth bearer tokens. The nonmember received 403; an anonymous request received 401. Hosted PostgREST household reads returned the one household for each member and zero rows for the nonmember. This is narrow real-service authorization evidence, not complete tenant-isolation or device acceptance.

Local `apps/api/.env` and `apps/mobile/.env` contain this project's URL and publishable key only and are ignored by Git. The mobile API origin is not configured yet. Temporary credentials/session state are mode 0600 files in `/tmp`; no server keys or passwords are committed.

## Outstanding checks

Every public ordinary table has RLS. Hosted security advisors reported 58 informational policy-absence notices and 80 callable SECURITY DEFINER warnings. A follow-up catalog check found no anonymous callable public SECURITY DEFINER functions, no unsafe search paths on public Nest SECURITY DEFINER functions, and no anonymous/authenticated write grants on policy-free RLS tables. These checks do not dismiss all warnings; the remaining callable functions still need review. [Supabase function security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).

Apple provider configuration, the partners' actual test identities, signed iPhone builds, hosted API access, live AI credentials, receipt Storage and push delivery remain unverified. No financial fixture or real household data has been imported. The schema installation and password-session checks do not satisfy M0–M9 acceptance.

## Hosted grocery conflict correction

The real hosted journey exposed repeated database `40001` errors for a stale grocery edit until the API timed out. SQL itself correctly rejected the stale version; hosted logs showed repeated attempts. Migration `20260926092224_native_grocery_nonretryable_conflicts.sql` changes explicit grocery edit business conflicts to `PT412`; genuine serialization failures retain their original code. The API maps HTTP 412/PT412 to its existing HTTP 409 conflict response. Existing private function identity and grants are preserved.

After applying only to nest-test, the complete real-user HTTP sequence passed: add and exact replay, partner read/check and exact replay, outsider denial, stale edit conflict, and unchanged final checked state. Retained fictional item: `644af67d-399c-4683-8e83-c434bba4e516`, version 2. A first diagnostic item also remains. Local PostgREST regression asserts the raw 412/PT412 response; the API mapping test and typecheck pass. This is not device/offline acceptance. Other explicit `40001` business-conflict sites still need a hosted retry audit.

The AI journal also catches PT412 in `20260926092453_native_ai_nonretryable_conflicts.sql`. Sixteen focused PostgreSQL cases pass, including a stale AI grocery edit returning a stored conflict, exact replay after another mutation, and one immutable journal entry. This fixes a review finding in the initial grocery correction; live model execution remains unverified. The follow-up migration is installed only on nest-test.
