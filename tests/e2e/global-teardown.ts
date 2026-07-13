import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

async function globalTeardown() {
  console.log("\n🧹 E2E teardown — cleaning auth state...");

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const authStatePath = path.resolve(__dirname, "auth-state.json");
  if (fs.existsSync(authStatePath)) {
    fs.unlinkSync(authStatePath);
    console.log("  ✓ Removed auth-state.json");
  }

  console.log("  ✓ Teardown complete\n");
}

export default globalTeardown;
