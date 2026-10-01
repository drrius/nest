# New preference intent preflight

Source `ce15b3e2d` (full current source available through the linked CI) requires fresh authorized exact food/cooking baselines before staging a new preference command. Failed preflight preserves the editor baseline and does not update the cache or create a journal. Existing lost-response commands replay unchanged. Reload asks explicitly before discarding unsaved edits.

[Nest36831957709](https://github.com/drrius/nest/actions/runs/36831957709) and [SwiftUI36831957708](https://github.com/drrius/nest/actions/runs/36831957708) pass:400 Foundation cases/41 explicit skips,243 signed native cases/six explicit skips, zero failures. Strict formatting, source limits and actual app signing pass.

Three new native cases exercise both preference kinds: offline refusal; changed baseline without silent rebasing; delayed preflight after sign-out and member switch. They assert no commands/journals and unchanged cache baselines. All pass with zero failures/skips. Five existing native cases still prove exact lost-response replay, explicit conflict discard and old-account/read fences, also zero failures/skips.

One actual isolated PostgreSQL conflict case passes for food/cooking/notification preferences with no writes. Initial sandbox execution could not run the child fixture; the authorized local run passes with zero skips. Log `/tmp/nest-preference-preflight-postgrest.log`. Initial source588457c0 CI stopped on three fixture formatting findings before compilation; corrected source passes.

The Mac remains unreachable. Actual rendered reload confirmation, unsaved draft behavior, accessibility and physical-phone acceptance are not claimed. Build13 does not contain this slice. No hosted mutation, provider call, beta, deployment, production action or merge.
