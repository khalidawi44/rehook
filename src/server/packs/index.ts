// Packs de démarrage : comptes à suivre, hashtags, et quelques vidéos à importer
// pour que la veille ait de la matière dès le premier lancement.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, getSettings, saveSettings, upsertAccount } from "../db.js";
import { fetchTikTokProfile } from "../providers/tiktok-page.js";
import { importUrls } from "../collector.js";
import { removeDemo } from "../providers/demo.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export type Pack = { name: string; title: string; description: string; accounts: string[]; hashtags: string[]; keywords?: string[]; videos: string[] };

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];

export function listPacks(): Pack[] {
  return fs
    .readdirSync(here)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(here, f), "utf8")) as Pack);
}

export function getPack(name: string): Pack | null {
  return listPacks().find((p) => p.name === name) ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Charge un pack. `replace` : remplace hashtags et mots-clés au lieu de les ajouter aux existants. */
export async function loadPack(name: string, log: (l: string) => void, replace = false): Promise<{ accounts: number; videos: number; errors: string[] }> {
  const pack = getPack(name);
  if (!pack) throw new Error("Pack inconnu : " + name);
  removeDemo();
  const before = getSettings();
  let accounts = 0;
  for (const handle of pack.accounts) {
    let info: Parameters<typeof upsertAccount>[0] = { handle };
    try {
      info = await fetchTikTokProfile(handle);
    } catch (e) {
      log(`pack : profil @${handle} : ${(e as Error).message}`);
    }
    const acc = upsertAccount(info);
    db.prepare("UPDATE accounts SET followed = 1 WHERE id = ?").run(acc.id);
    accounts++;
    await sleep(700);
  }
  saveSettings({
    hashtags: replace ? uniq(pack.hashtags) : uniq([...before.hashtags, ...pack.hashtags]),
    keywords: replace ? uniq(pack.keywords ?? []) : uniq([...before.keywords, ...(pack.keywords ?? [])]),
    packLoaded: replace || !before.packLoaded ? name : uniq([...before.packLoaded.split(","), name]).join(","),
  });
  const r = await importUrls(pack.videos);
  log(`pack ${name} : ${accounts} compte(s) suivi(s), ${r.ok} vidéo(s) importée(s)`);
  return { accounts, videos: r.ok, errors: r.errors };
}
