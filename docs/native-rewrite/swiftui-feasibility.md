# SwiftUI client feasibility — 27 September 2026

Status: **design study, not a product build or an architecture decision**. The owner has rejected the current iPhone UI twice and asked whether a fully native client would make it feel better. The approved Quiet visual direction and Nest product scope remain the baseline.

## Evidence

- [Standalone SwiftUI Today study](evidence/2026-09-27/swiftui-today-study.png), compiled with Xcode 27 and launched on an iPhone 17 Pro/iOS 26.3 simulator. Source: `spikes/swiftui-quiet/`. It uses explicitly fictional data, a local-only chore toggle and scope control, native SwiftUI typography, segmented picker and tab bar. It has no login, API connection, persistence, financial action or TestFlight build.
- [Current Expo Today screenshot](evidence/2026-09-27/today.png) from the Mac simulator uses a real synthetic test session. It shows one chore and no planned meal. The screenshots are therefore **not a controlled framework comparison**: the SwiftUI study has more representative content and a tighter hierarchy, while the Expo app must display actual sparse data and failure states.
- The SwiftUI study renders the date before the title, places the scope control and first chore close to the header, and gives meal/grocery information an obvious but restrained hierarchy. Its most visible improvement is composition and content density. These choices are available in React Native too. SwiftUI itself provides useful system typography, controls, navigation, Dynamic Type and Apple-framework integration, but cannot make a weak layout good automatically.

## Cost of a full client pivot

The existing mobile source has 988 files and about 59,000 lines of TypeScript/TSX across 84 app-route files. A SwiftUI rewrite would replace the client UI, navigation, local storage/queue, authentication session handling, device calendar/push adapters and client-side tests. It could keep the Supabase schema/RLS, Nest API, Effect services, Vercel AI SDK server work, financial domain rules and hosted tests; those assets should not be rewritten merely to change the UI. The client would no longer run Effect v4 itself, so equivalent command contracts and offline invariants would need explicit Swift implementation and cross-language contract tests. A separate Xcode build and distribution pipeline would also replace EAS for that client. This is substantial new verification work, including phone access, accessibility, tenant isolation, approvals, offline retries and conflicts.

## Assessment

A SwiftUI client is a defensible direction for an iPhone-only app with Calendar, notifications, Keychain and native form behavior. The study was built locally without consuming Expo cloud-build quota; [Expo itself also supports local Xcode development builds](https://docs.expo.dev/develop/development-builds/introduction/), so avoiding that quota is **not** a reason to change frameworks. This study does **not** prove the finished app will meet Quiet, or justify discarding the tested backend and financial history. If the owner chooses a pivot, keep the API/data/authorization boundary and port one complete Today slice first, including real data, failures, offline chore replay and its AI-command parity. Review that slice on both phones before porting Meals, Calendar and Money. The existing Expo client stays available until a tested replacement exists; no production migration or release follows from this study.

Do not count this spike toward M1 or any other acceptance gate. In particular, the screenshot has fictional content and only local interaction; no device or owner approval of the visual result has been recorded.
