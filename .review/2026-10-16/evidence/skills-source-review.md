# P4 source review preparation

Read-only public source inspection on 2026-10-16. No skills installed, enabled or run; no scripts downloaded or executed.

| Source | Exact inspected HEAD | License |
| --- | --- | --- |
| [Matt Pocock skills](https://github.com/mattpocock/skills) | 49dd158d1076134a641b33efb035946536778336 | MIT, copyright 2026 Matt Pocock; full LICENSE retrieved |
| [ECC](https://github.com/affaan-m/ECC) | 76aaa77df6adc5b889e689007bf99b9a4f74af34 | MIT, copyright 2026 Affaan Mustafa; full LICENSE retrieved |

Git trees were read through the repository connector and were not truncated (287 entries Matt; 6,355 ECC). Tree presence is discovery only, not runtime compatibility or safety approval.

Initial candidates read in full:

- Matt skills/engineering/tdd/SKILL.md, Git blob 01eadaa34e7c9a63a67d6dc3cce1cc81b0e49985. Requires supporting tests.md and mocking.md; conditional codebase-design Skill tool dependency; asks for approved testing seams. Do not claim portable native support or silently override Planwharf approval policy. Supporting files and dependency review remain pending.
- ECC skills/verification-loop/SKILL.md, Git blob 35cb4b7737ed2389a808b968aa360b00807eaffe. Markdown procedure with shell examples and Claude-specific language, build/lint/type/test/security/diff phases; no external script needed to read it. Examples assume npm/Python tooling and include a coverage target. It must adapt to actual project/harness eligibility and no-commit/no-publish policy, and never execute automatically merely because catalog content was imported. No hooks or continuous mode enabled.

Both licenses permit reuse with required notices preserved. This does not establish compatibility of optional dependencies. Only reviewed selected text and required supporting text may be imported into project-scoped cache. Full repository runtime, hooks, MCP servers, installers and daemons are excluded. A later task must inspect exact content and licenses again if revisions change. Distinguish discovered/enabled/selected/attached/loaded/followed/verified and keep provider fixture evidence separate from authorized live execution.

