# Native authentication HTTP diagnostics

The pinned Supabase Swift2.55.2 default fetch is exactly URLSession.shared.data(for:).
The adapter uses that same expression and forwards the original request, data,
response and error without new headers, sessions, cookies or redirect policy.
The SDK still performs response validation/decoding after the adapter. Auth
storage, credential sequencing, scope, refresh and sign-out behavior are unchanged.

The existing bounded report/OSLog captures a fixed auth category, allowlisted method,
local diagnostic reference, duration, HTTP status and fixed failure category.
No URL, query, headers, body, credentials, actor or SDK error text is retained.
References are local only; no auth provider trace correlation is claimed.

Four focused adapter tests pass on the authorized Mac with in-process transport.
Two signed simulator LateAuthRefreshTests also pass, checking that delayed refresh
cannot restore signed-out credentials or replace a newly signed-in account. That
run compiles the shipping initializer against the pinned SDK. These do not establish
fresh Apple sign-in, live Supabase refresh or physical-phone behavior. SDK decoding
remains outside this HTTP coverage. Strict formatting, limits and whitespace pass.
This is a source patch for the next planned beta; build25 remains unchanged.
