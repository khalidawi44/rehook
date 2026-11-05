// Client HTTP minimal vers l'API Niche.
export type Metrics = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  ageHours: number | null;
  viewsPerHour: number | null;
  growth: number | null;
  growthHours: number | null;
  engagement: number | null;
  accountMedianViews: number | null;
  outlierRatio: number | null;
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
  account: { id: number; handle: string; nickname: string | null; avatar: string | null; followers: number | null; followed: boolean };
  metrics: Metrics;
};

export type Snapshot = { captured_at: number; views: number; likes: number; comments: number; shares: number; saves: number };

export type Stats = {
  viralToday: number;
  viralAll: number;
  total: number;
  followed: number;
  accounts: number;
  lastRun: { started_at: number; finished_at: number | null; ok: number | null; summary: string | null } | null;
  nextRefresh: number | null;
  now: number;
  unseenAlerts: number;
  settings: Settings;
  run: {
    running: boolean;
    startedAt: number | null;
    step: string;
    log: string[];
    watch: { running: boolean; lastAt: number | null; nextAt: number | null; lastCount: number; lastAlerts: number };
  };
  providers: { discovery: string; images: string; voice: string; anthropic: boolean; telegram: boolean };
};

export type Alert = {
  id: number;
  video_id: number;
  kind: "explose" | "nouvelle" | "accelere";
  message: string;
  views: number;
  views_per_hour: number;
  created_at: number;
  seen: number;
  video: { id: number; caption: string; url: string; cover: string | null; handle: string };
};

export type Capture = { id: string; name: string; file: string; url: string; durationS: number; width: number; height: number; createdAt: number };

export type ClipSource = { kind: "video" | "capture" | "render"; id: string };
export type Clip = { source: ClipSource; inS: number; outS: number; mute?: boolean; volume?: number; speed?: number };
export type MontageSources = {
  videos: { id: string; name: string; durationS: number | null; cover: string | null; url: string }[];
  captures: { id: string; name: string; durationS: number; url: string }[];
  renders: { id: string; name: string; url: string }[];
};
export type MontageJob = { id: string; name: string; status: "running" | "done" | "error"; progress: number; url: string | null; error: string | null; createdAt: number; durationS: number };

export type Pack = { name: string; title: string; description: string; accounts: number; hashtags: string[]; videos: number };

export type Account = {
  id: number;
  handle: string;
  nickname: string | null;
  avatar_url: string | null;
  followers: number | null;
  region: string | null;
  followed: number;
  videos: number;
  max_views: number | null;
  avg_views: number | null;
};

export type Settings = {
  hashtags: string[];
  keywords: string[];
  viralMinViews: number;
  viralMinViewsPerHour: number;
  viralOutlierFactor: number;
  discoveryMinutes: number;
  watchMinutes: number;
  watchHours: number;
  alertMinViews: number;
  alertMinViewsPerHour: number;
  videosPerSource: number;
  language: string;
  packLoaded: string;
};

export type Scene = { narration: string; onScreen: string; visual: string; keywords: string[]; seconds: number };
export type Brief = {
  sourceSummary?: string;
  mechanism?: string;
  mode?: "auto" | "tournage";
  shootingTips?: string;
  analysis?: { frames: string[]; transcript: string | null; transcriptSource: string | null; stickers: string[] };
  credits?: string[];
  language: string;
  niche: string;
  format: string;
  whyItWorks: string;
  hook: string;
  title: string;
  scenes: Scene[];
  cta: string;
  caption: string;
  hashtags: string[];
  style: { palette: string[]; mood: string; voice: string };
};

export type Job = {
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
  video: { id: number; caption: string; cover: string | null; handle: string };
};

export type JobOptions = {
  twist?: string;
  language?: string;
  targetSeconds?: number;
  sceneCount?: number;
  images?: string;
  voice?: string;
  music?: string | null;
  captionStyle?: "karaoke" | "block";
  handle?: string;
  reuseBrief?: boolean;
  backgroundCapture?: string | null;
};

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `Erreur ${r.status}`);
  return body as T;
}

export const api = {
  stats: () => req<Stats>("/api/stats"),
  videos: (params: Record<string, string>) => req<VideoCard[]>("/api/videos?" + new URLSearchParams(params)),
  video: (id: number) => req<VideoCard & { snapshots: Snapshot[] }>(`/api/videos/${id}`),
  favorite: (id: number) => req<{ favorite: boolean }>(`/api/videos/${id}/favorite`, { method: "POST" }),
  deleteVideo: (id: number) => req<{ ok: boolean }>(`/api/videos/${id}`, { method: "DELETE" }),
  import: (text: string) => req<{ ok: number; errors: string[] }>("/api/import", { method: "POST", body: JSON.stringify({ text }) }),
  refresh: () => req<{ started: boolean }>("/api/refresh", { method: "POST", body: "{}" }),
  accounts: () => req<Account[]>("/api/accounts"),
  addAccount: (handle: string) => req<Account>("/api/accounts", { method: "POST", body: JSON.stringify({ handle }) }),
  setFollowed: (id: number, followed: boolean) => req<{ ok: boolean }>(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ followed }) }),
  deleteAccount: (id: number) => req<{ ok: boolean }>(`/api/accounts/${id}`, { method: "DELETE" }),
  settings: () => req<Settings>("/api/settings"),
  saveSettings: (s: Partial<Settings>) => req<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
  demo: (remove: boolean) => req<{ added?: number; removed?: number }>("/api/demo", { method: "POST", body: JSON.stringify({ remove }) }),
  recreate: (videoId: number, options: JobOptions) => req<Job>("/api/recreate", { method: "POST", body: JSON.stringify({ videoId, options }) }),
  jobs: () => req<Job[]>("/api/jobs"),
  job: (id: number) => req<Job>(`/api/jobs/${id}`),
  retryJob: (id: number, options: JobOptions) => req<Job>(`/api/jobs/${id}/retry`, { method: "POST", body: JSON.stringify(options) }),
  deleteJob: (id: number) => req<{ ok: boolean }>(`/api/jobs/${id}`, { method: "DELETE" }),
  music: () => req<string[]>("/api/music"),
  alerts: () => req<Alert[]>("/api/alerts"),
  alertsSeen: (id?: number) => req<{ unseen: number }>("/api/alerts/seen", { method: "POST", body: JSON.stringify({ id }) }),
  watchNow: () => req<{ started: boolean }>("/api/watch", { method: "POST", body: "{}" }),
  packs: () => req<Pack[]>("/api/packs"),
  captures: () => req<Capture[]>("/api/captures"),
  saveCapture: async (blob: Blob, name: string) => {
    const r = await fetch(`/api/captures?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": "video/webm" }, body: blob });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as { error?: string }).error ?? `Erreur ${r.status}`);
    return body as Capture;
  },
  deleteCapture: (id: string) => req<{ ok: boolean }>(`/api/captures/${id}`, { method: "DELETE" }),
  montageSources: () => req<MontageSources>("/api/montage/sources"),
  montages: () => req<MontageJob[]>("/api/montage"),
  montage: (id: string) => req<MontageJob>(`/api/montage/${id}`),
  startMontage: (body: { name?: string; clips: Clip[]; width: number; height: number; fit: "cover" | "contain"; fps?: number; music?: string | null; musicVolume?: number; fadeS?: number }) =>
    req<MontageJob>("/api/montage", { method: "POST", body: JSON.stringify(body) }),
  loadPack: (name: string) => req<{ accounts: number; videos: number; errors: string[] }>(`/api/packs/${name}`, { method: "POST", body: "{}" }),
};

// ---- Formats -----------------------------------------------------------------

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "…";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(".", ",") + " M";
  if (abs >= 1_000) return (n / 1_000).toFixed(abs >= 100_000 ? 0 : 1).replace(".", ",") + " k";
  return String(Math.round(n));
}

export function fmtDuration(s: number | null): string {
  if (!s && s !== 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function timeAgo(ts: number | null, now = Date.now() / 1000): string {
  if (!ts) return "date inconnue";
  const d = Math.max(0, now - ts);
  if (d < 3600) return `il y a ${Math.max(1, Math.round(d / 60))} min`;
  if (d < 86400) return `il y a ${Math.round(d / 3600)} h`;
  return `il y a ${Math.round(d / 86400)} j`;
}

export function fmtClock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
