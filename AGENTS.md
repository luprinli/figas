---
permission:
  read:
    "*": ask
    ".env": deny
    ".env.*": deny
  edit:
    "*": ask
    "*.md": allow
    "app/**": allow
    "tests/**": allow
    "scripts/**": allow
    "prisma/**": allow
    "migrations/**": allow
    "docs/**": allow
  bash:
    "*": ask
    "git status *": allow
    "git diff *": allow
    "npm run *": ask
    "npm run lint": allow
    "npm run typecheck": allow
    "npm run test*": allow
---
# FIGAS Agent Rules — Code Stability & Regression Prevention

## Prime Directive
Solve tasks with minimal, surgical changes. Never introduce regressions.

## Scope Enforcement
- Only modify files explicitly required for the task.
- Before editing any file, state why it must change.
- Strictly forbidden: touching package.json, tsconfig.json, .eslintrc.cjs,
  vite.config.ts, CI/CD files, or any config unless the task explicitly requires it.
- If you identify unrelated improvements, list them as "Suggestions" — do not apply.

## Step-by-Step Protocol
1. Analyze — Summarize root cause and files involved.
2. Plan — Bullet list of exact edits (file, function, line range).
   Wait for confirmation unless task is marked [AUTO].
3. Execute — One file at a time. Show diff after each.
4. Quality Gate — Run `npm run lint` and `npm run typecheck`. Fix introduced errors.
5. Verify — Run `npm run test:related` to test only affected modules.
   Never disable a test to make it pass.

## Code Integrity Rules
- Do not remove error handling, fallback logic, or safety checks.
- Do not rename variables/functions outside task scope.
- When changing an API, search all usages and update them without altering internal logic.
- Preserve all comments and documentation.
- Maintain exact indentation and formatting of surrounding code.

## Emergency Stop
If a change affects more files than planned, stop immediately and inform the user.

## Project Commands
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Related tests: `npm run test:related`
- All tests: `npm run test:all`
- Build: `npm run build`
