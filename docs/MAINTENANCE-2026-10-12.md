# Task state and workspace maintenance

Completed implementation jobs previously retained active assignment claims and running notebook tasks. The orchestrator now settles verified completions, saves terminal task status through the notebook write queue, and preserves completion across polls and restarts. Every dispatched slice must report completion. Historical process IDs remain available with inactive flags; older checkpoints cannot resume completed jobs.

`validation/reconcile-attempts.cjs` provides an explicit dry run and an offline `--apply` repair. Applying creates backups before changing notebook, registry, or orchestrator state. It requires matching job fingerprints and successful exit evidence for every recorded slice. Removed project state is archived without deleting conversations, research, logs, results, or checkpoint files.

The default personal `plan.json` is excluded from publication. `fixtures/starter-notebook.json` supplies new installations; exclusive copying never replaces an existing notebook. Browser profiles, generated validation output, historical execution folders, and one-time migration scripts remain local. The round-trip validation harness now removes its entire isolated test workspace.

Validation performed on 2026-10-12:

- The full suite ran 38 checks: 37 passed and the worker-board browser fixture failed because it expected historical workers to appear under the new default session filters.
- The corrected browser fixture passed separately. It verifies an initially empty worker view and all three fixture workers after selecting all projects and sessions.
- The completion regression passed: incomplete slices, assignment closure, notebook persistence, repeated polls, restart, queued task creation, preserved result evidence, and exclusive default notebook creation.
- The reconciliation regression passed: successful exit evidence, job identity, preserved conversations and research, archived project state, and immutable dry runs.
- The full suite reported the personal notebook unchanged. The earlier offline repair preserved personal revisions and notes, closed two completed claims, and archived four removed-project entries.

No real provider workers or personal-project jobs were launched for this validation. The initial failed test output was preserved unchanged alongside the successful rerun evidence.
