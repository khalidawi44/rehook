// Mise à jour depuis l'outil : vérification de GitHub, application (git, npm, build)
// et redémarrage du serveur (code de sortie 75 : le lanceur relance aussitôt).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { ROOT } from "./paths.js";

const execP = promisify(exec);
const REPO = path.resolve(ROOT, "..");

export type UpdateState = { phase: "idle" | "checking" | "updating" | "restarting" | "error"; log: string[]; available: boolean; current: string; remote: string; branch: string; changes: string[]; checkedAt: number | null; error: string | null };

export const updateState: UpdateState = { phase: "idle", log: [], available: false, current: "", remote: "", branch: "", changes: [], checkedAt: null, error: null };

const log = (l: string) => {
  updateState.log.push(`${new Date().toISOString().slice(11, 19)} ${l}`);
  if (updateState.log.length > 100) updateState.log.shift();
  console.log("[niche] mise à jour :", l);
};

async function run(cmd: string, cwd = REPO): Promise<string> {
  const { stdout, stderr } = await execP(cmd, { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  return (stdout + (stderr ? "\n" + stderr : "")).trim();
}

export function updatable(): boolean {
  return fs.existsSync(path.join(REPO, ".git")) && process.env.NICHE_BEHIND_PROXY !== "1";
}

export async function checkUpdate(): Promise<UpdateState> {
  if (!updatable()) return updateState;
  if (updateState.phase === "updating" || updateState.phase === "restarting") return updateState;
  updateState.phase = "checking";
  try {
    const branch = (await run("git rev-parse --abbrev-ref HEAD")).split("\n").pop()!.trim();
    await run(`git fetch origin ${branch}`);
    const current = (await run("git rev-parse HEAD")).trim();
    const remote = (await run(`git rev-parse origin/${branch}`)).trim();
    const changes = current !== remote ? (await run(`git log --pretty=format:%s ${current}..origin/${branch}`)).split("\n").filter(Boolean).slice(0, 20) : [];
    Object.assign(updateState, { branch, current, remote, changes, available: current !== remote, checkedAt: Math.floor(Date.now() / 1000), error: null, phase: "idle" });
  } catch (e) {
    updateState.phase = "idle";
    updateState.error = (e as Error).message.slice(0, 300);
  }
  return updateState;
}

export async function applyUpdate(): Promise<void> {
  if (!updatable()) throw new Error("Mise à jour depuis l'outil impossible ici (serveur en conteneur : la mise à jour est automatique chaque heure)");
  if (updateState.phase === "updating" || updateState.phase === "restarting") return;
  updateState.phase = "updating";
  updateState.log = [];
  try {
    const branch = updateState.branch || (await run("git rev-parse --abbrev-ref HEAD")).split("\n").pop()!.trim();
    log(`téléchargement (${branch})`);
    await run(`git fetch origin ${branch}`);
    const lockBefore = fs.readFileSync(path.join(ROOT, "package-lock.json"));
    await run(`git reset --hard origin/${branch}`);
    const head = (await run("git rev-parse HEAD")).trim();
    log(`code à jour : ${head.slice(0, 7)}`);
    const lockAfter = fs.readFileSync(path.join(ROOT, "package-lock.json"));
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    if (!lockBefore.equals(lockAfter) || !fs.existsSync(path.join(ROOT, "node_modules"))) {
      log("installation des modules (une minute)");
      await run(`${npmCmd} install --no-audit --no-fund`, ROOT);
    }
    const lockHash = crypto.createHash("sha256").update(lockAfter).digest("hex").toUpperCase();
    fs.writeFileSync(path.join(ROOT, "node_modules", ".niche-lock"), lockHash);
    log("construction de l'interface");
    await run(`${npmCmd} run build`, ROOT);
    fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "dist", ".niche-build"), head);
    log("redémarrage");
    updateState.phase = "restarting";
    updateState.available = false;
    if (process.platform === "win32" && fs.existsSync(path.join(ROOT, "launch.ps1"))) {
      // Windows : le serveur relance lui-même le lanceur (fichier à jour sur le disque), détaché,
      // puis s'arrête. Ne dépend pas du code de sortie, que PowerShell ne récupère pas toujours.
      const child = spawn(
        "cmd.exe",
        ["/c", "start", "", "/min", "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", path.join(ROOT, "launch.ps1")],
        { cwd: ROOT, detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, NICHE_RESTART: "1" } },
      );
      child.unref();
      setTimeout(() => process.exit(0), 800);
    } else {
      // Docker (restart: unless-stopped) ou lancement manuel : code 75 = à relancer.
      setTimeout(() => process.exit(75), 800);
    }
  } catch (e) {
    updateState.phase = "error";
    updateState.error = (e as Error).message.slice(0, 500);
    log("erreur : " + updateState.error);
    throw e;
  }
}

/** Vérification périodique (toutes les 30 min) quand le lanceur est utilisé. */
export function scheduleUpdateChecks() {
  if (!updatable()) return;
  setTimeout(() => checkUpdate().catch(() => {}), 20_000).unref();
  setInterval(() => checkUpdate().catch(() => {}), 30 * 60_000).unref();
}
