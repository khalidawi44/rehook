// Base SQLite (module natif de Node 22, aucune compilation).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.js";

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "niche.sqlite"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  handle TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  followers INTEGER,
  region TEXT,
  followed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(platform, handle)
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  external_id TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '[]',
  duration_s INTEGER,
  posted_at INTEGER,
  cover_url TEXT,
  cover_file TEXT,
  region TEXT,
  music TEXT,
  source TEXT NOT NULL DEFAULT 'import',
  favorite INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  captured_at INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_snapshots_video ON snapshots(video_id, captured_at);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  step TEXT NOT NULL DEFAULT 'En attente',
  progress REAL NOT NULL DEFAULT 0,
  options TEXT NOT NULL DEFAULT '{}',
  brief TEXT,
  output_file TEXT,
  error TEXT,
  log TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  views_per_hour REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alerts_video ON alerts(video_id, created_at);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  ok INTEGER,
  summary TEXT
);
`);

export const now = () => Math.floor(Date.now() / 1000);

export type AccountRow = {
  id: number;
  platform: string;
  handle: string;
  nickname: string | null;
  avatar_url: string | null;
  followers: number | null;
  region: string | null;
  followed: number;
  created_at: number;
  updated_at: number;
};

export type VideoRow = {
  id: number;
  platform: string;
  external_id: string;
  account_id: number;
  url: string;
  caption: string;
  hashtags: string;
  duration_s: number | null;
  posted_at: number | null;
  cover_url: string | null;
  cover_file: string | null;
  region: string | null;
  music: string | null;
  source: string;
  favorite: number;
  first_seen_at: number;
  last_seen_at: number;
};

export type SnapshotRow = {
  id: number;
  video_id: number;
  captured_at: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

export type JobRow = {
  id: number;
  video_id: number;
  status: "queued" | "running" | "done" | "error";
  step: string;
  progress: number;
  options: string;
  brief: string | null;
  output_file: string | null;
  error: string | null;
  log: string;
  created_at: number;
  updated_at: number;
};

// ---- Réglages -------------------------------------------------------------

export type Settings = {
  hashtags: string[];
  keywords: string[];
  viralMinViews: number;
  viralMinViewsPerHour: number;
  viralOutlierFactor: number;
  /** Découverte (comptes suivis, hashtags, mots-clés) : toutes les N minutes, 0 = jamais. */
  discoveryMinutes: number;
  /** Veille : relecture des compteurs des vidéos récentes toutes les N minutes, 0 = jamais. */
  watchMinutes: number;
  /** Fenêtre de veille : vidéos publiées depuis moins de N heures. */
  watchHours: number;
  /** Alerte « ça explose » : vues minimum et rythme minimum (vues/h) sur le dernier intervalle. */
  alertMinViews: number;
  alertMinViewsPerHour: number;
  videosPerSource: number;
  language: string;
  packLoaded: string;
};

const DEFAULT_SETTINGS: Settings = {
  hashtags: ["humour", "drole", "humourfrancais", "blague", "sketch"],
  keywords: [],
  viralMinViews: 100_000,
  viralMinViewsPerHour: 2_000,
  viralOutlierFactor: 3,
  discoveryMinutes: Number(process.env.NICHE_DISCOVERY_MINUTES ?? 15),
  watchMinutes: Number(process.env.NICHE_WATCH_MINUTES ?? 2),
  watchHours: 72,
  alertMinViews: 5_000,
  alertMinViewsPerHour: 3_000,
  videosPerSource: 30,
  language: "auto",
  packLoaded: "",
};

export function getSettings(): Settings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'settings'").get() as
    | { value: string }
    | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  db.prepare(
    "INSERT INTO settings(key, value) VALUES('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(next));
  return next;
}

// ---- Upserts utilisés par les collecteurs ---------------------------------

export type CollectedAccount = {
  handle: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  followers?: number | null;
  region?: string | null;
};

export type CollectedVideo = {
  externalId: string;
  url: string;
  caption: string;
  hashtags: string[];
  durationS?: number | null;
  postedAt?: number | null;
  coverUrl?: string | null;
  region?: string | null;
  music?: string | null;
  source: string;
  account: CollectedAccount;
  stats: { views: number; likes: number; comments: number; shares: number; saves?: number };
};

export function upsertAccount(a: CollectedAccount, platform = "tiktok"): AccountRow {
  const handle = a.handle.replace(/^@/, "").toLowerCase();
  const t = now();
  db.prepare(
    `INSERT INTO accounts(platform, handle, nickname, avatar_url, followers, region, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(platform, handle) DO UPDATE SET
       nickname = COALESCE(excluded.nickname, accounts.nickname),
       avatar_url = COALESCE(excluded.avatar_url, accounts.avatar_url),
       followers = COALESCE(excluded.followers, accounts.followers),
       region = COALESCE(excluded.region, accounts.region),
       updated_at = excluded.updated_at`,
  ).run(platform, handle, a.nickname ?? null, a.avatarUrl ?? null, a.followers ?? null, a.region ?? null, t, t);
  return db.prepare("SELECT * FROM accounts WHERE platform = ? AND handle = ?").get(platform, handle) as AccountRow;
}

export function upsertVideo(v: CollectedVideo, platform = "tiktok"): { video: VideoRow; isNew: boolean } {
  const account = upsertAccount(v.account, platform);
  const t = now();
  const existing = db
    .prepare("SELECT * FROM videos WHERE platform = ? AND external_id = ?")
    .get(platform, v.externalId) as VideoRow | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO videos(platform, external_id, account_id, url, caption, hashtags, duration_s, posted_at, cover_url, region, music, source, first_seen_at, last_seen_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      platform,
      v.externalId,
      account.id,
      v.url,
      v.caption,
      JSON.stringify(v.hashtags),
      v.durationS ?? null,
      v.postedAt ?? null,
      v.coverUrl ?? null,
      v.region ?? null,
      v.music ?? null,
      v.source,
      t,
      t,
    );
  } else {
    db.prepare(
      `UPDATE videos SET caption = CASE WHEN ? <> '' THEN ? ELSE caption END,
         hashtags = CASE WHEN ? <> '[]' THEN ? ELSE hashtags END,
         duration_s = COALESCE(?, duration_s), posted_at = COALESCE(?, posted_at),
         cover_url = COALESCE(?, cover_url), region = COALESCE(?, region), music = COALESCE(?, music),
         last_seen_at = ? WHERE id = ?`,
    ).run(
      v.caption,
      v.caption,
      JSON.stringify(v.hashtags),
      JSON.stringify(v.hashtags),
      v.durationS ?? null,
      v.postedAt ?? null,
      v.coverUrl ?? null,
      v.region ?? null,
      v.music ?? null,
      t,
      existing.id,
    );
  }
  const video = db
    .prepare("SELECT * FROM videos WHERE platform = ? AND external_id = ?")
    .get(platform, v.externalId) as VideoRow;
  db.prepare(
    "INSERT INTO snapshots(video_id, captured_at, views, likes, comments, shares, saves) VALUES(?, ?, ?, ?, ?, ?, ?)",
  ).run(video.id, t, v.stats.views, v.stats.likes, v.stats.comments, v.stats.shares, v.stats.saves ?? 0);
  return { video, isNew: !existing };
}

export function lastSnapshots(videoId: number, limit = 2): SnapshotRow[] {
  return db
    .prepare("SELECT * FROM snapshots WHERE video_id = ? ORDER BY captured_at DESC LIMIT ?")
    .all(videoId, limit) as SnapshotRow[];
}
