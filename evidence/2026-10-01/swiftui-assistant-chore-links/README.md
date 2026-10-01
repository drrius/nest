# Chore assistant result links

Source: `d3d6918a3f7ee01967a77ffdd28fb4477d5e86d1`.

Successful canonical completion, skip, reschedule and handover receipts link to existing screens that read current authorized state. Historical requests never imply acceptance. Already-completed receipts preserve the recorded completer/date, including partner completions. No command runs merely by opening a result.

Verification:

- Nest36830276806 and SwiftUI36830276771 pass:400 Foundation cases/41 explicit skips and240 signed native cases/six explicit skips, zero failures. Strict formatting, source limits and actual app signing pass.
- Three new Foundation and two signed native account/read cases pass with zero failures/skips. The latter prove fresh reads without commands and reject delayed replies after sign-out or member switch.
- One strict fixture case uses actual Effect input/receipt schemas. Five affected isolated HTTP/SDK/PostgreSQL cases pass with zero failures/skips; the two handover cases pass again after adding an exact epoch assertion.
- The initial integration run failed two handover reads because the disposable database fixture lacked existing epoch migrations. The fixture now includes them; no application, RLS or production migration changed.
- Initial source88a96a09 native CI stopped on three formatting findings before compilation; corrected source passes.

Mac connection timed out. Owned rendered taps and child navigation, full accessibility, phone acceptance, hosted transcripts and live-provider results remain unverified. Available TestFlight build13 does not contain this slice. No hosted mutation, deployment, beta, purchase, production action, automation, PR or merge.
