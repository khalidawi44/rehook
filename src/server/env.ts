// Charge .env avant tout le reste (importé en premier dans index.ts).
import path from "node:path";
import { ROOT } from "./paths.js";

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // pas de .env : on lit l'environnement tel quel
}
