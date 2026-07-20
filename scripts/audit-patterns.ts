#!/usr/bin/env node
/* eslint-env node */
/**
 * audit-patterns.ts — FIGAS pattern-drift scanner
 * (docs/codebase-audit-strategy.md §1 Layer 3, §4.1)
 *
 * Detects the bug-pattern classes catalogued in scripts/ci/patterns.json:
 *
 *   1. transaction-isolation  — DB writes inside a transaction callback that
 *      do not receive the `tx` client (repository write methods, known write
 *      helpers, and sql`INSERT/UPDATE/DELETE`.execute() calls).
 *   2. date-string-coercion   — `String(<row>.<DATE column>)` without an
 *      `instanceof Date` guard, `.slice(0, 10)`, or `toDateString()`.
 *      DATE columns are derived from prisma/schema.prisma (`@db.Date`).
 *   3. csrf-token-basis       — `generateCsrfToken(session.id)` (the token
 *      basis must be the Cookie header, never session.id).
 *   4. duplicate-exported-functions — the same exported function name in
 *      multiple files (reported as warnings; Remix route conventions exempt).
 *
 * Usage:
 *   npx tsx scripts/audit-patterns.ts                 # full scan of app/
 *   npx tsx scripts/audit-patterns.ts --changed       # only files changed vs HEAD
 *   npx tsx scripts/audit-patterns.ts --report=json   # machine-readable output
 *
 * Exit codes: 0 — no errors (warnings allowed); 1 — one or more errors.
 */

import ts from "typescript";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export interface PatternViolation {
  rule: string;
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning";
}

/** Repository method-name prefixes that perform INSERT/UPDATE/DELETE. */
const WRITE_METHOD_PREFIX =
  /^(create|add|insert|update|delete|remove|assign|unassign|save|replace|set|mark|record|upsert)/i;

/** Read-only prefixes exempt from the transaction rule. */
const READ_METHOD_PREFIX = /^(find|get|list|count|search|has|query|resolve|load|is)/i;

/**
 * Standalone helper functions known to WRITE to the database. Calls to these
 * inside a transaction callback must pass the tx client (positionally or as
 * `{ client: tx }`). Extend this list when a new write helper is introduced
 * (see scripts/ci/patterns.json → transaction-isolation → writeHelpers).
 */
const WRITE_HELPERS = new Set([
  "computeBookingCost",
  "updateBookingTotals",
  "createAuditLogEntry",
  "addJunctionRecordsForPassenger",
  "removeJunctionRecordsForPassenger",
  "removeJunctionRecordsForLeg",
  "setRefundOnJunctionRecords",
  "assignToFlightLeg",
  "unassignFromFlightLeg",
  "createPaymentForCheckin",
]);

/** Remix route-module exports that legitimately repeat across files. */
const ROUTE_CONVENTION_EXPORTS = new Set([
  "loader",
  "action",
  "meta",
  "links",
  "headers",
  "shouldRevalidate",
  "ErrorBoundary",
  "HydrateFallback",
  "default",
]);

// ─────────────────────────────────────────────────────────────────────────────
// File collection
// ─────────────────────────────────────────────────────────────────────────────

function walkDir(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "build" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function getChangedFiles(): string[] | null {
  try {
    const staged = execSync("git diff --name-only --cached", { cwd: ROOT, encoding: "utf-8" });
    const unstaged = execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf-8" });
    const set = new Set(
      [...staged.split("\n"), ...unstaged.split("\n")]
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => resolve(ROOT, f)),
    );
    return [...set];
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE column derivation (prisma/schema.prisma → @db.Date fields)
// ─────────────────────────────────────────────────────────────────────────────

function loadDateColumns(): Set<string> {
  const cols = new Set<string>();
  const schemaPath = resolve(ROOT, "prisma", "schema.prisma");
  if (!existsSync(schemaPath)) return cols;
  const schema = readFileSync(schemaPath, "utf-8");
  for (const line of schema.split("\n")) {
    const m = line.match(/^\s*(\w+)\s+DateTime\??\s+.*@db\.Date\b/);
    if (m) cols.add(m[1]);
  }
  return cols;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule 2 & 3 — line-based scans
// ─────────────────────────────────────────────────────────────────────────────

function scanLines(file: string, source: string, dateColumns: Set<string>, out: PatternViolation[]): void {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // date-string-coercion: String(<recv>.<date column>)
    const re = /String\(\s*(?:r|row|result|rec)\.(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const field = m[1];
      if (!dateColumns.has(field)) continue;
      const rest = line.slice(m.index);
      const context = [lines[i - 2] ?? "", lines[i - 1] ?? "", line].join("\n");
      const guarded =
        rest.includes(".slice(0") ||
        context.includes("instanceof Date") ||
        context.includes("toDateString") ||
        // Re-parsed immediately (display-only) — not a string comparison hazard
        line.includes("new Date(String(");
      if (!guarded) {
        out.push({
          rule: "date-string-coercion",
          file: rel,
          line: i + 1,
          message: `String(...${field}) on a DATE column produces a non-ISO string — use toDateString() from app/types/shared.ts`,
          severity: "error",
        });
      }
    }

    // csrf-token-basis: generateCsrfToken(session.id)
    if (/generateCsrfToken\(\s*session\.id/.test(line)) {
      out.push({
        rule: "csrf-token-basis",
        file: rel,
        line: i + 1,
        message: "generateCsrfToken must use the Cookie header basis, not session.id",
        severity: "error",
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule 1 — transaction isolation (AST)
// ─────────────────────────────────────────────────────────────────────────────

function isTransactionCallbackCall(node: ts.Node): ts.ArrowFunction | ts.FunctionExpression | null {
  if (!ts.isCallExpression(node)) return null;

  // withTransaction(async (tx) => { ... })
  if (ts.isIdentifier(node.expression) && node.expression.text === "withTransaction") {
    const cb = node.arguments[0];
    if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) return cb;
    return null;
  }

  // X.transaction().execute(async (tx) => { ... })
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "execute" &&
    ts.isCallExpression(node.expression.expression) &&
    ts.isPropertyAccessExpression(node.expression.expression.expression) &&
    node.expression.expression.expression.name.text === "transaction"
  ) {
    const cb = node.arguments[0];
    if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) return cb;
  }
  return null;
}

function argsIncludeTx(args: readonly ts.Expression[], txName: string): boolean {
  for (const arg of args) {
    if (ts.isIdentifier(arg) && arg.text === txName) return true;
    if (ts.isObjectLiteralExpression(arg)) {
      for (const prop of arg.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === "client" &&
          ts.isIdentifier(prop.initializer) &&
          prop.initializer.text === txName
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function sqlStatementKind(tag: ts.TaggedTemplateExpression): string | null {
  let text = "";
  if (ts.isNoSubstitutionTemplateLiteral(tag.template)) {
    text = tag.template.text;
  } else if (ts.isTemplateExpression(tag.template)) {
    text = tag.template.head.text;
  }
  const firstWord = text.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  return ["INSERT", "UPDATE", "DELETE"].includes(firstWord) ? firstWord : null;
}

function scanTransactionBody(
  body: ts.Node,
  txName: string,
  sf: ts.SourceFile,
  rel: string,
  out: PatternViolation[],
): void {
  const visit = (node: ts.Node): void => {
    // Nested transaction callback → new tx scope
    const nestedCb = isTransactionCallbackCall(node);
    if (nestedCb) {
      const nestedTx = nestedCb.parameters[0]?.name;
      const nestedName = nestedTx && ts.isIdentifier(nestedTx) ? nestedTx.text : txName;
      scanTransactionBody(nestedCb.body, nestedName, sf, rel, out);
      return;
    }

    if (ts.isCallExpression(node)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

      // sql`INSERT/UPDATE/DELETE ...`.execute(X)
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "execute" &&
        ts.isTaggedTemplateExpression(node.expression.expression) &&
        ts.isIdentifier(node.expression.expression.tag) &&
        node.expression.expression.tag.text === "sql"
      ) {
        const kind = sqlStatementKind(node.expression.expression);
        if (kind) {
          const first = node.arguments[0];
          const usesTx = first !== undefined && ts.isIdentifier(first) && first.text === txName;
          if (!usesTx) {
            out.push({
              rule: "transaction-isolation",
              file: rel,
              line,
              message: `sql\`${kind} ...\`.execute() inside a transaction callback must be .execute(${txName})`,
              severity: "error",
            });
          }
        }
      }

      // <xxxRepository>.<writeMethod>(...) without tx
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        /Repository$/.test(node.expression.expression.text)
      ) {
        const method = node.expression.name.text;
        if (WRITE_METHOD_PREFIX.test(method) && !READ_METHOD_PREFIX.test(method)) {
          if (!argsIncludeTx(node.arguments, txName)) {
            out.push({
              rule: "transaction-isolation",
              file: rel,
              line,
              message: `${node.expression.expression.text}.${method}(...) inside a transaction callback must receive the ${txName} client`,
              severity: "error",
            });
          }
        }
      }

      // Known standalone write helpers without tx
      if (ts.isIdentifier(node.expression) && WRITE_HELPERS.has(node.expression.text)) {
        if (!argsIncludeTx(node.arguments, txName)) {
          out.push({
            rule: "transaction-isolation",
            file: rel,
            line,
            message: `${node.expression.text}(...) writes to the DB — pass the ${txName} client when called inside a transaction`,
            severity: "error",
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(body);
}

function scanAst(
  file: string,
  source: string,
  out: PatternViolation[],
  exportedFunctions: Map<string, string[]>,
): void {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    // Transaction callbacks
    const cb = isTransactionCallbackCall(node);
    if (cb) {
      const param = cb.parameters[0]?.name;
      if (param && ts.isIdentifier(param)) {
        scanTransactionBody(cb.body, param.text, sf, rel, out);
      }
      // Continue walking siblings/children outside the callback normally;
      // the callback body itself was handled by scanTransactionBody.
      return;
    }

    // Exported function declarations (duplicate detection)
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      const name = node.name.text;
      if (!ROUTE_CONVENTION_EXPORTS.has(name)) {
        const files = exportedFunctions.get(name) ?? [];
        if (!files.includes(rel)) files.push(rel);
        exportedFunctions.set(name, files);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export function runAudit(options: { files?: string[] } = {}): {
  errors: PatternViolation[];
  warnings: PatternViolation[];
} {
  const appDir = resolve(ROOT, "app");
  let files = options.files ?? walkDir(appDir);
  files = files.filter((f) => resolve(f).startsWith(appDir) && /\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f));

  const dateColumns = loadDateColumns();
  const violations: PatternViolation[] = [];
  const exportedFunctions = new Map<string, string[]>();

  for (const file of files) {
    if (!existsSync(file)) continue;
    const source = readFileSync(file, "utf-8");
    scanLines(file, source, dateColumns, violations);
    scanAst(file, source, violations, exportedFunctions);
  }

  // Duplicate exported function names (warning-level; only meaningful on full scans)
  if (!options.files) {
    for (const [name, filesWith] of exportedFunctions) {
      if (filesWith.length > 1) {
        violations.push({
          rule: "duplicate-exported-functions",
          file: filesWith.join(", "),
          line: 0,
          message: `export function ${name} is defined in ${filesWith.length} files — consolidate into a single source to prevent divergent logic`,
          severity: "warning",
        });
      }
    }
  }

  return {
    errors: violations.filter((v) => v.severity === "error"),
    warnings: violations.filter((v) => v.severity === "warning"),
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const changedOnly = argv.includes("--changed");
  const jsonReport = argv.some((a) => a === "--report=json");

  let files: string[] | undefined;
  if (changedOnly) {
    const changed = getChangedFiles();
    if (changed === null) {
      console.error("audit-patterns: git unavailable, falling back to full scan");
    } else {
      files = changed;
    }
  }

  const started = Date.now();
  const { errors, warnings } = runAudit({ files });

  if (jsonReport) {
    console.log(JSON.stringify({ errors, warnings }, null, 2));
  } else {
    console.log("═══════════════════════════════════════════════════");
    console.log("  FIGAS Pattern Audit (scripts/audit-patterns.ts)");
    console.log("═══════════════════════════════════════════════════\n");
    for (const v of errors) {
      console.error(`  ❌ [${v.rule}] ${v.file}:${v.line}\n     ${v.message}`);
    }
    for (const v of warnings) {
      console.warn(`  ⚠️  [${v.rule}] ${v.file}${v.line ? `:${v.line}` : ""}\n     ${v.message}`);
    }
    console.log(
      `\n  ${errors.length} error(s), ${warnings.length} warning(s) — ${Date.now() - started}ms\n`,
    );
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

const isMain = (() => {
  try {
    return resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  main();
}
