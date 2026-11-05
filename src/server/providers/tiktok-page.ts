// Lecture d'une page vidéo TikTok publique : le HTML embarque un JSON
// (__UNIVERSAL_DATA_FOR_REHYDRATION__) avec la légende, l'auteur et les stats.
// Sert à l'import d'URL et au rafraîchissement des compteurs.
import type { CollectedVideo } from "../db.js";

export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const VIDEO_URL_RE = /tiktok\.com\/@([\w.-]+)\/video\/(\d+)/i;
const SHORT_URL_RE = /(?:vm|vt)\.tiktok\.com\/[\w-]+|tiktok\.com\/t\/[\w-]+/i;

export function parseTikTokUrl(input: string): { handle: string; id: string } | null {
  const m = input.match(VIDEO_URL_RE);
  if (!m) return null;
  return { handle: m[1], id: m[2] };
}

async function resolveShortUrl(url: string): Promise<string> {
  const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": BROWSER_UA } });
  return r.url;
}

type ItemStruct = {
  id: string;
  desc?: string;
  createTime?: string | number;
  stats?: Record<string, number | string>;
  statsV2?: Record<string, string>;
  video?: {
    duration?: number;
    cover?: string;
    originCover?: string;
    playAddr?: string;
    downloadAddr?: string;
    subtitleInfos?: { LanguageCodeName?: string; Url?: string; Format?: string; Source?: string }[];
  };
  stickersOnItem?: { stickerText?: string[] }[];
  author?: { uniqueId?: string; nickname?: string; avatarThumb?: string; avatarMedium?: string; region?: string };
  authorStats?: { followerCount?: number };
  textExtra?: { hashtagName?: string }[];
  locationCreated?: string;
  music?: { title?: string; authorName?: string };
};

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Convertit un itemStruct TikTok (page ou API) en vidéo collectée. */
export function itemToVideo(it: ItemStruct, source: string, handleHint?: string): CollectedVideo | null {
  const handle = it.author?.uniqueId ?? handleHint;
  if (!it.id || !handle) return null;
  const stats = { ...(it.statsV2 ?? {}), ...(it.stats ?? {}) } as Record<string, unknown>;
  const desc = it.desc ?? "";
  const tags = (it.textExtra ?? []).map((t) => t.hashtagName).filter((t): t is string => !!t);
  const fromDesc = [...desc.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]);
  const hashtags = [...new Set([...tags, ...fromDesc].map((t) => t.toLowerCase()))];
  return {
    externalId: String(it.id),
    url: `https://www.tiktok.com/@${handle}/video/${it.id}`,
    caption: desc,
    hashtags,
    durationS: it.video?.duration ?? null,
    postedAt: it.createTime ? n(it.createTime) : null,
    coverUrl: it.video?.cover ?? it.video?.originCover ?? null,
    region: it.locationCreated ?? it.author?.region ?? null,
    music: it.music ? [it.music.title, it.music.authorName].filter(Boolean).join(" · ") : null,
    source,
    account: {
      handle,
      nickname: it.author?.nickname ?? null,
      avatarUrl: it.author?.avatarMedium ?? it.author?.avatarThumb ?? null,
      followers: it.authorStats?.followerCount ?? null,
      region: it.author?.region ?? null,
    },
    stats: {
      views: n(stats.playCount),
      likes: n(stats.diggCount),
      comments: n(stats.commentCount),
      shares: n(stats.shareCount),
      saves: n(stats.collectCount),
    },
  };
}

export function extractRehydration(html: string): Record<string, unknown> | null {
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
  if (!m) return null;
  try {
    const json = JSON.parse(m[1]) as { __DEFAULT_SCOPE__?: Record<string, unknown> };
    return json.__DEFAULT_SCOPE__ ?? null;
  } catch {
    return null;
  }
}

export type TikTokVideoDetail = {
  video: CollectedVideo;
  playAddr: string | null;
  cookies: string;
  subtitles: { lang: string; url: string; format: string; source: string }[];
  stickers: string[];
};

/** Comme fetchTikTokVideo, avec en plus l'adresse du fichier, les sous-titres et le texte incrusté. */
export async function fetchTikTokVideoDetail(inputUrl: string, source = "import"): Promise<TikTokVideoDetail> {
  const { item, video, cookies } = await fetchItem(inputUrl, source);
  const subtitles = (item.video?.subtitleInfos ?? [])
    .filter((s) => s.Url)
    .map((s) => ({ lang: s.LanguageCodeName ?? "", url: s.Url!, format: (s.Format ?? "").toLowerCase(), source: s.Source ?? "" }));
  const stickers = (item.stickersOnItem ?? []).flatMap((st) => st.stickerText ?? []).map((t) => t.trim()).filter(Boolean);
  return { video, playAddr: item.video?.playAddr ?? item.video?.downloadAddr ?? null, cookies, subtitles, stickers };
}

/** Lit une page vidéo TikTok et renvoie la vidéo avec ses stats du moment. */
export async function fetchTikTokVideo(inputUrl: string, source = "import"): Promise<CollectedVideo> {
  return (await fetchItem(inputUrl, source)).video;
}

async function fetchItem(inputUrl: string, source: string): Promise<{ item: ItemStruct; video: CollectedVideo; cookies: string }> {
  let url = inputUrl.trim();
  if (SHORT_URL_RE.test(url) && !VIDEO_URL_RE.test(url)) url = await resolveShortUrl(url);
  const parsed = parseTikTokUrl(url);
  if (!parsed) throw new Error("URL TikTok non reconnue : " + inputUrl);
  const canonical = `https://www.tiktok.com/@${parsed.handle}/video/${parsed.id}`;
  const r = await fetch(canonical, {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" },
  });
  if (!r.ok) throw new Error(`TikTok a répondu ${r.status} pour ${canonical}`);
  const html = await r.text();
  const scope = extractRehydration(html);
  const detail = scope?.["webapp.video-detail"] as { itemInfo?: { itemStruct?: ItemStruct }; statusCode?: number } | undefined;
  const item = detail?.itemInfo?.itemStruct;
  if (!item) {
    throw new Error(
      detail?.statusCode ? `Vidéo indisponible (code ${detail.statusCode})` : "Pas de données dans la page (TikTok a peut-être demandé une vérification)",
    );
  }
  const video = itemToVideo(item, source, parsed.handle);
  if (!video) throw new Error("Données incomplètes pour " + canonical);
  const cookies = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { item, video, cookies };
}

/** Télécharge un fichier servi par TikTok (vidéo, sous-titres) avec les cookies de la page. */
export async function fetchTikTokAsset(url: string, cookies: string): Promise<Response> {
  return fetch(url, { headers: { "User-Agent": BROWSER_UA, Referer: "https://www.tiktok.com/", Cookie: cookies } });
}

/** Infos publiques d'un profil (abonnés, avatar). La liste des vidéos passe par le navigateur ou Apify. */
export async function fetchTikTokProfile(handle: string) {
  const h = handle.replace(/^@/, "");
  const r = await fetch(`https://www.tiktok.com/@${h}`, { headers: { "User-Agent": BROWSER_UA } });
  if (!r.ok) throw new Error(`TikTok a répondu ${r.status} pour @${h}`);
  const scope = extractRehydration(await r.text());
  const ud = scope?.["webapp.user-detail"] as
    | { userInfo?: { user?: { uniqueId?: string; nickname?: string; avatarMedium?: string; region?: string }; stats?: { followerCount?: number } } }
    | undefined;
  const u = ud?.userInfo?.user;
  if (!u?.uniqueId) throw new Error(`Profil @${h} introuvable`);
  return {
    handle: u.uniqueId,
    nickname: u.nickname ?? null,
    avatarUrl: u.avatarMedium ?? null,
    followers: ud?.userInfo?.stats?.followerCount ?? null,
    region: u.region ?? null,
  };
}
