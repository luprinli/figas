---
name: code-stability
description: >-
  Enforces surgical change discipline, regression prevention, and mandatory
  verification workflow for all AI agents.
always: true
---

# Code Stability Rules

## Surgical Principle
- Prefer minimally invasive changes. A single conditional guard is better than a function rewrite.
- When changing a function signature, check ALL call sites across the codebase.
- New features must be isolated behind feature flags or new components, leaving existing paths untouched.

## Forbidden Actions (Will Cause Task Failure)
- Do NOT touch package.json, build files, configs, or CI scripts unless task explicitly states it.
- Do NOT reorder imports, change formatting, or rename variables outside the targeted scope.
- Do NOT implement additional "nice-to-have" features beyond the stated requirement.
- Do NOT remove error handling, fallbacks, or edge-case code.
- If a change requires updating multiple dependent files, list them all in the Plan step and confirm.

## Quality Gates (Must Pass)
- After editing: `npm run lint` — fix any newly introduced errors.
- For TypeScript: `npm run typecheck` must succeed.
- Run `npm run test:related` for affected modules. Never disable a test to make it pass.

## Regression Prevention
- Use `git diff` to review every changed hunk before accepting.
- Run a smoke test of unrelated areas after every change.
- Check the Regression Trigger Map in `flight-schedule/SKILL.md` for the full file→test mapping.
