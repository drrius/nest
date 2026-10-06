# Deep integration after internal-table RLS

[Run37499602861](https://github.com/drrius/nest/actions/runs/37499602861) passes at exact source `5b784a107a51925eea87fd0f089d0783461aa0f4`.

| Suite                                    | Tests | Failures | Skips |
| ---------------------------------------- | ----: | -------: | ----: |
| Native HTTP/PostgREST core journeys      |    23 |        0 |     0 |
| Terminal conflicts and approval recovery |    50 |        0 |     0 |
| Isolated PostgreSQL transactions and RLS | 1,269 |        0 |     0 |

The two new internal-table RLS tests explicitly pass: accidental client row-access grants still reveal no internal rows, and enabling RLS preserves existing grants, rows and trusted owner access. These use representative populated tables; the separate [migration rehearsal and hosted catalog evidence](../internal-table-rls/README.md) covers the actual ten-table schema and its application only to nest-test.

The configured workflow downloads checksum-pinned PostgREST16.3 and runs disposable database fixtures. It contains no hosted credentials, deployment, production migration or model request. Synthetic Auth/model responses in relevant fixtures test authorization and recovery; they do not establish live provider or phone behavior.

[Result metadata](result.json) preserves the exact run, suite totals, durations and affected-source hashes. [Public CI excerpts](test-excerpt.txt) preserve the terminal summaries and the two new RLS cases. Root checks the complete public log and the successful job/step metadata. The comparison of runtime/security/fixture paths is empty between the run source and `8150e095`; subsequent native identifier/test changes are outside those paths. This is backend source parity, not a claim that this run executes a later native test or a future release commit.

The broader private-function, hosted Auth/Storage, external-writer, migration/cutover, live-AI and physical-device acceptance gates remain open. No source merge, release, purchase, hosted write or scheduler activation occurs.
