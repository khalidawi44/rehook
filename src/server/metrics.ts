// Calcul des indicateurs affichés sur chaque carte : vues/h, croissance,
// engagement, et le verdict « viral ».
import { db, getSettings, activeChannelId, parseChannels, type AccountRow, type SnapshotRow, type VideoRow } from "./db.js";

export type VideoMetrics = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  ageHours: number | null;
  viewsPerHour: number | null;
  growth: number | null; // vues gagnées depuis le relevé précédent
  growthHours: number | null;
  engagement: number | null; // en %
  accountMedianViews: number | null;
  outlierRatio: number | null; // vues / médiane du compte
  viral: boolean;
  viralReasons: string[];
  score: number;
  capturedAt: number;
};

export type VideoCard = {
  id: number;
  platform: string;
  externalId: string;
  url: string;
  caption: string;
  hashtags: string[];
  durationS: number | null;
  postedAt: number | null;
  cover: string | null;
  region: string | null;
  music: string | null;
  source: string;
  favorite: boolean;
  category: string | null;
  seen: boolean;
  account: {
    id: number;
    handle: string;
    nickname: string | null;
    avatar: string | null;
    followers: number | null;
    followed: boolean;
  };
  metrics: VideoMetrics;
};

const medianCache = new Map<number, number | null>();

export function resetMedianCache() {
  medianCache.clear();
}

function accountMedianViews(accountId: number): number | null {
  if (medianCache.has(accountId)) return medianCache.get(accountId)!;
  const rows = db
    .prepare(
      `SELECT MAX(s.views) AS views FROM videos v JOIN snapshots s ON s.video_id = v.id
       WHERE v.account_id = ? GROUP BY v.id`,
    )
    .all(accountId) as { views: number }[];
  let median: number | null = null;
  if (rows.length >= 3) {
    const sorted = rows.map((r) => r.views).sort((a, b) => a - b);
    median = sorted[Math.floor(sorted.length / 2)];
  }
  medianCache.set(accountId, median);
  return median;
}

export function computeMetrics(video: VideoRow, snaps: SnapshotRow[], nowS = Math.floor(Date.now() / 1000)): VideoMetrics {
  const settings = getSettings();
  const last = snaps[0];
  const prev = snaps.find((s) => s.id !== last?.id && last.captured_at - s.captured_at >= 1800);
  const views = last?.views ?? 0;
  const ageHours = video.posted_at ? Math.max(0.25, (last?.captured_at ?? nowS) - video.posted_at) / 3600 : null;

  let viewsPerHour: number | null = null;
  let growth: number | null = null;
  let growthHours: number | null = null;
  if (last && prev) {
    growth = Math.max(0, last.views - prev.views);
    growthHours = (last.captured_at - prev.captured_at) / 3600;
    viewsPerHour = growth / growthHours;
  } else if (ageHours) {
    viewsPerHour = views / ageHours;
  }

  const interactions = (last?.likes ?? 0) + (last?.comments ?? 0) + (last?.shares ?? 0);
  const engagement = views > 0 ? (interactions / views) * 100 : null;

  const median = accountMedianViews(video.account_id);
  const outlierRatio = median && median > 0 ? views / median : null;

  const reasons: string[] = [];
  const recent = ageHours === null || ageHours <= 7 * 24;
  if (recent && views >= settings.viralMinViews && (viewsPerHour ?? 0) >= settings.viralMinViewsPerHour) {
    reasons.push("vues et rythme");
  }
  if (recent && outlierRatio !== null && outlierRatio >= settings.viralOutlierFactor && views >= settings.viralMinViews / 4) {
    reasons.push(`${outlierRatio.toFixed(1)}x la médiane du compte`);
  }
  const viral = reasons.length > 0;

  // Score de tri : rythme récent pondéré par la taille, bonus outlier.
  const score = Math.log10(1 + (viewsPerHour ?? 0)) * 2 + Math.log10(1 + views) + (outlierRatio ? Math.min(2, Math.log10(1 + outlierRatio)) : 0);

  return {
    views,
    likes: last?.likes ?? 0,
    comments: last?.comments ?? 0,
    shares: last?.shares ?? 0,
    saves: last?.saves ?? 0,
    ageHours,
    viewsPerHour,
    growth,
    growthHours,
    engagement,
    accountMedianViews: median,
    outlierRatio,
    viral,
    viralReasons: reasons,
    score,
    capturedAt: last?.captured_at ?? nowS,
  };
}

export function toCard(video: VideoRow, account: AccountRow, snaps: SnapshotRow[]): VideoCard {
  let hashtags: string[] = [];
  try {
    hashtags = JSON.parse(video.hashtags);
  } catch {
    hashtags = [];
  }
  return {
    id: video.id,
    platform: video.platform,
    externalId: video.external_id,
    url: video.url,
    caption: video.caption,
    hashtags,
    durationS: video.duration_s,
    postedAt: video.posted_at,
    cover: video.cover_file ? `/covers/${video.cover_file}` : video.cover_url,
    region: video.region,
    music: video.music,
    source: video.source,
    favorite: !!video.favorite,
    category: video.category ?? null,
    seen: !!video.seen_at,
    account: {
      id: account.id,
      handle: account.handle,
      nickname: account.nickname,
      avatar: account.avatar_url,
      followers: account.followers,
      followed: parseChannels(account.channels).includes(activeChannelId()),
    },
    metrics: computeMetrics(video, snaps),
  };
}

export type ListQuery = {
  view: "viral" | "all" | "favorites";
  period: "24h" | "3d" | "7d" | "all";
  duration: "all" | "short" | "medium" | "long" | "xlong";
  sort: "views" | "vph" | "growth" | "engagement" | "recent" | "score";
  unfollowed: boolean;
  /** Uniquement les vidéos des comptes suivis. */
  followed?: boolean;
  q: string;
  accountId?: number;
};

/**
 * Fil façon TikTok : vidéos variées, pas encore vues d'abord, mélangées entre catégories.
 * `category` : une catégorie Explorer, « niche » (comptes suivis, hashtags, recherches), ou vide pour tout.
 */
export function feedCards(category: string, limit = 24): VideoCard[] {
  resetMedianCache();
  const channel = activeChannelId();
  const where = ["v.source <> 'demo'", "v.cover_url IS NOT NULL OR v.cover_file IS NOT NULL", "(v.channel_id IS NULL OR v.channel_id = ?)"];
  const params: (string | number)[] = [channel];
  if (category === "niche") {
    where.push("(a.channels LIKE ? OR v.channel_id = ?)");
    params.push(`%"${channel}"%`, channel);
  }
  else if (category) {
    where.push("v.category = ?");
    params.push(category);
  }
  const rows = db
    .prepare(`SELECT v.*, a.handle AS a_handle FROM videos v JOIN accounts a ON a.id = v.account_id WHERE ${where.map((w) => `(${w})`).join(" AND ")} ORDER BY (v.seen_at IS NULL) DESC, RANDOM() LIMIT ?`)
    .all(...params, limit * 4) as (VideoRow & { a_handle: string })[];
  // Mélange : jamais deux vidéos de suite de la même catégorie ou du même compte quand on peut l'éviter.
  const picked: VideoRow[] = [];
  const pool = rows.slice();
  while (picked.length < limit && pool.length) {
    const last = picked[picked.length - 1];
    let idx = pool.findIndex((r) => !last || ((r.category ?? r.source) !== (last.category ?? last.source) && r.account_id !== last.account_id));
    if (idx < 0) idx = 0;
    picked.push(pool.splice(idx, 1)[0]);
  }
  const accStmt = db.prepare("SELECT * FROM accounts WHERE id = ?");
  const snapStmt = db.prepare("SELECT * FROM snapshots WHERE video_id = ? ORDER BY captured_at DESC LIMIT 6");
  return picked.map((v) => toCard(v, accStmt.get(v.account_id) as AccountRow, snapStmt.all(v.id) as SnapshotRow[]));
}

export function feedCategories(): { key: string; n: number; unseen: number }[] {
  const rows = db
    .prepare("SELECT category AS key, COUNT(*) AS n, SUM(CASE WHEN seen_at IS NULL THEN 1 ELSE 0 END) AS unseen FROM videos WHERE source <> 'demo' AND category IS NOT NULL GROUP BY category ORDER BY n DESC")
    .all() as { key: string; n: number; unseen: number }[];
  const niche = db
    .prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN v.seen_at IS NULL THEN 1 ELSE 0 END) AS unseen FROM videos v JOIN accounts a ON a.id = v.account_id WHERE v.source <> 'demo' AND (a.followed = 1 OR v.source IN ('hashtag', 'keyword', 'account', 'import'))")
    .get() as { n: number; unseen: number };
  return [{ key: "niche", n: niche.n, unseen: niche.unseen ?? 0 }, ...rows];
}

export function listCards(q: ListQuery): VideoCard[] {
  resetMedianCache();
  const nowS = Math.floor(Date.now() / 1000);
  const periodS = { "24h": 86400, "3d": 3 * 86400, "7d": 7 * 86400, all: 0 }[q.period];
  const where: string[] = [];
  const params: (string | number)[] = [];
  // Chaîne active : uniquement ses vidéos propres (le fil partagé Explorer se lit dans l'onglet Fil).
  const channel = activeChannelId();
  where.push("v.channel_id = ?");
  params.push(channel);
  if (periodS) {
    where.push("(v.posted_at IS NULL OR v.posted_at >= ?)");
    params.push(nowS - periodS);
  }
  if (q.followed) {
    where.push("a.followed = 1 AND a.channels LIKE ?");
    params.push(`%"${channel}"%`);
  }
  else if (!q.unfollowed) {
    // Sans « Comptes non suivis » : comptes suivis + vidéos trouvées par hashtag, recherche ou import.
    where.push("(a.followed = 1 OR v.source IN ('hashtag', 'keyword', 'import'))");
  }
  if (q.accountId) {
    where.push("v.account_id = ?");
    params.push(q.accountId);
  }
  if (q.q) {
    where.push("(v.caption LIKE ? OR a.handle LIKE ? OR v.hashtags LIKE ?)");
    const like = `%${q.q}%`;
    params.push(like, like, like);
  }
  if (q.view === "favorites") where.push("v.favorite = 1");
  const dur: Record<string, string> = {
    short: "v.duration_s < 15",
    medium: "v.duration_s BETWEEN 15 AND 60",
    long: "v.duration_s BETWEEN 61 AND 180",
    xlong: "v.duration_s > 180",
  };
  if (q.duration !== "all") where.push(dur[q.duration]);

  const rows = db
    .prepare(
      `SELECT v.*, a.id AS a_id, a.platform AS a_platform, a.handle AS a_handle, a.nickname AS a_nickname,
              a.avatar_url AS a_avatar_url, a.followers AS a_followers, a.region AS a_region, a.followed AS a_followed, a.channels AS a_channels,
              a.created_at AS a_created_at, a.updated_at AS a_updated_at
       FROM videos v JOIN accounts a ON a.id = v.account_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}`,
    )
    .all(...params) as (VideoRow & Record<string, unknown>)[];

  const snapStmt = db.prepare("SELECT * FROM snapshots WHERE video_id = ? ORDER BY captured_at DESC LIMIT 6");
  let cards = rows.map((r) => {
    const account: AccountRow = {
      id: r.a_id as number,
      platform: r.a_platform as string,
      handle: r.a_handle as string,
      nickname: r.a_nickname as string | null,
      avatar_url: r.a_avatar_url as string | null,
      followers: r.a_followers as number | null,
      region: r.a_region as string | null,
      followed: r.a_followed as number,
      channels: (r.a_channels as string) ?? "[]",
      created_at: r.a_created_at as number,
      updated_at: r.a_updated_at as number,
    };
    return toCard(r, account, snapStmt.all(r.id) as SnapshotRow[]);
  });

  if (!q.unfollowed) {
    cards = cards.filter((c) => c.account.followed || c.source !== "account");
  }
  if (q.view === "viral") cards = cards.filter((c) => c.metrics.viral);

  const key: Record<ListQuery["sort"], (c: VideoCard) => number> = {
    views: (c) => c.metrics.views,
    vph: (c) => c.metrics.viewsPerHour ?? 0,
    growth: (c) => c.metrics.growth ?? -1,
    engagement: (c) => c.metrics.engagement ?? 0,
    recent: (c) => c.postedAt ?? 0,
    score: (c) => c.metrics.score,
  };
  const f = key[q.sort];
  cards.sort((a, b) => f(b) - f(a));
  return cards;
}

export function stats() {
  resetMedianCache();
  const nowS = Math.floor(Date.now() / 1000);
  const total = (db.prepare("SELECT COUNT(*) AS n FROM videos").get() as { n: number }).n;
  const followed = (db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE followed = 1").get() as { n: number }).n;
  const accounts = (db.prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number }).n;
  const viralToday = listCards({ view: "viral", period: "24h", duration: "all", sort: "score", unfollowed: true, q: "" }).length;
  const viralAll = listCards({ view: "viral", period: "7d", duration: "all", sort: "score", unfollowed: true, q: "" }).length;
  const lastRun = db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT 1").get() as
    | { started_at: number; finished_at: number | null; ok: number | null; summary: string | null }
    | undefined;
  const settings = getSettings();
  const nextRefresh =
    settings.discoveryMinutes > 0 && lastRun?.finished_at ? lastRun.finished_at + settings.discoveryMinutes * 60 : null;
  return { viralToday, viralAll, total, followed, accounts, lastRun, nextRefresh, now: nowS };
}
