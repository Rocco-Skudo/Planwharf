# Account metadata and attribution verification

The published v0.1.0 checkpoint is unchanged. These changes are on `main` in this source commit. They do not replace the v0.1.0 release tag or ZIP.

## Behavior

- Business labels apply to provider and model display names only. Provider/model IDs remain explicit and unchanged.
- Personal subscriptions retain existing names. An unknown account type retains the normal display name without a status label; Business is never inferred from quota, email domain or model quality.
- Codex reads selected-workspace plan claims from its CLI login metadata. Grok uses the CLI's team principal and team ID. Antigravity has no verified account metadata interface in this integration and retains its normal display names.
- Recognized accounts have separate persisted role permissions. The first recognized account adopts existing settings; subsequent new accounts require explicit role selection. Returning to an account restores its flags.
- Account changes invalidate quota and model availability. A failed new-account catalog check cannot inherit another account's access. Normal unchanged-login polling reads local metadata without spawning provider CLIs.
- Native execution checks the assigned account identity again before launch. Users should stop work before changing CLI accounts because an already running CLI can reload its own credentials.
- Metadata contains opaque identifiers and classification only, without tokens, emails or copied authentication profiles.

## Checks

The complete regression passed **49/49 files** with unchanged personal notebook bytes: `validation/phase1-suite-1791932897967/results.json`. Browser checks retained single-window switching, role filtering and cross-project isolation. The isolated browser/backend process was verified terminated. A browser readiness failure from an intermediate run is preserved at `validation/phase1-suite-1791932656544/`; its fixture now attaches to the application URL and waits for DOM readiness.

Focused checks and the final complete regression passed after the account-scope and fixture-isolation refinements. They cover Business versus paid personal labels, token rotation, returning-account role restoration, bulk role configuration, invalidated quota, failed catalog checks, restart persistence, no AI calls, and rejection of changed identity before native launch.

A read-only metadata probe classified the current Codex login as normal without printing its account identifier. Grok metadata was unread in the restricted tool environment; no real Business login/logout was performed. Business transitions were verified using isolated fixtures. Antigravity's unsupported recognition is documented rather than fabricated.

## Attribution audit

README and `THIRD-PARTY-NOTICES.md` credit Matt Pocock and contributors. The exact upstream MIT notice is stored at `docs/licenses/mattpocock-skills-MIT.txt`. Skills downloads now include the root LICENSE in each revision cache, and a focused cache test verifies preservation.

Repository inspection found no bundled npm dependencies, external fonts, provider CLI binaries or additional third-party code/assets needing separate embedded-license notices. Separately installed providers and runtimes are acknowledged. No license for Planwharf's own code was chosen or changed by this task.

Source references: [Codex token metadata](https://github.com/openai/codex/blob/main/codex-rs/login/src/token_data.rs), [Grok principal metadata](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-login/src/model.rs), [Matt Pocock skills license](https://github.com/mattpocock/skills/blob/main/LICENSE).
