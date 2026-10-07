# Money history spacing

Money history used native Section inside the tab scroll stack. Section exposed
its rows to the outer stack's 24-point section spacing. The populated list
therefore added a section-sized gap after every financial entry. The full-history
screen used the same component with a 20-point outer gap.

The component now groups its heading, status and recovery controls explicitly,
with a lazy row stack and no additional gap between row boundaries. Rows retain
their existing internal padding, separators and minimum 52-point target. The
shared Quiet section heading replaces the separate headline/top-padding rule.
Financial reads, authorization, caches, pagination and posting logic are unchanged.

The signed baseline native check fails on the exact extra 24-point gap:
second row starts at y329.5, while the first ends at y305.5. Its assertions first
verify both complete targets are visible and enabled. [Baseline](baseline-summary.json).
The original installed binaries, two identities, 64 empty journals per member,
light/large settings and private/device choices restore. [Cleanup](baseline-cleanup.json).

Both corrected native journeys pass with zero failures or skips. They measure
contiguous complete row targets in the Money preview and full history, navigate
to full history and return to Today. The three screenshots are inspected directly.
[Corrected results](fixed-summary.json), [restoration](fixed-cleanup.json),
[before screenshot](AEC417F1-C047-40E5-A812-749791E80DFA.png),
[Money after](642E4D0D-6FA4-4068-8EC0-2EB43DDA7133.png) and
[full history after](892522C9-CFDB-488E-8707-F9F223D11358.png).

They use the existing fictional test household on the authorized SE3 simulator, with no positive financial action.
They are guarded in ordinary CI and forbidden on physical phones. Cached test
history may display while a read refreshes; this is rendered list-spacing proof,
not proof of a fresh hosted API/database read or financial posting.

TestFlight build 22 remains unchanged. No new beta, production mutation, provider
call, scheduler activation or push delivery is performed. Complete accessibility,
large text, phone use and owner acceptance remain open.
