# Maximum-text reminder alert readability

The native reminder alert's long title pushed **Keep editing** below the opening viewport at maximum Dynamic Type. Existing interaction proof remained valid, but it did not establish full label readability. The five reminder editors now use the shorter **Discard changes?** title. Buttons, actions, model behavior and Dynamic Type are preserved. The existing grocery navigation test's expected title was updated; its earlier source and execution remain preserved at commit `1c0cb054`.

The retained baseline required no new native execution. Its opening and later-opening screenshots both show the clipped label. Their accessibility trees place Keep editing at `[34,555,307,187.5]`: bottom **742.5**, beyond the alert bottom **653** and app bottom **667**. These original captures and the measured finding are retained in `before/`.

One new dated, opt-in method ran on Alex's owned SE3/iOS 26.3.1 simulator with accessibility-extra-extra-extra-large text and dark appearance. It navigated through the ordinary app to the existing unchecked **QA rice**, 100g, grocery `d24cc35d-a6ae-44c6-9780-e28f8723d44d`, changed only unsent local enabled/Me choices, and opened Back's native alert. Both complete button frames had to fit the intersection of app and alert bounds, with minimum 44pt dimensions, enabled state, hittability and exact semantic labels before any action tap.

The actual opening and reopened screenshots show both complete rendered labels. Keep editing measured `[34,449.5,307,187.5]`, bottom **637**, within the alert bottom **653**. Discard choices measured `[34,254,307,187.5]`. Both opening checks passed. Native Keep editing retained enabled/Me values 1; Discard choices exited the editor and left the grocery unchecked.

| Actual verification                                                       | Result                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------ |
| One maximum/dark UI method                                                | PASS, 115.761s                                   |
| Alex exact authenticated reminder-context GET                             | PASS, 3.848s                                     |
| Sam exact authenticated reminder-context GET                              | PASS, 3.622s                                     |
| Both canonical records compared with the reused final `1c0cb054` baseline | Exactly equal: version 1, unchecked, no reminder |
| Hosted commands                                                           | 0                                                |

No Save, Retry, Remove, grocery completion, reminder worker, permission change, SQL, production action or normal-profile journey was performed. The other four reminder editors received the same title-only change and compiled; their opening alerts were not exercised here.

The affected SDK/app and UI targets were rebuilt once with the current title source. `after/source-input-hashes.json` records the actual inputs; `after/sdk-source-input-hashes.json` matches that build. The reused before contexts came from the prior real native SDK reads, with their prior SDK hash inventory kept separately. No fixture or API response was seeded or synthesized. Native logs, screenshots, accessibility trees, frame JSON, summaries and ordinary canonical reads are exported separately.

All eight exported PNGs were visually inspected for fictional scope and the actual rendered labels. MP4 recordings, opaque UI snapshots, synthesized-event binaries and full native result bundles remain private; each omitted attachment is listed explicitly in `private-attachments.json`. Selected xctestrun files were removed through the controller's normal cleanup. Original Keychains, app stores, signing/auth configuration and Mac trust/network settings were preserved.

Both simulators returned to Today top with Me + shared selected, large text, light appearance, original member/household scopes, stable test origins and 64 empty intent journals each. The renewal snapshot table is excluded from intent counts. Scoped caffeinate ended and the exclusive native lock was released. No unrelated server data hashes were read.

`verify_inventory.py` checks exported hashes, tracked files, manifest references, screenshot review hashes and matching recorded SDK/UI inputs. Its optional `--working-tree` mode also checks current native source against the executed inputs. Complete JSON/Markdown formatting precedes artifact checksums. Swift strict formatting and global/source-specific size and complexity limits passed. This simulator slice does not establish physical-device behavior, push delivery, worker execution or full acceptance of every reminder editor.

The default inventory comparison uses immutable native sourcedb6023fe, preserving the actual readability binary inputs as later reminder-save tests are added. `--working-tree` remains an optional current-source comparison; historical proof is not a claim that later source has executed.

Checkpointf1e60870 passes [Nest37422663603](https://github.com/drrius/nest/actions/runs/37422663603) and [SwiftUI37422663602](https://github.com/drrius/nest/actions/runs/37422663602):502 Foundation cases/41 skips,455 signed-app cases/23 skips, zero failures, four Swift Testing cases and strict formatting/limits/signing/UI compilation. Shipping and guarded readability source matchdb6023fe; the descendants change documentation only. CI compiles this optional manual UI method; the three actual hosted/native executions above remain separate. [Metadata](ci.json), [totals](ci-totals.txt).
