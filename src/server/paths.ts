import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Racine du projet niche/ (deux niveaux au-dessus de src/server). */
export const ROOT = path.resolve(here, "..", "..");
export const DATA_DIR = path.join(ROOT, "data");
/** Dossier public de Remotion : polices, musique, et les fichiers par rendu. */
export const PUBLIC_DIR = path.join(DATA_DIR, "public");
export const COVERS_DIR = path.join(DATA_DIR, "covers");
export const RENDERS_DIR = path.join(DATA_DIR, "renders");
export const JOBS_PUBLIC_DIR = path.join(PUBLIC_DIR, "jobs");
export const VIDEO_ENTRY = path.join(ROOT, "src", "video", "index.ts");
