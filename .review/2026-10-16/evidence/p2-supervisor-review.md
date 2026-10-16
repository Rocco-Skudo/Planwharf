# P2 backend independent review

Verdict: PASS after internal-budget correction, for fourth-role migration and advisory backend only. UI integration and live provider compatibility remain separate gates.

Root reviewed all implementation diffs, transport tests and permission/migration/budget fixtures. Frozen file hashes and exact P2-only patch identity are in `p2-supervisor/manifest.json`; patch SHA256 `f3be94641832e95f3f1cec6d4f81951cf29d8127b338158b980c60d46e69e587`. This patch is based on the exact reviewed P1 integration seed, not pristine upstream.

The initial review independently reproduced a missing internal-budget gate: a model with remaining=0,cost=1 still received one advisory call and completed. The worker added call-time checks and durable cost debit before dispatch, then refroze. Root's same independent reproduction now makes zero calls and records a failed turn. The meaningful HTTP regression also covers no invocation when exhausted, exact debit, blocking the next request and after restart, and the pre-existing provider-catalog budget exception.

Independent command, TEMP/TMP under `evidence/p2-review-scratch`, real localhost permitted, all providers injected:

`node --test planwharf-coordination/worktrees/p2-supervisor/engine/model-roles.test.cjs planwharf-coordination/worktrees/p2-supervisor/engine/supervisor.test.cjs planwharf-coordination/worktrees/p2-supervisor/engine/supervisor-role.test.cjs planwharf-coordination/worktrees/p2-supervisor/engine/supervisor-transport.test.cjs`

Result: **16/16 tests pass**, zero failures/skips. Source review confirms generic model/catalog enable does not grant Supervisor permission, legacy three-role flags remain unchanged, old advisory selection/auto are cleared without deleting names/history, Core remains model-free, and accounting/restart reconciliation uses Supervisor identity. Existing provider-account test changes only add the required false fourth flag to two expected role literals; the original line84 defect remains unchanged.

API advisory requests omit tools and reject attempted tool calls for both OpenAI-compatible and Anthropic-compatible protocols. Unverified CLI advisory transports fail closed because a filesystem read-only sandbox still permits shell commands. Codex/Grok/Antigravity advisory compatibility is unverified/unsupported; their other roles remain available. No silent substitution, guessed flags or added permissions.

No actionable defect remains in this bounded reviewed patch. No product code edited by reviewer, commits, live provider calls, publication or user-process changes occurred. This is not acceptance of complete P2 or P6.
