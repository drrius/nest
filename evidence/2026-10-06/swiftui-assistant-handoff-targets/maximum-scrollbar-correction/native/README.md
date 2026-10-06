# Maximum-text assistant handoff navigation

At source **fe90e184ae08eca44b43e890979c93d8e8534597**, one maximum/dark native journey passed: all six synthetic device handoff links opened their real destinations. Four dated-source699 GET observers also passed. No normal capture or navigation was repeated in this phase.

| Method                     | Result |                        Seconds |
| -------------------------- | ------ | -----------------------------: |
| Alex canonical baseline    | PASS   |                         14.622 |
| Sam canonical baseline     | PASS   |                         13.168 |
| Maximum handoff navigation | PASS   | 212.045 summary / 210.230 case |
| Alex final canonical read  | PASS   |                         11.987 |
| Sam final canonical read   | PASS   |                         11.967 |

The original `dff` normal PASS/maximum FAIL remains in [the original package](../../native/README.md). The subsequent `0f` normal capture PASS/maximum FAIL remains in [the reading correction package](../../maximum-reading-correction/native/README.md). Those failures and their source maps were preserved. This maximum-only correction changes the test's Conversation pan geometry; app shipping source is unchanged from `0f`.

## Actual targets and navigation

All targets were enabled, hittable and wholly inside the measured usable viewport `[0,74,375,510]` before their taps. The links and opened destinations were:

| Link                 | Target frame `[x,y,width,height]` | Destination                 |
| -------------------- | --------------------------------- | --------------------------- |
| Open Calendar        | `[36,444,303,119]`                | Calendar                    |
| Review busy sharing  | `[36,414,303,119]`                | Busy sharing, still off     |
| Review ingredients   | `[36,160.5,303,119]`              | October19 ingredient review |
| Review notifications | `[36,370.5,303,119]`              | Notifications               |
| Review your setup    | `[36,444.5,303,119]`              | Your setup                  |
| Open Profile         | `[36,362.5,303,67]`               | Original Test Alex profile  |

No branch was omitted. Busy-sharing opening required the root-verified existing disabled owner consent, both empty local privacy/consent journals, and the live unrequested Calendar permission screen. The Allow-calendar-access target was revealed and read; it was never tapped.

The earlier Conversation gesture was inside the right scrollbar. All **13** new transcript pan attachments record `x24`, start `[24,449]`, end `[24,199]`, the actual scroller `[0,0,375,667]`, and exclusion from scrollbar `[342,74,30,510]` and all button regions beginning at `x36`. Destination scrolling retained its existing gesture behavior. The 24-attempt bounds and full target guards remain.

The noninteractive ingredient explanation is 589.5pt high. Its beginning and end were read with respective viewport measurements, 508pt covered at each end and 426.5pt positive overlap. Continuous reading covers the paragraph; there is no oversized-button exemption.

## Sources, preservation and fixture lifecycle

Fresh unique UI products attest all **1126** native input hashes at `fe90`, actual owned test/helper and shipping-row compilation, selected product paths, signing/origins and three binary hashes. The reused signed SDK products remain explicitly **6997138485f3f8088fc03682432de74879e19659 / 1122 inputs**; they are not relabelled as new UI products.

The paired SDK reads compare the complete 62-event terminal history, balances Alex+1/Sam−1centime, all 8 exact recurring rules, original 7 inactive rules, roster, immutable owner rule/reminder receipts, partner receipt isolation, shared settings and removed-renewal/reminder history. Local ingredient review/choices and selected calendars remained semantically identical. Both original actor/household scopes, 64 empty journals, initial large/light settings and foreground Today/Me+shared were restored. Owned plans were removed and scoped caffeinate stopped.

Root inserted only the explicitly synthetic private conversation **10b77a97-1709-4799-9b17-8cb3a613d402**, with six honest handoffs and no model turn/save children, then removed it once after terminal completion. The separate root cleanup verifies its absence, all 15 original conversations unchanged, existing disabled consent version10/generation17 unchanged and zero busy snapshots unchanged. Privileged fixture setup/cleanup is separate from native authorization proof.

Native domain mutation invocations and model calls were zero. SDK authentication setup may POST login/refresh; no measured total-wire-POST claim is made. No Reply, Ask, permission, preference toggle, Save, publish, add or financial decision was invoked.

## Export and verification

All **19** PNGs were directly inspected by the worker. Root inspected 8 representative target/destination/coverage/terminal images and independently checked every target and all 13 pan records; supporting root review and cleanup hashes are pinned. This proves the scoped synthetic result-navigation path, not a live model response, whole accessibility audit or physical-device acceptance.

Raw xcresults, videos, binaries, credentials and selected private plans remain private. The export retains sanitized results, source/binary attestations, frame/reading/pan attachments, restoration and screenshot inventory.

Run the read-only immutable verifier:

```sh
python3 evidence/2026-10-06/swiftui-assistant-handoff-targets/maximum-scrollbar-correction/native/verify_inventory.py
```

Before the coordinated commit only, `--allow-untracked-precommit` skips the tracked-file gate; all hashes, immutable sources, semantic preservation and geometry checks still run. The default requires every artifact to be tracked.
