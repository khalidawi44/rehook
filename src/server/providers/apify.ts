// Découverte via Apify (acteur clockworks/tiktok-scraper). Payant, robuste.
// Doc de l'acteur : https://apify.com/clockworks/tiktok-scraper
import type { CollectedVideo } from "../db.js";

type ApifyItem = {
  id?: string;
  text?: string;
  createTime?: number;
  createTimeISO?: string;
  webVideoUrl?: string;
  playCount?: number;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  collectCount?: number;
  hashtags?: { name?: string }[];
  locationCreated?: string;
  authorMeta?: { name?: string; nickName?: string; avatar?: string; fans?: number; region?: string };
  musicMeta?: { musicName?: string; musicAuthor?: string };
  videoMeta?: { duration?: number; coverUrl?: string };
  covers?: { default?: string; origin?: string };
};

function toVideo(it: ApifyItem, source: string): CollectedVideo | null {
  const handle = it.authorMeta?.name;
  if (!it.id || !handle) return null;
  const desc = it.text ?? "";
  const tags = (it.hashtags ?? []).map((h) => h.name).filter((t): t is string => !!t);
  const fromDesc = [...desc.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]);
  return {
    externalId: String(it.id),
    url: it.webVideoUrl ?? `https://www.tiktok.com/@${handle}/video/${it.id}`,
    caption: desc,
    hashtags: [...new Set([...tags, ...fromDesc].map((t) => t.toLowerCase()))],
    durationS: it.videoMeta?.duration ?? null,
    postedAt: it.createTime ?? (it.createTimeISO ? Math.floor(Date.parse(it.createTimeISO) / 1000) : null),
    coverUrl: it.videoMeta?.coverUrl ?? it.covers?.default ?? null,
    region: it.locationCreated ?? it.authorMeta?.region ?? null,
    music: it.musicMeta ? [it.musicMeta.musicName, it.musicMeta.musicAuthor].filter(Boolean).join(" · ") : null,
    source,
    account: {
      handle,
      nickname: it.authorMeta?.nickName ?? null,
      avatarUrl: it.authorMeta?.avatar ?? null,
      followers: it.authorMeta?.fans ?? null,
      region: it.authorMeta?.region ?? null,
    },
    stats: {
      views: it.playCount ?? 0,
      likes: it.diggCount ?? 0,
      comments: it.commentCount ?? 0,
      shares: it.shareCount ?? 0,
      saves: it.collectCount ?? 0,
    },
  };
}

export async function apifyCollect(
  input: { hashtags?: string[]; searchQueries?: string[]; profiles?: string[] },
  perSource: number,
  log: (l: string) => void,
): Promise<CollectedVideo[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN manquant dans .env");
  const body = {
    hashtags: input.hashtags ?? [],
    searchQueries: input.searchQueries ?? [],
    profiles: input.profiles ?? [],
    resultsPerPage: perSource,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    excludePinnedPosts: true,
  };
  const r = await fetch(
    "https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?timeout=300&format=json",
    { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) },
  );
  if (!r.ok) throw new Error(`Apify a répondu ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const items = (await r.json()) as ApifyItem[];
  const profiles = new Set((input.profiles ?? []).map((p) => p.replace(/^@/, "").toLowerCase()));
  const out: CollectedVideo[] = [];
  for (const it of items) {
    const handle = it.authorMeta?.name?.toLowerCase() ?? "";
    const source = profiles.has(handle) ? "account" : (input.hashtags?.length ? "hashtag" : "keyword");
    const v = toVideo(it, source);
    if (v) out.push(v);
  }
  log(`apify : ${out.length} vidéo(s) pour ${JSON.stringify(input)}`);
  return out;
}
