This is a classic challenge when working with AI coding agents: they often lack the human instinct for “surgical” changes and can introduce regressions by over-modifying stable code. Fortunately, a combination of carefully crafted instructions, a disciplined workflow, and leveraging your editor’s capabilities can dramatically reduce this risk. Below is a systematic set of best practices tailored for Kilo Code inside Devin Desktop, organized from prompt engineering down to day-to-day habits.

---

## 1. Architecture of Your `.md` Instructions
Your custom instruction file is the control panel for the agent’s behaviour. Treat it as a formal specification that constrains **scope**, **process**, and **safety checks**.

### 1.1 – Define Strict Scope Boundaries
The root cause of regressions is the agent touching files or logic it shouldn’t. Embed a “surgical principle” at the top of your `.md`:

```markdown
## Scope & Modification Rules (Read-Only Enforcement)
- You are ONLY allowed to modify files directly related to the current task. 
- Before changing any file, state which files you intend to edit and why.
- **Do not refactor, clean, or optimise code that is not directly required for the task.** 
- If you see unrelated code that could be improved, note it in a comment at the end of your response but do NOT alter it.
- Respect the existing code style, naming conventions, and architecture. Do not introduce new patterns unless explicitly asked.
- Never delete comments, debugging logs, or existing functionality unless instructed.
```

### 1.2 – Mandatory “Explain → Diff → Verify” Workflow
Make the agent generate a plan and a diff preview before any real change. This allows you to catch dangerous edits before they happen.

```markdown
## Workflow for Every Code Change
1. **Understand**: Read and summarise the relevant files, state exactly what you believe needs to change.
2. **Plan**: Output a numbered list of precise modifications (file, function/line, what changes).
3. **Request Approval**: Wait for user confirmation before editing. (If fully automated is needed, adapt: “Proceed only if task is clearly defined with no ambiguity.”)
4. **Edit**: Make changes one file at a time. After each file, output a unified diff (or use the editor’s diff view) and explain what was changed and why.
5. **Verify**: After all changes, run the project’s build/lint command if available. Report the result. If tests exist, run the most relevant subset.
```

### 1.3 – Regression Prevention Checklist
Explicitly forbid common disruptive behaviours:

```markdown
## Forbidden Actions (Will Cause Task Failure)
- Do NOT touch package.json, build files, configs, or CI scripts unless the task explicitly states it.
- Do NOT reorder imports, change formatting, or rename variables outside the targeted scope.
- Do NOT implement additional “nice-to-have” features beyond the stated requirement.
- Do NOT remove error handling, fallbacks, or edge-case code that appears unused but might be safety-critical.
- If a change requires updating multiple dependent files, list them all in the Plan step and ask for confirmation.
```

### 1.4 – Encourage Defensive Coding
While you don’t want over-engineering, you do want the agent to preserve stability:

```markdown
## Stability Rules
- Prefer minimally invasive changes. If a bug fix can be done with a single conditional guard, prefer that over rewriting the entire function.
- When changing a function signature or API, check all call sites across the codebase (using grep/IDE search) and adjust them without altering unrelated logic.
- If the task involves a new feature, isolate it behind a feature flag or a new component, leaving the existing path untouched.
```

### 1.5 – Reference Your Project’s Guardrails
If your project has linting, tests, or type-checking, make the agent aware and require it to use them:

```markdown
## Quality Gates (Must Pass)
- After editing, run `npm run lint` (or equivalent). If errors are introduced, fix them and retry.
- For TypeScript projects, ensure `tsc --noEmit` succeeds.
- If unit tests exist for the modified module, run them and report any failures. Never disable a test to make it pass unless explicitly told.
```

---

## 2. Workflow Optimisations (Your Daily Routine)
Instructions alone are not enough; how you interact with the agent is equally crucial.

### 2.1 – Atomic Commits & Feature Branches
- **Work in a dedicated branch** for every task, no matter how small. This makes it trivial to see exactly what changed using `git diff main...`.
- Commit after each successful, stable micro-step (e.g., “Added function signature”, “Passing test for edge case”). If the next step breaks something, you can revert only the last commit instead of untangling a large diff.
- **Before accepting any AI changes, stage your own uncommitted work** or use `git stash`. This lets you discard the agent’s modifications instantly if they’re unsatisfactory.

### 2.2 – Task Decomposition & Explicit File Lists
Vague prompts lead to unpredictable changes. Instead of “fix the login bug”, write:

```
Task: Resolve infinite loop when password field is empty.
Target files: src/components/LoginForm.tsx, src/utils/validation.ts
Do NOT modify: src/services/auth.ts, package.json, or any CSS files.
```

Always end your prompt with a hard boundary:

```
Only change the files listed. Do not refactor or touch anything else.
```

### 2.3 – Use Git Diff as Your Approval Gateway
Kilo Code likely shows a diff view inside the editor. Train yourself to review every changed hunk before accepting. Look for:
- Changes in files you didn’t expect to be touched.
- Removal of error handling or existing comments.
- Accidental whitespace/formatting modifications (can often be set to ignore in diff view).

If your setup allows, enable **“Require manual accept for each file”** or use a UI that lets you accept/reject hunks individually (like VS Code’s inline diff picker). Some AI editors integrate this directly.

### 2.4 – The “Guardian Test” Strategy
Whenever the agent claims a task is done, immediately run a smoke test of the area that should **not** have changed. For example, if you fixed the login page, quickly click through the dashboard and a couple of unrelated forms. If you can, maintain a small suite of “regression smoke tests” that cover critical paths, and run them after every AI session.

---

## 3. Editor-Specific Tactics for Kilo Code / Devin Desktop
Since you prefer a VS Code–like editor workflow, leverage built‑in features that Kilo Code or Devin Desktop may offer.

- **Context Isolation**  
  If Kilo Code supports “project context” or file scoping, manually select only the files the task needs in the sidebar/context panel. Remove from context any files that are unrelated, even if they are logically nearby. This physically prevents the model from reading and being tempted to edit them.

- **Inline Diff Preview & Accept/Reject**  
  Use the diff editor not just to view, but to partially apply changes. Many AI tools let you accept only specific lines. Make it a habit to reject any extra “cleanup” the AI slipped in.

- **Workspace Settings**  
  In Devin Desktop, check if there’s a “Safe Mode” or “Ask before edit” toggle. Enable it. If there’s a way to set a per-project system prompt (beyond the `.md` file), duplicate your core rules there as well.

- **Use Keyboard Shortcuts for Manual Interruption**  
  When you see the agent starting to edit a file you didn’t expect, hit **Stop** immediately. It’s easier to re-ask with a tighter constraint than to untangle a large incorrect edit.

---

## 4. Verification & Automated Guardrails
The most robust defence is a fast feedback loop that catches regressions automatically.

### 4.1 – Pre-commit Hooks
Set up a pre-commit hook (using Husky or similar) that runs linters and tests **only on the staged files**. This stops accidental changes from being committed, and the agent’s work stays in the working directory for your review.

### 4.2 – Targeted Test Execution
If you have a test suite, create a script that detects which modules were touched and runs only those tests. Share this script with the agent in your instructions, e.g.:

```markdown
After editing, run `npm run test:related` which executes tests only for changed files.
```

### 4.3 – Mutation Testing (Optional)
For highly sensitive core logic, consider a lightweight mutation testing tool. It can verify that the existing tests actually catch small, artificial changes—giving you confidence that the real changes haven’t broken anything.

---

## 5. Complete `.md` Instruction Template
Below is a battle‑tested template you can paste into your custom instructions. Adjust paths and commands to match your project.

```markdown
# Kilo Code Agent Rules – Project Stability & Regression Prevention

## 1. Prime Directive
Your primary goal is to solve the given task with **minimal, surgical changes**. You must never introduce regressions in stable code or alter unrelated functionality.

## 2. Scope Enforcement
- Only modify files explicitly mentioned in the task or those you have proven are directly dependent.
- Before editing any file, state the file name and the reason it must change.
- **Strictly forbidden**: Touching config files (package.json, tsconfig, .eslintrc), build scripts, CI definitions, or any file not directly required.
- If you identify unrelated improvements, list them in a “Suggestions” section after the main response, but do not apply them.

## 3. Step‑by‑Step Protocol
1. **Analysis**: Summarise the root cause and the files involved.
2. **Plan**: Provide a bullet list of exact edits (file, function, line range). Wait for user confirmation unless the task is marked [AUTO].
3. **Execution**: Edit one file at a time. After each file, show a unified diff and explain why each change was made.
4. **Quality Gate**: After all changes, run `npm run lint` (and `npm run typecheck` if applicable). Fix any newly introduced errors.
5. **Verification**: If unit tests exist for the touched modules, run them and report the results. Never disable a test to make it pass.

## 4. Code Integrity Rules
- Do not remove existing error handling, fallback logic, or safety checks unless instructed.
- Do not change variable/function names or restructure code outside the task scope.
- When changing an API (function signature, exported type), search for all usages and update them **without altering their internal logic**.
- Preserve all comments and documentation unless they directly contradict your changes.
- Maintain exact indentation and formatting style of the surrounding code.

## 5. Emergency Stop
If you realise a change will affect more files than initially planned, **stop immediately** and inform the user, presenting the full list of impacted files before continuing.

## 6. Project‑Specific Commands
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Run related tests: `npm run test:related` (script defined in project)
- Build: `npm run build`
```

---

## 6. Cultural Habit: Treat AI as a Junior Developer
Ultimately, the most effective strategy is to never trust the agent blindly. Review every diff as if a new intern wrote it—with the same level of scrutiny. Over time, the combination of tightly scoped prompts, that review habit, and the automated guardrails above will break the “fix one thing, break another” cycle and give you a stable, productive AI-assisted workflow.