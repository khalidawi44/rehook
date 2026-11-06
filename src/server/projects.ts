// Projets de montage : sauvegarde automatique et reprise plus tard (data/projects/*.json).
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.js";

const DIR = path.join(DATA_DIR, "projects");
fs.mkdirSync(DIR, { recursive: true });

export type Project = { id: string; name: string; updatedAt: number; state: unknown };

const file = (id: string) => path.join(DIR, `${path.basename(id).replace(/[^\w-]/g, "")}.json`);

export function listProjects(): Omit<Project, "state">[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Project;
        return { id: p.id, name: p.name, updatedAt: p.updatedAt };
      } catch {
        return null;
      }
    })
    .filter((p): p is Omit<Project, "state"> => !!p)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): Project | null {
  try {
    return JSON.parse(fs.readFileSync(file(id), "utf8")) as Project;
  } catch {
    return null;
  }
}

export function saveProject(p: { id?: string; name: string; state: unknown }): Project {
  const id = p.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const proj: Project = { id, name: p.name.trim() || "Sans titre", updatedAt: Math.floor(Date.now() / 1000), state: p.state };
  fs.writeFileSync(file(id), JSON.stringify(proj));
  return proj;
}

export function deleteProject(id: string): boolean {
  const f = file(id);
  if (!fs.existsSync(f)) return false;
  fs.rmSync(f, { force: true });
  return true;
}
