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
  update: { available: boolean; phase: string; changes: string[]; current: string; checkedAt: number | null };
  lanUrls: string[];
  appPort: number;
  devPort: number | null;
  settings: Settings;
  run: {
    running: boolean;
    startedAt: number | null;
    step: string;
    log: string[];
    watch: { running: boolean; lastAt: number | null; nextAt: number | null; lastCount: number; lastAlerts: number };
  };
  providers: { discovery: string; images: string; voice: string; anthropic: boolean; telegram: boolean; auth: boolean; postiz: boolean; autoExit: boolean; updatable: boolean };
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
export type ClipEffect =
  | "zoom-in" | "zoom-out" | "bw" | "warm" | "cold" | "vignette" | "mirror" | "sharpen" | "punch" | "fade-in" | "fade-out" | "blur-bg"
  | "sepia" | "vintage" | "cinematic" | "glow" | "blur" | "pixelate" | "invert" | "shake" | "letterbox" | "flash" | "dream" | "contrast-hard";
export type Clip = { source: ClipSource; inS: number; outS: number; mute?: boolean; volume?: number; speed?: number; effects?: ClipEffect[]; smartCrop?: boolean };
export type Word = { text: string; start: number; end: number };
export type Cue = { id: string; start: number; end: number; text: string; words: Word[] };
export type SubtitleStyle = {
  mode: "karaoke" | "block";
  position: "bottom" | "center" | "top";
  size: number;
  font: string;
  color: string;
  highlight: string;
  outline: string;
  box: boolean;
  uppercase: boolean;
  maxWords: number;
  animation: "none" | "pop" | "box" | "bounce";
  emojis: boolean;
  y?: number;
};
export type TextItem = { id: string; text: string; start: number; end: number; x: number; y: number; size: number; color: string; font: string; animation: "none" | "pop" | "fade" };
export type MusicTrack = { file: string; name: string; durationS: number | null; url: string; bpm: number | null };
export type MusicOptions = { file: string; volume?: number; startS?: number; fadeInS?: number; fadeOutS?: number; duck?: boolean };
export type MontageRequest = {
  name?: string;
  clips: Clip[];
  width: number;
  height: number;
  fit: "cover" | "contain";
  fps?: number;
  music?: MusicOptions | null;
  fadeS?: number;
  transition?: { type: string; durationS: number } | null;
  subtitles?: { cues: Cue[]; style: Partial<SubtitleStyle> } | null;
  texts?: TextItem[];
  cover?: { atS: number; title: string } | null;
};
export type MontageSources = {
  videos: { id: string; name: string; handle: string; durationS: number | null; cover: string | null; url: string; views: number; postedAt: number | null; favorite: boolean; followed: boolean }[];
  captures: { id: string; name: string; durationS: number; url: string }[];
  renders: { id: string; name: string; url: string }[];
};
export type MontageJob = { id: string; name: string; status: "running" | "done" | "error"; progress: number; url: string | null; error: string | null; createdAt: number; durationS: number; coverUrl?: string | null };
export type Project = { id: string; name: string; updatedAt: number; state?: unknown };
export type Idea = {
  title: string;
  hook: string;
  format: string;
  durationS: number;
  script: string[];
  why: string;
  hashtags: string[];
  difficulty: "facile" | "moyen" | "costaud";
  sources: { id: number; handle: string; url: string; cover: string | null; views: number }[];
};
export type IdeasResult = { at: number; days: number; count: number; theme: string; ideas: Idea[]; sourcesCount: number };

export type Trends = {
  days: number;
  virals: number;
  topTags: { tag: string; n: number; views: number }[];
  topAccounts: { handle: string; n: number; views: number }[];
  medianDurationS: number | null;
  durationBuckets: Record<string, number>;
  hours: number[];
  alerts: number;
};

export type PublishSource = { kind: "montage" | "render" | "capture"; id: string };
export type Texts = {
  tiktok: { caption: string; hashtags: string[] };
  instagram: { caption: string; hashtags: string[] };
  youtube: { title: string; description: string; tags: string[] };
  x: { text: string };
  facebook: { text: string };
  threads: { text: string };
  snapchat: { caption: string };
};
export type Publication = {
  key: string;
  source: PublishSource;
  file: string;
  url: string;
  createdAt: number;
  updatedAt: number;
  language: string;
  hint: string;
  context: string;
  texts: Texts | null;
  sent: { at: number; channel: string; provider: string; status: "ok" | "error"; detail: string; postId?: string; scheduledFor?: string }[];
};
export type Channel = { id: string; name: string; identifier: string; picture?: string; disabled?: boolean };

export type Pack = { name: string; title: string; description: string; accounts: number; hashtags: string[]; keywords?: string[]; videos: number };

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
  if (r.status === 401) {
    location.href = "/login";
    throw new Error("Connexion requise");
  }
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
  bulkAccounts: (action: "delete" | "keep" | "unfollow", ids: number[]) => req<{ ok: boolean; changes: number }>("/api/accounts/bulk", { method: "POST", body: JSON.stringify({ action, ids }) }),
  ideas: () => req<{ running: boolean; result: IdeasResult | null }>("/api/ideas"),
  generateIdeas: (opts: { days: number; count: number; theme: string }) => req<IdeasResult>("/api/ideas", { method: "POST", body: JSON.stringify(opts) }),
  settings: () => req<Settings>("/api/settings"),
  saveSettings: (s: Partial<Settings>) => req<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
  demo: (remove: boolean) => req<{ added?: number; removed?: number }>("/api/demo", { method: "POST", body: JSON.stringify({ remove }) }),
  recreate: (videoId: number, options: JobOptions) => req<Job>("/api/recreate", { method: "POST", body: JSON.stringify({ videoId, options }) }),
  jobs: () => req<Job[]>("/api/jobs"),
  job: (id: number) => req<Job>(`/api/jobs/${id}`),
  retryJob: (id: number, options: JobOptions) => req<Job>(`/api/jobs/${id}/retry`, { method: "POST", body: JSON.stringify(options) }),
  deleteJob: (id: number) => req<{ ok: boolean }>(`/api/jobs/${id}`, { method: "DELETE" }),
  music: () => req<MusicTrack[]>("/api/music"),
  uploadMusic: async (blob: Blob, name: string) => {
    const r = await fetch(`/api/music?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as { error?: string }).error ?? `Erreur ${r.status}`);
    return body as { file: string };
  },
  deleteMusic: (file: string) => req<{ ok: boolean }>(`/api/music/${encodeURIComponent(file)}`, { method: "DELETE" }),
  extractMusic: (source: ClipSource, name: string, inS?: number, outS?: number) => req<{ file: string }>("/api/music/extract", { method: "POST", body: JSON.stringify({ source, name, inS, outS }) }),
  transcribeMontage: (montage: MontageRequest, language?: string) => req<{ cues: Cue[]; provider: string; language?: string }>("/api/montage/transcribe", { method: "POST", body: JSON.stringify({ montage, language }) }),
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
  /** Envoi avec progression, puis conversion suivie par captureJob(). */
  uploadCaptureAsync: (blob: Blob, name: string, durationS: number, onProgress: (p: number) => void) =>
    new Promise<{ jobId: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/captures?async=1&name=${encodeURIComponent(name)}&durationS=${durationS}`);
      xhr.setRequestHeader("Content-Type", blob.type || "video/webm");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        try {
          const j = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(j);
          else reject(new Error(j.error ?? `Erreur ${xhr.status}`));
        } catch {
          reject(new Error(`Erreur ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("Envoi interrompu"));
      xhr.send(blob);
    }),
  captureJob: (id: string) => req<{ id: string; status: "running" | "done" | "error"; progress: number; capture: Capture | null; error: string | null }>(`/api/captures/jobs/${id}`),
  publication: (source: PublishSource) => req<Publication>("/api/publish/get", { method: "POST", body: JSON.stringify({ source }) }),
  publishTexts: (source: PublishSource, o: { hint: string; extra: string; language: string }) => req<Publication>("/api/publish/texts", { method: "POST", body: JSON.stringify({ source, ...o }) }),
  savePublication: (key: string, texts: Texts) => req<Publication>(`/api/publish/${key}`, { method: "PUT", body: JSON.stringify({ texts }) }),
  publishChannels: () => req<{ enabled: boolean; channels: Channel[]; error?: string }>("/api/publish/channels"),
  publishSend: (key: string, channels: string[], when: string | null) => req<Publication["sent"]>(`/api/publish/${key}/send`, { method: "POST", body: JSON.stringify({ channels, when }) }),
  montageSources: () => req<MontageSources>("/api/montage/sources"),
  silences: (source: ClipSource, inS: number, outS: number, thresholdDb = -32, minSilenceS = 0.45) =>
    req<{ segments: { start: number; end: number }[] }>("/api/montage/silences", { method: "POST", body: JSON.stringify({ source, inS, outS, thresholdDb, minSilenceS }) }),
  translateCues: (cues: Cue[], to: string) => req<{ cues: Cue[] }>("/api/montage/translate-cues", { method: "POST", body: JSON.stringify({ cues, to }) }),
  thumbsUrl: (s: ClipSource) => `/api/media/thumbs/${s.kind}/${s.id}`,
  waveUrl: (s: ClipSource) => `/api/media/wave/${s.kind}/${s.id}`,
  projects: () => req<Project[]>("/api/projects"),
  project: (id: string) => req<Project>(`/api/projects/${id}`),
  saveProject: (p: { id?: string; name: string; state: unknown }) => req<Project>("/api/projects", { method: "POST", body: JSON.stringify(p) }),
  deleteProject: (id: string) => req<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  trends: (days = 7) => req<Trends>(`/api/trends?days=${days}`),
  reminders: () => req<{ id: number; due_at: number; message: string }[]>("/api/reminders"),
  publications: () => req<Publication[]>("/api/publish"),
  publishAnalytics: (key: string) => req<{ channel: string; provider: string; postId: string; metrics: unknown; error?: string }[]>(`/api/publish/${key}/analytics`),
  updateCheck: () => req<{ available: boolean; phase: string; changes: string[]; current: string; remote: string; error: string | null; log: string[] }>("/api/update?check=1"),
  updateState: () => req<{ available: boolean; phase: string; changes: string[]; error: string | null; log: string[] }>("/api/update"),
  updateApply: () => req<{ started: boolean }>("/api/update/apply", { method: "POST", body: "{}" }),
  dubJob: (id: number, to: string) => req<Job>(`/api/jobs/${id}/dub`, { method: "POST", body: JSON.stringify({ to }) }),
  montages: () => req<MontageJob[]>("/api/montage"),
  montage: (id: string) => req<MontageJob>(`/api/montage/${id}`),
  startMontage: (body: MontageRequest) => req<MontageJob>("/api/montage", { method: "POST", body: JSON.stringify(body) }),
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
