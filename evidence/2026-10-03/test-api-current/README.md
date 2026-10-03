# Current isolated test API

On3 October2026, backend source `83a5a015c513f28181342cecf3430d214172d899` was deployed to the existing `nest-test-api` project as a preview. The source passes Nest37144546279. Native-only UI edits were excluded by the existing deployment ignore rules; backend/package sources were unchanged from that commit. This is a test deployment, not production migration or release.

The READY preview `nest-test-kjn4mw4di-drrius-projects.vercel.app` now serves `https://nest-test-api-drrius-projects.vercel.app`. Existing encrypted preview environment configuration was reused. No new server key or scheduler token was transferred; worker credential setup remains a separate approval blocker. Model execution and recurring scheduling stay disabled.

Seventeen actual bounded read-only checks pass on the [preview](preview-smoke.json) and again on the [stable alias](stable-smoke.json): five reads per existing member and outsider, plus anonymous money denial and disabled-worker response. Members receive200 and the expected nest-test household, outsider403, anonymous money401 and the inactive worker404. The requests contain no financial writes, AI generation or scheduler runs. These checks prove basic read compatibility/isolation, not populated legacy approval, live provider, full database/RLS or phone acceptance. No production database was touched.

[Selected deployment metadata](deployment.json). The previous stable target was `nest-test-85rurh9o7-drrius-projects.vercel.app`; its deployment was retained. Production Household OS remains separate.
