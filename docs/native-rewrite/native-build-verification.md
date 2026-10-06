# Native build identity

Native source hashes alone do not prove which compiled app or test ran. On 6 October, a source transfer at `87adfc60` retained zero archive timestamps. An incremental build succeeded, but the removal test reported old line114 instead of current119 and omitted the new action measurements. The run remains failed; it does not verify the corrected shipping controls. No removal occurred.

For each new source snapshot used in native QA:

1. Freeze the complete native input map and exact commit. Keep a record of any deliberately reused SDK build and prove every linked input is unchanged.
2. Build changed inputs in fresh, uniquely named, owned DerivedData directories. Assert those directories are absent before starting. Reuse only the pinned package-download cache. Preserve older builds and results.
3. Retain the build log and verify compilation of the changed Swift files. A successful incremental build or source archive hash is insufficient.
4. Resolve the selected xctestrun paths and require the app, runner and test bundle to belong to those fresh product directories. Record hashes of the app executable, debug library when present, test executable and build log before testing.
5. Execute only the frozen plan. Compare observable test behavior and diagnostic line numbers with the frozen source. A mismatch is a build-identity failure, not evidence that the source fix failed.
6. Preserve exact test outcomes and perform final canonical reads and ordinary account restoration. Never repeat a financial or other mutation because its UI observation failed; recover the original operation instead.

Fresh CI checkouts and signed release archives have separate source/build evidence. Simulator passes do not establish physical-phone, permission, push or live-model acceptance. These checks must remain separately recorded in progress.
