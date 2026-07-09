/**
 * Generate a Kysely `Database` type from `prisma/schema.prisma`.
 *
 * Reads the Prisma schema, extracts every `model` block (respecting `@@map`
 * for table‑name overrides), and emits a TypeScript interface where each
 * table's columns are typed according to the Prisma → Kysely type mapping.
 *
 * Output: `generated/kysely/database.ts`
 *
 * Usage: `npx tsx scripts/generate-kysely-types.ts`
 *
 * The Prisma → Kysely type mapping follows the `pg` wire‑protocol reality:
 *   Int       → number   (PostgreSQL `integer`)
 *   String    → string   (PostgreSQL `text` / `varchar`)
 *   Boolean   → boolean  (PostgreSQL `boolean`)
 *   DateTime  → string   (ISO‑8601 string over the wire with Kysely/pg)
 *   Decimal   → string   (PostgreSQL `numeric` → wire protocol `string`)
 *   Float     → string   (same as Decimal, for safety)
 *   Json      → unknown  (PostgreSQL `json`/`jsonb`)
 *   Enum      → string   (Kysely receives the DB value as text)
 *   BigInt    → number   (PostgreSQL `bigint`, but we coerce to number)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, "..", "prisma", "schema.prisma");
const OUTPUT_DIR = path.resolve(__dirname, "..", "generated", "kysely");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "database.ts");

// ── Prisma → Kysely type mapping ──────────────────────────────────────────────
function prismaTypeToTS(type: string): string {
  switch (type) {
    case "Int":
    case "BigInt":
      return "number";
    case "String":
      return "string";
    case "Boolean":
      return "boolean";
    case "DateTime":
      return "string"; // ISO-8601 string over pg wire protocol (Kysely default)
    case "Decimal":
    case "Float":
      return "string"; // PostgreSQL wire protocol sends numeric as string
    case "Json":
      return "unknown";
    default:
      // Enum types use the enum name → treated as string at the DB level
      if (/^[A-Z][a-zA-Z]+$/.test(type)) return "string";
      return "unknown";
  }
}

// ── Model parser ──────────────────────────────────────────────────────────────
interface Column {
  name: string;
  type: string;
  optional: boolean;
  isId: boolean;
}

interface Model {
  prismaName: string;
  tableName: string;
  columns: Column[];
}

function parseSchema(content: string): Model[] {
  const models: Model[] = [];
  const lines = content.split("\n");

  let inModel = false;
  let currentPrismaName = "";
  let currentTableName = "";
  let currentColumns: Column[] = [];
  let currentEnum: string | null = null; // track enum block to skip

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Skip comments and empty lines
    if (!line || line.startsWith("//")) continue;

    // Track enum blocks (skip them — Kysely doesn't need enum types)
    if (line.startsWith("enum ")) {
      currentEnum = line.split(/\s+/)[1]?.replace("{", "");
      continue;
    }
    if (currentEnum && line === "}") {
      currentEnum = null;
      continue;
    }
    if (currentEnum) continue;

    // Track datasource / generator blocks (skip their content)
    if (/^(datasource|generator)\s/.test(line)) {
      // Skip until closing brace
      if (!line.includes("}")) {
        let depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        while (depth > 0 && i + 1 < lines.length) {
          i++;
          const skipLine = lines[i].trim();
          depth += (skipLine.match(/\{/g) || []).length;
          depth -= (skipLine.match(/\}/g) || []).length;
        }
      }
      continue;
    }

    // Start of a model
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      inModel = true;
      currentPrismaName = modelMatch[1];
      currentTableName = currentPrismaName; // default; overridden by @@map
      currentColumns = [];
      continue;
    }

    // End of a model
    if (inModel && line === "}") {
      inModel = false;
      models.push({
        prismaName: currentPrismaName,
        tableName: currentTableName,
        columns: currentColumns,
      });
      continue;
    }

    if (inModel) {
      // @@map("tablename") — override the table name for Kysely
      const mapMatch = line.match(/@@map\("([^"]+)"\)/);
      if (mapMatch) {
        currentTableName = mapMatch[1];
        continue;
      }
      // Skip @@id, @@unique, @@index, relation directives, comments
      if (/^(@@|relation\s)/.test(line) || line.startsWith("///")) continue;

      // Field definition:  name  Type  @attributes?
      const fieldMatch = line.match(/^(\w+)\s+(\w+)(\?)?\s*(@[\s\S]*)?$/);
      if (fieldMatch) {
        const name = fieldMatch[1];
        const type = fieldMatch[2];
        const optional = fieldMatch[3] === "?";
        const attributes = fieldMatch[4] ?? "";
        // Skip relation fields (they're not real DB columns)
        if (attributes && /@relation\b/.test(attributes)) {
          // Still include if it has a @map (it's a real FK column)
          const hasMap = /@map\("([^"]+)"\)/.test(attributes);
          if (!hasMap) continue;
        }
        currentColumns.push({
          name,
          type,
          optional,
          isId: name === "id" || /@id\b/.test(attributes),
        });
      }
    }
  }

  return models;
}

// ── Codegen ───────────────────────────────────────────────────────────────────
function generateDatabaseInterface(models: Model[]): string {
  const timestamp = new Date().toISOString().split("T")[0];

  let output = `/**
 * AUTO‑GENERATED by scripts/generate-kysely-types.ts — DO NOT EDIT.
 *
 * Generated on ${timestamp} from prisma/schema.prisma.
 * Tables and columns map directly to the Prisma schema; use this as
 * the type parameter for Kysely queries:
 *
 *   import type { DB } from "../generated/kysely/database";
 *   const db = new Kysely<DB>({ dialect: … });
 */

// ── Convenience: all table names as a union ─────────────────────────────────
export type TableName = ${models.map((m) => `"${m.tableName}"`).join(" | ")};

// ── Generated column types per table ─────────────────────────────────────────
export interface DB {
`;

  for (const model of models) {
    output += `  /** Maps to Prisma model \`${model.prismaName}\` */\n`;
    output += `  ${model.tableName}: {\n`;

    for (const col of model.columns) {
      const tsType = prismaTypeToTS(col.type);
      const optional = col.optional && !col.isId ? "?" : "";
      output += `    ${col.name}${optional}: ${tsType};\n`;
    }

    output += `  };\n\n`;
  }

  output += `}\n`;
  return output;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main(): void {
  console.log(`Reading schema from ${SCHEMA_PATH}`);
  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");

  const models = parseSchema(schema);
  console.log(`Parsed ${models.length} models from schema.prisma`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const ts = generateDatabaseInterface(models);

  // Only write if content changed (avoids unnecessary re‑compilation)
  const existing = fs.existsSync(OUTPUT_FILE)
    ? fs.readFileSync(OUTPUT_FILE, "utf-8")
    : "";
  if (existing === ts) {
    console.log("No changes — skipping write.");
  } else {
    fs.writeFileSync(OUTPUT_FILE, ts, "utf-8");
    console.log(`Wrote ${OUTPUT_FILE} (${models.length} tables)`);
  }
}

main();
