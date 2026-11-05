// Orchestration d'un relevé : découverte (hashtags, mots-clés, comptes suivis),
// rafraîchissement des compteurs des vidéos récentes, copie des miniatures.
import { db, getSettings, now, upsertVideo, type AccountRow, type CollectedVideo, type VideoRow } from "./db.js";
import { cacheCover } from "./covers.js";
import { fetchTikTokVideo } from "./providers/tiktok-page.js";
import { apifyCollect } from "./providers/apify.js";
import {
  browserCollectAccount,
  browserCollectExplore,
  browserCollectHashtag,
  browserCollectKeyword,
} from "./providers/tiktok-browser.js";

export type RunState = {
  running: boolean;
  startedAt: number | null;
  step: string;
  log: string[];
};

export const runState: RunState = { running: false, startedAt: null, step: "", log: [] };

const log = (line: string) => {
  const stamp = new Date().toISOString().slice(11, 19);
  runState.log.push(`${stamp} ${line}`);
  if (runState.log.length > 200) runState.log.shift();
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
      out.push(...(await browserCollectAccount(h, per, log)));
    } catch (e) {
      log(`compte @${h} : ${(e as Error).message}`);
    }
  }
  for (const tag of settings.hashtags) {
    runState.step = `hashtag #${tag}`;
    try {
      out.push(...(await browserCollectHashtag(tag, per, log)));
    } catch (e) {
      log(`hashtag #${tag} : ${(e as Error).message}`);
    }
  }
  for (const kw of settings.keywords) {
    runState.step = `recherche « ${kw} »`;
    try {
      out.push(...(await browserCollectKeyword(kw, per, log)));
    } catch (e) {
      log(`recherche « ${kw} » : ${(e as Error).message}`);
    }
  }
  if (!followed.length && !settings.hashtags.length && !settings.keywords.length) {
    runState.step = "page Explorer";
    try {
      out.push(...(await browserCollectExplore(per, log)));
    } catch (e) {
      log(`explorer : ${(e as Error).message}`);
    }
  }
  return out;
}

/** Relit les pages des vidéos récentes pour avoir un nouveau relevé (vues/h, croissance). */
async function refreshStats(maxVideos: number) {
  const since = now() - 7 * 86400;
  const rows = db
    .prepare(
      `SELECT v.* FROM videos v
       WHERE v.source <> 'demo' AND (v.posted_at IS NULL OR v.posted_at >= ?)
         AND v.last_seen_at < ?
       ORDER BY v.last_seen_at ASC LIMIT ?`,
    )
    .all(since, now() - 1800, maxVideos) as VideoRow[];
  let ok = 0;
  for (const v of rows) {
    try {
      const fresh = await fetchTikTokVideo(v.url, v.source);
      upsertVideo(fresh);
      ok++;
    } catch (e) {
      log(`stats ${v.url} : ${(e as Error).message}`);
    }
    await sleep(1200 + Math.random() * 800);
  }
  if (rows.length) log(`compteurs rafraîchis : ${ok}/${rows.length}`);
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
    if (opts.discover ?? true) {
      runState.step = "découverte";
      const found = await discover();
      for (const cv of found) {
        const { video, isNew } = upsertVideo(cv);
        seen++;
        if (isNew) added++;
        await cacheCover(video);
      }
    }
    if (opts.refresh ?? true) {
      runState.step = "compteurs";
      await refreshStats(80);
    }
    summary = `${seen} vidéo(s) vue(s), ${added} nouvelle(s)`;
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

/** Import manuel d'une ou plusieurs URL TikTok. */
export async function importUrls(urls: string[]): Promise<{ ok: number; errors: string[] }> {
  let ok = 0;
  const errors: string[] = [];
  for (const u of urls) {
    try {
      const cv = await fetchTikTokVideo(u, "import");
      const { video } = upsertVideo(cv);
      await cacheCover(video);
      ok++;
    } catch (e) {
      errors.push(`${u} : ${(e as Error).message}`);
    }
  }
  return { ok, errors };
}

let timer: NodeJS.Timeout | null = null;

export function scheduleRefresh() {
  if (timer) clearInterval(timer);
  const minutes = getSettings().refreshMinutes;
  if (!minutes || minutes <= 0) return;
  timer = setInterval(() => {
    runCollection().catch((e) => log("relevé planifié : " + (e as Error).message));
  }, minutes * 60_000);
}
