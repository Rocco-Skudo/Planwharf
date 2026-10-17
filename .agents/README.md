# Portable project skills

The skill files are stored in this repository under `skills/`; no global
installation or symlink is required. Start with the root `AGENTS.md` for project
rules and `SKILLS.md` for the installed catalog. Read each relevant skill before
applying it. Source revisions and licenses remain in the installation manifests
and license files alongside this document.

At the start of a working session, after reading the project documentation, run:

```sh
python .agents/check-updates.py
```

The Python 3.10+ standard-library checker queries the public GitHub API, compares
the pinned and latest upstream trees for installed skill directories (including
supporting files), and reports local differences from the pinned originals.
It does not download replacements, install, commit, push, or write cache files.
Changes elsewhere in an upstream repository do not count as skill updates.
Network failures, rate limits, missing files and incomplete responses produce
UNKNOWN and a nonzero exit code, rather than a claim that everything is current.
`--offline` validates the manifests and installed skill entry points only; it
cannot establish whether updates exist. Updates require reviewing the upstream
diff, preserving local adaptations, updating provenance and hashes, and rerunning
checks before an authorized commit/push.

`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` and
`.cursor/rules/project-skills.mdc` direct supporting hosts to the same project
instructions. Other hosts must receive `AGENTS.md` in their initial context.
These entry points ask agents to perform the startup check; they are not an
application startup hook and cannot force an unsupported host to execute it.
