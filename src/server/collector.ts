// Orchestration des relevés.
// - Découverte (toutes les N minutes) : comptes suivis, hashtags, mots-clés.
// - Veille (toutes les 2 minutes par défaut) : relecture des compteurs des
//   vidéos récentes, détection « ça explose », alertes.
import { db, getSettings, now, upsertVideo, type AccountRow, type CollectedVideo, type VideoRow } from "./db.js";
import { cacheCover } from "./covers.js";
import { detectAlert } from "./alerts.js";
import { fetchTikTokVideo } from "./providers/tiktok-page.js";
import { apifyCollect } from "./providers/apify.js";
import {
  browserCollectAccount,
  browserCollectExplore,
  browserCollectExploreCategories,
  browserCollectHashtag,
  browserCollectKeyword,
} from "./providers/tiktok-browser.js";

export type RunState = {
  running: boolean;
  startedAt: number | null;
  step: string;
  log: string[];
  watch: { running: boolean; lastAt: number | null; nextAt: number | null; lastCount: number; lastAlerts: number };
};

export const runState: RunState = {
  running: false,
  startedAt: null,
  step: "",
  log: [],
  watch: { running: false, lastAt: null, nextAt: null, lastCount: 0, lastAlerts: 0 },
};

export const log = (line: string) => {
  const stamp = new Date().toISOString().slice(11, 19);
  runState.log.push(`${stamp} ${line}`);
  if (runState.log.length > 300) runState.log.shift();
  console.log("[niche]", line);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function discoveryMode(): "browser" | "apify" | "none" {
  const m = (process.env.NICHE_DISCOVERY ?? "browser").toLowerCase();
  return m === "apify" || m === "none" ? m : "browser";
}

async function discover(): Promise<CollectedVideo[]> {
  const settings = getSettings();
  const followed = (db.prepare("SELECT * FROM accounts WHERE followed = 1").all() as AccountRow[]).map((a) => a.handle);
  const mode = discoveryMode();
  const per = settings.videosPerSource;
  const out: CollectedVideo[] = [];
  if (mode === "none") {
    log("découverte désactivée (NICHE_DISCOVERY=none)");
    return out;
  }
  if (mode === "apify") {
    if (settings.hashtags.length) out.push(...(await apifyCollect({ hashtags: settings.hashtags }, per, log)));
    if (settings.keywords.length) out.push(...(await apifyCollect({ searchQueries: settings.keywords }, per, log)));
    if (followed.length) out.push(...(await apifyCollect({ profiles: followed }, per, log)));
    return out;
  }
  for (const h of followed) {
    runState.step = `compte @${h}`;
    try {
      // Comptes suivis : on lit toutes leurs vidéos récentes (réglage « Vidéos par compte suivi »), sans tri de viralité.
      out.push(...(await browserCollectAccount(h, Math.max(per, settings.videosPerAccount), log)));
    } catch (e) {
      log(`compte @${h} : ${(e as Error).message}`);
      if (/Playwright n'est pas installé|Executable doesn't exist/.test((e as Error).message)) break;
    }
  }
  for (const tag of settings.hashtags) {
    runState.step = `hashtag #${tag}`;
    try {
      out.push(...(await browserCollectHashtag(tag, per, log)));
    } catch (e) {
      log(`hashtag #${tag} : ${(e as Error).message}`);
      break;
    }
  }
  for (const kw of settings.keywords) {
    runState.step = `recherche « ${kw} »`;
    try {
      out.push(...(await browserCollectKeyword(kw, per, log)));
    } catch (e) {
      log(`recherche « ${kw} » : ${(e as Error).message}`);
      break;
    }
  }
  if (settings.feedEnabled) {
    // Fil varié : toutes les catégories de la page Explorer, pour avoir de tout comme sur TikTok.
    runState.step = "fil varié (Explorer)";
    try {
      out.push(...(await browserCollectExploreCategories(Math.min(per, 24), log)));
    } catch (e) {
      log(`explorer : ${(e as Error).message}`);
    }
  } else if (!followed.length && !settings.hashtags.length && !settings.keywords.length) {
    runState.step = "page Explorer";
    try {
      out.push(...(await browserCollectExplore(per, log)));
    } catch (e) {
      log(`explorer : ${(e as Error).message}`);
    }
  }
  return out;
}

/** Relit les pages des vidéos récentes : un relevé de plus, et détection d'alerte. */
async function refreshStats(maxVideos: number, delayMs: number): Promise<{ ok: number; total: number; alerts: number }> {
  const s = getSettings();
  const since = now() - s.watchHours * 3600;
  const rows = db
    .prepare(
      `SELECT v.* FROM videos v
       WHERE v.source <> 'demo' AND (v.posted_at IS NULL OR v.posted_at >= ?)
       ORDER BY v.last_seen_at ASC LIMIT ?`,
    )
    .all(since, maxVideos) as VideoRow[];
  let ok = 0;
  let alerts = 0;
  for (const v of rows) {
    try {
      const fresh = await fetchTikTokVideo(v.url, v.source);
      const { video } = upsertVideo(fresh);
      if (detectAlert(video, false)) alerts++;
      ok++;
    } catch (e) {
      log(`stats ${v.url} : ${(e as Error).message}`);
      db.prepare("UPDATE videos SET last_seen_at = ? WHERE id = ?").run(now(), v.id);
    }
    await sleep(delayMs + Math.random() * 300);
  }
  return { ok, total: rows.length, alerts };
}

export async function runCollection(opts: { discover?: boolean; refresh?: boolean } = {}): Promise<string> {
  if (runState.running) return "Un relevé est déjà en cours";
  runState.running = true;
  runState.startedAt = now();
  runState.step = "démarrage";
  runState.log = [];
  const runId = Number(db.prepare("INSERT INTO runs(started_at) VALUES(?)").run(runState.startedAt).lastInsertRowid);
  let summary = "";
  try {
    let added = 0;
    let seen = 0;
    let alerts = 0;
    if (opts.discover ?? true) {
      runState.step = "découverte";
      const found = await discover();
      for (const cv of found) {
        const { video, isNew } = upsertVideo(cv);
        seen++;
        if (isNew) added++;
        if (detectAlert(video, isNew)) alerts++;
        await cacheCover(video);
      }
    }
    if (opts.refresh ?? true) {
      runState.step = "compteurs";
      const r = await refreshStats(120, 900);
      alerts += r.alerts;
      if (r.total) log(`compteurs rafraîchis : ${r.ok}/${r.total}`);
    }
    summary = `${seen} vidéo(s) vue(s), ${added} nouvelle(s), ${alerts} alerte(s)`;
    log("terminé : " + summary);
    db.prepare("UPDATE runs SET finished_at = ?, ok = 1, summary = ? WHERE id = ?").run(now(), summary, runId);
  } catch (e) {
    summary = "erreur : " + (e as Error).message;
    log(summary);
    db.prepare("UPDATE runs SET finished_at = ?, ok = 0, summary = ? WHERE id = ?").run(now(), summary, runId);
  } finally {
    runState.running = false;
    runState.step = "";
  }
  return summary;
}

/** Boucle de veille : rapide, silencieuse, une alerte dès qu'une vidéo décolle. */
export async function runWatch(): Promise<void> {
  if (runState.watch.running || runState.running) return;
  runState.watch.running = true;
  try {
    const r = await refreshStats(80, 450);
    runState.watch.lastAt = now();
    runState.watch.lastCount = r.ok;
    runState.watch.lastAlerts = r.alerts;
    if (r.alerts) log(`veille : ${r.alerts} alerte(s) sur ${r.ok} vidéo(s)`);
  } catch (e) {
    log("veille : " + (e as Error).message);
  } finally {
    runState.watch.running = false;
    const m = getSettings().watchMinutes;
    runState.watch.nextAt = m > 0 ? now() + m * 60 : null;
  }
}

/** Import manuel d'une ou plusieurs URL TikTok. */
export async function importUrls(urls: string[]): Promise<{ ok: number; errors: string[]; ids: number[] }> {
  let ok = 0;
  const errors: string[] = [];
  const ids: number[] = [];
  for (const u of urls) {
    try {
      const cv = await fetchTikTokVideo(u, "import");
      const { video, isNew } = upsertVideo(cv);
      detectAlert(video, isNew);
      await cacheCover(video);
      ids.push(video.id);
      ok++;
    } catch (e) {
      errors.push(`${u} : ${(e as Error).message}`);
    }
    await sleep(500);
  }
  return { ok, errors, ids };
}

let discoveryTimer: NodeJS.Timeout | null = null;
let watchTimer: NodeJS.Timeout | null = null;

export function scheduleRefresh() {
  if (discoveryTimer) clearInterval(discoveryTimer);
  if (watchTimer) clearInterval(watchTimer);
  const s = getSettings();
  if (s.discoveryMinutes > 0) {
    discoveryTimer = setInterval(() => {
      runCollection({ discover: true, refresh: false }).catch((e) => log("découverte planifiée : " + (e as Error).message));
    }, s.discoveryMinutes * 60_000);
  }
  if (s.watchMinutes > 0) {
    runState.watch.nextAt = now() + s.watchMinutes * 60;
    watchTimer = setInterval(() => {
      runWatch().catch((e) => log("veille : " + (e as Error).message));
    }, s.watchMinutes * 60_000);
  } else {
    runState.watch.nextAt = null;
  }
}
