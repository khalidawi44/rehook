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
  run: { running: boolean; startedAt: number | null; step: string; log: string[] };
  providers: { discovery: string; images: string; voice: string; anthropic: boolean };
};

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
  refreshMinutes: number;
  videosPerSource: number;
  language: string;
};

export type Scene = { narration: string; onScreen: string; visual: string; keywords: string[]; seconds: number };
export type Brief = {
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
