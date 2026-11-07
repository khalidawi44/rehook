// API Niche + fichiers statiques (interface compilée, miniatures, rendus).
import "./env.js";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { z } from "zod";
import { db, getSettings, now, saveSettings, upsertAccount, type AccountRow, type SnapshotRow, type VideoRow } from "./db.js";
import { feedCards, feedCategories, listCards, stats, toCard, type ListQuery } from "./metrics.js";
import { discoveryMode, importUrls, log, runCollection, runState, runWatch, scheduleRefresh } from "./collector.js";
import { listAlerts, markSeen, unseenCount } from "./alerts.js";
import { listPacks, loadPack } from "./packs/index.js";
import { deleteCapture, getConvertJob, listCaptures, saveCapture, startCaptureConversion } from "./captures.js";
import { ensureSourceFile } from "./recreate/analyze.js";
import { CLIP_EFFECTS, deleteMusic, deleteSticker, getMontage, listMontages, listMusic, listStickers, montageSources, saveMusic, saveSticker, startMontage, transcribeMontage, type ClipEffect, type MontageRequest } from "./montage.js";
import { ensureSourceFile as ensureSource } from "./recreate/analyze.js";
import { FFMPEG } from "./media.js";
import { execFile as execFileCb } from "node:child_process";
import { promisify as promisifyFn } from "node:util";
import { CAPTURES_DIR, listCaptures as listCapturesForExtract } from "./captures.js";
import { RENDERS_DIR as RENDERS } from "./paths.js";
import { fetchTikTokProfile } from "./providers/tiktok-page.js";
import { removeDemo, seedDemo } from "./providers/demo.js";
import { createJob, deleteJob, dubJob, getJob, listJobs, retryJob } from "./recreate/index.js";
import { deleteProject, getProject, listProjects, saveProject } from "./projects.js";
import { speechSegments, thumbStrip, waveImage } from "./tools/media-analysis.js";
import { translateCues } from "./translate.js";
import { trends } from "./trends.js";
import { generateIdeas, lastIdeas } from "./ideas.js";
import { listReminders } from "./reminders.js";
import { postizAnalytics } from "./publish.js";
import { imageProvider } from "./recreate/images.js";
import { voiceProvider } from "./recreate/voice.js";
import { COVERS_DIR, PUBLIC_DIR, RENDERS_DIR, ROOT } from "./paths.js";
import { authEnabled, installAuth } from "./auth.js";
import { autoExitEnabled, installLifecycle } from "./lifecycle.js";
import { applyUpdate, checkUpdate, scheduleUpdateChecks, updatable, updateState } from "./update.js";
import { generateTexts, getPublication, listPublications, postizChannels, postizEnabled, postizPublish, resolvePublishSource, savePublication, TextsSchema, type Publication, type PublishSource } from "./publish.js";

const app = express();
if (process.env.NICHE_BEHIND_PROXY === "1") app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
installAuth(app);
app.use(express.json({ limit: "1mb" }));
installLifecycle(app);

const asyncRoute =
  (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response) =>
    fn(req, res).catch((e: Error) => {
      console.error("[niche]", e);
      res.status(500).json({ error: e.message });
    });

// ---- Tableau de bord ---------------------------------------------------------

function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) out.push(`http://${i.address}:${port}`);
    }
  }
  return out;
}

app.get("/api/stats", (req, res) => {
  const port = Number(process.env.PORT ?? 3001);
  res.json({
    ...stats(),
    lanUrls: lanUrls(port),
    appPort: port,
    devPort: req.get("host")?.includes(":5173") ? 5173 : null,
    unseenAlerts: unseenCount(),
    update: { available: updateState.available, phase: updateState.phase, changes: updateState.changes, current: updateState.current.slice(0, 7), checkedAt: updateState.checkedAt },
    settings: getSettings(),
    run: runState,
    providers: {
      discovery: discoveryMode(),
      images: imageProvider(),
      voice: voiceProvider(),
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      telegram: !!(process.env.NICHE_TELEGRAM_BOT_TOKEN && process.env.NICHE_TELEGRAM_CHAT_ID),
      auth: authEnabled(),
      postiz: !!process.env.POSTIZ_API_KEY,
      autoExit: autoExitEnabled(),
      updatable: updatable(),
    },
  });
});

const ListSchema = z.object({
  view: z.enum(["viral", "all", "favorites"]).default("viral"),
  period: z.enum(["24h", "3d", "7d", "all"]).default("24h"),
  duration: z.enum(["all", "short", "medium", "long", "xlong"]).default("all"),
  sort: z.enum(["views", "vph", "growth", "engagement", "recent", "score"]).default("views"),
  unfollowed: z.enum(["0", "1"]).default("0"),
  q: z.string().default(""),
  accountId: z.coerce.number().optional(),
});

app.get("/api/videos", (req, res) => {
  const parsed = ListSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Filtres invalides" });
  const q: ListQuery = { ...parsed.data, unfollowed: parsed.data.unfollowed === "1" };
  res.json(listCards(q));
});

app.get("/api/videos/:id", (req, res) => {
  const video = db.prepare("SELECT * FROM videos WHERE id = ?").get(Number(req.params.id)) as VideoRow | undefined;
  if (!video) return res.status(404).json({ error: "Vidéo introuvable" });
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(video.account_id) as AccountRow;
  const snaps = db.prepare("SELECT * FROM snapshots WHERE video_id = ? ORDER BY captured_at DESC LIMIT 50").all(video.id) as SnapshotRow[];
  res.json({ ...toCard(video, account, snaps), snapshots: snaps.reverse() });
});

// Lecteur intégré : le fichier mp4 d'origine (sans les sous-titres du lecteur TikTok).
app.get(
  "/api/videos/:id/media",
  asyncRoute(async (req, res) => {
    const video = db.prepare("SELECT * FROM videos WHERE id = ?").get(Number(req.params.id)) as VideoRow | undefined;
    if (!video) return void res.status(404).json({ error: "Vidéo introuvable" });
    const file = await ensureSourceFile(video, (l) => console.warn("[niche]", l));
    if (!file) return void res.status(404).json({ error: "Vidéo d'origine indisponible (démo, ou TikTok a refusé le fichier)" });
    res.sendFile(file, { acceptRanges: true, headers: { "Content-Type": "video/mp4", "Cache-Control": "private, max-age=3600" } });
  }),
);

// ---- Fil façon TikTok ---------------------------------------------------------
app.get("/api/feed", (req, res) => {
  const category = String(req.query.category ?? "");
  const limit = Math.min(60, Math.max(1, Number(req.query.limit ?? 24)));
  res.json({ cards: feedCards(category, limit), categories: feedCategories() });
});
app.post("/api/feed/seen", (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0) as number[];
  if (ids.length) db.prepare(`UPDATE videos SET seen_at = COALESCE(seen_at, ?) WHERE id IN (${ids.map(() => "?").join(",")})`).run(now(), ...ids);
  res.json({ ok: true, n: ids.length });
});
app.post("/api/feed/reset", (_req, res) => {
  const r = db.prepare("UPDATE videos SET seen_at = NULL").run();
  res.json({ ok: true, n: Number(r.changes) });
});

app.post("/api/videos/:id/favorite", (req, res) => {
  db.prepare("UPDATE videos SET favorite = CASE favorite WHEN 1 THEN 0 ELSE 1 END WHERE id = ?").run(Number(req.params.id));
  const v = db.prepare("SELECT favorite FROM videos WHERE id = ?").get(Number(req.params.id)) as { favorite: number } | undefined;
  res.json({ favorite: !!v?.favorite });
});

app.delete("/api/videos/:id", (req, res) => {
  db.prepare("DELETE FROM videos WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

app.post(
  "/api/import",
  asyncRoute(async (req, res) => {
    const urls = z.array(z.string()).parse(req.body?.urls ?? []);
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const all = [...urls, ...text.split(/\s+/)].map((u) => u.trim()).filter((u) => /tiktok\.com/.test(u));
    if (!all.length) return void res.status(400).json({ error: "Aucune URL TikTok" });
    res.json(await importUrls(all));
  }),
);

app.post(
  "/api/refresh",
  asyncRoute(async (req, res) => {
    if (runState.running) return void res.json({ started: false, message: "Relevé déjà en cours" });
    runCollection({ discover: req.body?.discover ?? true, refresh: req.body?.refresh ?? true }).catch(() => {});
    res.json({ started: true });
  }),
);

// ---- Comptes -----------------------------------------------------------------

app.get("/api/accounts", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, COUNT(v.id) AS videos,
              (SELECT MAX(s.views) FROM snapshots s JOIN videos v2 ON v2.id = s.video_id WHERE v2.account_id = a.id) AS max_views,
              (SELECT AVG(m.views) FROM (SELECT MAX(s.views) AS views FROM videos v3 JOIN snapshots s ON s.video_id = v3.id WHERE v3.account_id = a.id GROUP BY v3.id) m) AS avg_views
       FROM accounts a LEFT JOIN videos v ON v.account_id = a.id
       GROUP BY a.id ORDER BY a.followed DESC, videos DESC`,
    )
    .all();
  res.json(rows);
});

app.post(
  "/api/accounts",
  asyncRoute(async (req, res) => {
    const handle = String(req.body?.handle ?? "").replace(/^@/, "").trim();
    if (!handle) return void res.status(400).json({ error: "Pseudo manquant" });
    let info: Parameters<typeof upsertAccount>[0] = { handle };
    try {
      info = await fetchTikTokProfile(handle);
    } catch (e) {
      console.warn("[niche] profil :", (e as Error).message);
    }
    const acc = upsertAccount(info);
    db.prepare("UPDATE accounts SET followed = 1 WHERE id = ?").run(acc.id);
    res.json({ ...acc, followed: 1 });
  }),
);

app.patch("/api/accounts/:id", (req, res) => {
  const followed = req.body?.followed ? 1 : 0;
  db.prepare("UPDATE accounts SET followed = ?, updated_at = ? WHERE id = ?").run(followed, now(), Number(req.params.id));
  res.json({ ok: true });
});

app.delete("/api/accounts/:id", (req, res) => {
  db.prepare("DELETE FROM accounts WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

// Actions de masse : supprimer la sélection, ne garder que la sélection, ou se désabonner de la sélection.
app.post("/api/accounts/bulk", (req, res) => {
  const action = String(req.body?.action ?? "");
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0) as number[];
  if (!["delete", "keep", "unfollow"].includes(action)) return void res.status(400).json({ error: "Action inconnue" });
  if (!ids.length) return void res.status(400).json({ error: "Aucun compte sélectionné" });
  const marks = ids.map(() => "?").join(",");
  let changes = 0;
  if (action === "delete") changes = Number(db.prepare(`DELETE FROM accounts WHERE id IN (${marks})`).run(...ids).changes);
  else if (action === "keep") changes = Number(db.prepare(`DELETE FROM accounts WHERE id NOT IN (${marks})`).run(...ids).changes);
  else changes = Number(db.prepare(`UPDATE accounts SET followed = 0, updated_at = ? WHERE id IN (${marks})`).run(now(), ...ids).changes);
  res.json({ ok: true, changes });
});

// ---- Réglages ----------------------------------------------------------------

app.get("/api/settings", (_req, res) => res.json(getSettings()));

const SettingsSchema = z.object({
  hashtags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  viralMinViews: z.number().min(0).optional(),
  viralMinViewsPerHour: z.number().min(0).optional(),
  viralOutlierFactor: z.number().min(1).optional(),
  discoveryMinutes: z.number().min(0).optional(),
  watchMinutes: z.number().min(0).optional(),
  watchHours: z.number().min(1).max(720).optional(),
  alertMinViews: z.number().min(0).optional(),
  alertMinViewsPerHour: z.number().min(0).optional(),
  videosPerSource: z.number().min(1).max(200).optional(),
  language: z.string().optional(),
  feedEnabled: z.boolean().optional(),
});

app.put("/api/settings", (req, res) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Réglages invalides" });
  const clean = { ...parsed.data };
  if (clean.hashtags) clean.hashtags = clean.hashtags.map((h) => h.replace(/^#/, "").trim().toLowerCase()).filter(Boolean);
  if (clean.keywords) clean.keywords = clean.keywords.map((k) => k.trim()).filter(Boolean);
  const next = saveSettings(clean);
  scheduleRefresh();
  res.json(next);
});

// ---- Veille et alertes -------------------------------------------------------

app.get("/api/alerts", (_req, res) => res.json(listAlerts()));
app.post("/api/alerts/seen", (req, res) => {
  markSeen(req.body?.id ? Number(req.body.id) : undefined);
  res.json({ unseen: unseenCount() });
});
app.post(
  "/api/watch",
  asyncRoute(async (_req, res) => {
    if (runState.watch.running || runState.running) return void res.json({ started: false });
    runWatch().catch(() => {});
    res.json({ started: true });
  }),
);

// ---- Packs de démarrage ------------------------------------------------------

app.get("/api/packs", (_req, res) => res.json(listPacks().map(({ name, title, description, accounts, hashtags, videos }) => ({ name, title, description, accounts: accounts.length, hashtags, videos: videos.length }))));
app.post(
  "/api/packs/:name",
  asyncRoute(async (req, res) => {
    const r = await loadPack(String(req.params.name), log);
    scheduleRefresh();
    runCollection({ discover: true, refresh: false }).catch(() => {});
    res.json(r);
  }),
);

app.post("/api/demo", (req, res) => {
  if (req.body?.remove) return res.json({ removed: removeDemo() });
  res.json({ added: seedDemo() });
});

// ---- Recréations -------------------------------------------------------------

const JobOptionsSchema = z.object({
  twist: z.string().max(2000).optional(),
  language: z.string().optional(),
  targetSeconds: z.number().min(10).max(180).optional(),
  sceneCount: z.number().min(3).max(12).optional(),
  images: z.string().optional(),
  voice: z.string().optional(),
  music: z.string().nullable().optional(),
  captionStyle: z.enum(["karaoke", "block"]).optional(),
  handle: z.string().max(60).optional(),
  reuseBrief: z.boolean().optional(),
  backgroundCapture: z.string().nullable().optional(),
  translateTo: z.string().max(5).nullable().optional(),
});

app.post("/api/recreate", (req, res) => {
  const videoId = Number(req.body?.videoId);
  if (!videoId) return res.status(400).json({ error: "videoId manquant" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: "ANTHROPIC_API_KEY manquante dans .env : impossible d'écrire le script" });
  const parsed = JobOptionsSchema.safeParse(req.body?.options ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Options invalides" });
  res.json(createJob(videoId, parsed.data));
});

app.get("/api/jobs", (_req, res) => res.json(listJobs()));
app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(Number(req.params.id));
  if (!job) return res.status(404).json({ error: "Tâche introuvable" });
  res.json(job);
});
app.post("/api/jobs/:id/retry", (req, res) => {
  const parsed = JobOptionsSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Options invalides" });
  const job = retryJob(Number(req.params.id), parsed.data);
  if (!job) return res.status(404).json({ error: "Tâche introuvable" });
  res.json(job);
});
app.delete("/api/jobs/:id", (req, res) => res.json({ ok: deleteJob(Number(req.params.id)) }));
app.post("/api/jobs/:id/dub", (req, res) => {
  const to = String(req.body?.to ?? "").slice(0, 5);
  if (!to) return res.status(400).json({ error: "Langue manquante" });
  const job = dubJob(Number(req.params.id), to);
  if (!job) return res.status(404).json({ error: "Tâche introuvable ou sans script" });
  res.json(job);
});

// ---- Enregistrements d'écran -------------------------------------------------

app.get("/api/captures", (_req, res) => res.json(listCaptures()));
app.post(
  "/api/captures",
  express.raw({ type: ["video/*", "application/octet-stream"], limit: "2gb" }),
  asyncRoute(async (req, res) => {
    const body = req.body as Buffer;
    if (!body?.length) return void res.status(400).json({ error: "Fichier vide" });
    if (req.query.async === "1") {
      const job = startCaptureConversion(body, String(req.query.name ?? ""), Number(req.query.durationS ?? 0));
      return void res.json({ jobId: job.id });
    }
    res.json(await saveCapture(body, String(req.query.name ?? "")));
  }),
);
app.get("/api/captures/jobs/:id", (req, res) => {
  const j = getConvertJob(String(req.params.id));
  if (!j) return res.status(404).json({ error: "Conversion introuvable" });
  res.json(j);
});
app.delete("/api/captures/:id", (req, res) => res.json({ ok: deleteCapture(String(req.params.id)) }));

// ---- Montage -----------------------------------------------------------------

app.get("/api/montage/sources", asyncRoute(async (_req, res) => void res.json(await montageSources())));
app.get("/api/montage", (_req, res) => res.json(listMontages()));
app.get("/api/montage/:id", (req, res) => {
  const j = getMontage(String(req.params.id));
  if (!j) return res.status(404).json({ error: "Export introuvable" });
  res.json(j);
});
const ClipSourceSchema = z.object({ kind: z.enum(["video", "capture", "render"]), id: z.string() });
const ClipSchema = z.object({
  source: ClipSourceSchema,
  inS: z.number().min(0),
  outS: z.number().min(0),
  mute: z.boolean().optional(),
  volume: z.number().min(0).max(4).optional(),
  speed: z.number().min(0.25).max(4).optional(),
  effects: z.array(z.enum(CLIP_EFFECTS as [ClipEffect, ...ClipEffect[]])).optional(),
  smartCrop: z.boolean().optional(),
  reverse: z.boolean().optional(),
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  flipH: z.boolean().optional(),
  flipV: z.boolean().optional(),
  adjust: z
    .object({
      brightness: z.number().min(-1).max(1).optional(),
      contrast: z.number().min(0).max(3).optional(),
      saturation: z.number().min(0).max(3).optional(),
      gamma: z.number().min(0.1).max(10).optional(),
      temperature: z.number().min(-1).max(1).optional(),
      hue: z.number().min(-180).max(180).optional(),
      sharpen: z.number().min(-2).max(3).optional(),
      opacity: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  zoom: z.object({ start: z.number().min(1).max(4), end: z.number().min(1).max(4), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).nullable().optional(),
  freeze: z.object({ at: z.enum(["start", "end"]), durationS: z.number().min(0).max(10) }).nullable().optional(),
  audio: z
    .object({
      fadeInS: z.number().min(0).max(10).optional(),
      fadeOutS: z.number().min(0).max(10).optional(),
      denoise: z.boolean().optional(),
      pitch: z.number().min(-12).max(12).optional(),
      boost: z.boolean().optional(),
      bass: z.number().min(-20).max(20).optional(),
      treble: z.number().min(-20).max(20).optional(),
      echo: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  chroma: z.object({ color: z.string().max(9), similarity: z.number().min(0.01).max(1), blend: z.number().min(0).max(1), bgColor: z.string().max(9).optional(), background: ClipSourceSchema.nullable().optional() }).nullable().optional(),
  mask: z.enum(["none", "circle", "rounded", "heart", "star", "diamond"]).optional(),
});
const OverlaySchema = z.object({
  id: z.string().max(40),
  kind: z.enum(["image", "video"]),
  file: z.string().max(200).optional(),
  source: ClipSourceSchema.optional(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.02).max(1),
  start: z.number().min(0),
  end: z.number().min(0),
  opacity: z.number().min(0).max(1).optional(),
  rotate: z.number().min(-360).max(360).optional(),
  mute: z.boolean().optional(),
  shape: z.enum(["rect", "circle", "rounded"]).optional(),
});
const WordSchema = z.object({ text: z.string(), start: z.number(), end: z.number() });
const CueSchema = z.object({ id: z.string(), start: z.number(), end: z.number(), text: z.string().max(500), words: z.array(WordSchema) });
const StyleSchema = z.object({
  mode: z.enum(["karaoke", "block"]).optional(),
  position: z.enum(["bottom", "center", "top"]).optional(),
  size: z.number().min(20).max(300).optional(),
  font: z.string().max(60).optional(),
  color: z.string().max(9).optional(),
  highlight: z.string().max(9).optional(),
  outline: z.string().max(9).optional(),
  box: z.boolean().optional(),
  uppercase: z.boolean().optional(),
  maxWords: z.number().min(1).max(12).optional(),
  animation: z.enum(["none", "pop", "box", "bounce"]).optional(),
  emojis: z.boolean().optional(),
  y: z.number().min(0).max(1).optional(),
});
const TextSchema = z.object({
  id: z.string(),
  text: z.string().max(300),
  start: z.number().min(0),
  end: z.number().min(0),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  size: z.number().min(10).max(400),
  color: z.string().max(9),
  font: z.string().max(60),
  animation: z.enum(["none", "pop", "fade"]),
});
const MontageSchema = z.object({
  name: z.string().max(80).optional(),
  clips: z.array(ClipSchema).min(1).max(80),
  width: z.number().min(16).max(4096),
  height: z.number().min(16).max(4096),
  fit: z.enum(["cover", "contain"]).default("cover"),
  fps: z.number().min(10).max(60).optional(),
  music: z
    .object({ file: z.string(), volume: z.number().min(0).max(2).optional(), startS: z.number().min(0).optional(), fadeInS: z.number().min(0).max(10).optional(), fadeOutS: z.number().min(0).max(10).optional(), duck: z.boolean().optional() })
    .nullable()
    .optional(),
  fadeS: z.number().min(0).max(5).optional(),
  transition: z.object({ type: z.string().max(30), durationS: z.number().min(0).max(2) }).nullable().optional(),
  subtitles: z.object({ cues: z.array(CueSchema).max(2000), style: StyleSchema }).nullable().optional(),
  texts: z.array(TextSchema).max(200).optional(),
  cover: z.object({ atS: z.number().min(0), title: z.string().max(120) }).nullable().optional(),
  overlays: z.array(OverlaySchema).max(40).optional(),
  padColor: z.string().max(9).optional(),
});
function parseMontage(body: unknown): MontageRequest | string {
  const parsed = MontageSchema.safeParse(body);
  if (!parsed.success) return "Montage invalide : " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join(", ");
  if (parsed.data.clips.some((c) => c.outS <= c.inS)) return "Un clip a une fin avant son début";
  return parsed.data as MontageRequest;
}
app.post(
  "/api/montage",
  asyncRoute(async (req, res) => {
    const r = parseMontage(req.body);
    if (typeof r === "string") return void res.status(400).json({ error: r });
    res.json(await startMontage(r));
  }),
);
app.post(
  "/api/montage/transcribe",
  asyncRoute(async (req, res) => {
    const r = parseMontage(req.body?.montage);
    if (typeof r === "string") return void res.status(400).json({ error: r });
    res.json(await transcribeMontage(r, typeof req.body?.language === "string" ? req.body.language : undefined, (l) => console.log("[niche]", l)));
  }),
);

/** Fichier d'une source de montage (pour miniatures, onde, silences). */
async function sourceFile(kind: string, id: string): Promise<string | null> {
  if (kind === "video") {
    const v = db.prepare("SELECT * FROM videos WHERE id = ?").get(Number(id)) as VideoRow | undefined;
    return v ? ensureSource(v) : null;
  }
  if (kind === "capture") {
    const c = listCapturesForExtract().find((x) => x.id === id);
    return c ? path.join(CAPTURES_DIR, c.file) : null;
  }
  if (kind === "render") {
    const f = path.join(RENDERS, `niche-${Number(id)}.mp4`);
    return fs.existsSync(f) ? f : null;
  }
  return null;
}
app.get(
  "/api/media/thumbs/:kind/:id",
  asyncRoute(async (req, res) => {
    const f = await sourceFile(String(req.params.kind), String(req.params.id));
    if (!f) return void res.status(404).end();
    res.sendFile(await thumbStrip(f), { headers: { "Cache-Control": "private, max-age=86400" } });
  }),
);
app.get(
  "/api/media/wave/:kind/:id",
  asyncRoute(async (req, res) => {
    const f = await sourceFile(String(req.params.kind), String(req.params.id));
    const w = f ? await waveImage(f) : null;
    if (!w) return void res.status(404).end();
    res.sendFile(w, { headers: { "Cache-Control": "private, max-age=86400" } });
  }),
);
app.post(
  "/api/montage/silences",
  asyncRoute(async (req, res) => {
    const src = req.body?.source as { kind: string; id: string } | undefined;
    const f = src ? await sourceFile(src.kind, src.id) : null;
    if (!f) return void res.status(404).json({ error: "Source introuvable" });
    const inS = Number(req.body?.inS ?? 0);
    const outS = Number(req.body?.outS ?? 0);
    const thr = Number(req.body?.thresholdDb ?? -32);
    const min = Number(req.body?.minSilenceS ?? 0.45);
    res.json({ segments: await speechSegments(f, inS, outS > inS ? outS : inS + 1, thr, min) });
  }),
);
app.post(
  "/api/montage/translate-cues",
  asyncRoute(async (req, res) => {
    const cues = z.array(CueSchema).parse(req.body?.cues ?? []);
    const to = String(req.body?.to ?? "en").slice(0, 5);
    if (!process.env.ANTHROPIC_API_KEY) return void res.status(400).json({ error: "ANTHROPIC_API_KEY manquante" });
    res.json({ cues: await translateCues(cues, to, (l) => console.log("[niche]", l)) });
  }),
);

// ---- Projets de montage ------------------------------------------------------

app.get("/api/projects", (_req, res) => res.json(listProjects()));
app.get("/api/projects/:id", (req, res) => {
  const p = getProject(String(req.params.id));
  if (!p) return res.status(404).json({ error: "Projet introuvable" });
  res.json(p);
});
app.post("/api/projects", (req, res) => {
  const name = String(req.body?.name ?? "Sans titre").slice(0, 80);
  res.json(saveProject({ id: typeof req.body?.id === "string" ? req.body.id : undefined, name, state: req.body?.state ?? {} }));
});
app.delete("/api/projects/:id", (req, res) => res.json({ ok: deleteProject(String(req.params.id)) }));

// ---- Tendances et planning ---------------------------------------------------

app.get("/api/trends", (req, res) => res.json(trends(Number(req.query.days ?? 7))));

// ---- Idées de vidéos à tourner -----------------------------------------------
let ideasRunning = false;
app.get("/api/ideas", (_req, res) => res.json({ running: ideasRunning, result: lastIdeas() }));
app.post(
  "/api/ideas",
  asyncRoute(async (req, res) => {
    if (ideasRunning) return void res.status(409).json({ error: "Des idées sont déjà en cours de génération" });
    ideasRunning = true;
    try {
      const r = await generateIdeas({ days: Number(req.body?.days ?? 7), count: Number(req.body?.count ?? 8), theme: String(req.body?.theme ?? "") }, log);
      res.json(r);
    } finally {
      ideasRunning = false;
    }
  }),
);
app.get("/api/reminders", (_req, res) => res.json(listReminders()));
app.get(
  "/api/publish/:key/analytics",
  asyncRoute(async (req, res) => {
    const p = getPublication(String(req.params.key));
    if (!p) return void res.status(404).json({ error: "Publication introuvable" });
    if (!postizEnabled()) return void res.json([]);
    res.json(await postizAnalytics(p, Number(req.query.days ?? 7)));
  }),
);

// ---- Musique -----------------------------------------------------------------

app.get("/api/music", asyncRoute(async (_req, res) => void res.json(await listMusic())));
app.post(
  "/api/music",
  express.raw({ type: ["audio/*", "video/*", "application/octet-stream"], limit: "500mb" }),
  asyncRoute(async (req, res) => {
    const body = req.body as Buffer;
    if (!body?.length) return void res.status(400).json({ error: "Fichier vide" });
    res.json(await saveMusic(body, String(req.query.name ?? "")));
  }),
);
app.delete("/api/music/:file", (req, res) => res.json({ ok: deleteMusic(String(req.params.file)) }));

// ---- Stickers et images pour les calques du montage ------------------------
app.get("/api/stickers", (_req, res) => res.json(listStickers()));
app.post(
  "/api/stickers",
  express.raw({ type: ["image/*", "application/octet-stream"], limit: "30mb" }),
  (req, res) => {
    const body = req.body as Buffer;
    if (!body?.length) return void res.status(400).json({ error: "Fichier vide" });
    const name = String(req.query.name ?? "sticker.png");
    if (!/\.(png|jpe?g|webp|gif)$/i.test(name)) return void res.status(400).json({ error: "Image attendue (png, jpg, webp ou gif)" });
    res.json(saveSticker(body, name));
  },
);
app.delete("/api/stickers/:file", (req, res) => res.json({ ok: deleteSticker(String(req.params.file)) }));
/** Extrait la bande son d'un clip (vidéo relevée, enregistrement, rendu) vers la bibliothèque musique. */
app.post(
  "/api/music/extract",
  asyncRoute(async (req, res) => {
    const src = req.body?.source as { kind: string; id: string } | undefined;
    if (!src?.kind || !src?.id) return void res.status(400).json({ error: "Source manquante" });
    let file: string | null = null;
    if (src.kind === "video") {
      const v = db.prepare("SELECT * FROM videos WHERE id = ?").get(Number(src.id)) as VideoRow | undefined;
      file = v ? await ensureSource(v) : null;
    } else if (src.kind === "capture") {
      const c = listCapturesForExtract().find((x) => x.id === src.id);
      file = c ? path.join(CAPTURES_DIR, c.file) : null;
    } else if (src.kind === "render") {
      file = path.join(RENDERS, `niche-${Number(src.id)}.mp4`);
    }
    if (!file || !fs.existsSync(file)) return void res.status(404).json({ error: "Fichier source introuvable" });
    const inS = Number(req.body?.inS ?? 0);
    const outS = Number(req.body?.outS ?? 0);
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-vn"];
    if (inS > 0) args.push("-ss", String(inS));
    if (outS > inS) args.push("-to", String(outS));
    const tmp = path.join(RENDERS, `extract-${Date.now()}.mp3`);
    await promisifyFn(execFileCb)(FFMPEG, [...args, "-c:a", "libmp3lame", "-b:a", "192k", tmp]);
    try {
      res.json(await saveMusic(fs.readFileSync(tmp), String(req.body?.name ?? "son extrait")));
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }),
);

// ---- Publication -------------------------------------------------------------

const SourceSchema = z.object({ kind: z.enum(["montage", "render", "capture"]), id: z.string() });
const pubKey = (s: PublishSource) => `${s.kind}-${s.id}`;
function ensurePublication(src: PublishSource): Publication {
  const existing = getPublication(pubKey(src));
  const r = resolvePublishSource(src);
  const t = now();
  const p: Publication = existing ?? { key: pubKey(src), source: src, file: r.file, url: r.url, createdAt: t, updatedAt: t, language: "fr", hint: "", context: r.context, texts: null, sent: [] };
  p.file = r.file;
  p.url = r.url;
  if (!existing) savePublication(p);
  return p;
}
app.get("/api/publish", (_req, res) => res.json(listPublications()));
app.post("/api/publish/get", (req, res) => {
  const parsed = SourceSchema.safeParse(req.body?.source);
  if (!parsed.success) return res.status(400).json({ error: "Source invalide" });
  try {
    res.json(ensurePublication(parsed.data));
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});
app.post(
  "/api/publish/texts",
  asyncRoute(async (req, res) => {
    const parsed = SourceSchema.safeParse(req.body?.source);
    if (!parsed.success) return void res.status(400).json({ error: "Source invalide" });
    if (!process.env.ANTHROPIC_API_KEY) return void res.status(400).json({ error: "ANTHROPIC_API_KEY manquante : impossible de rédiger les textes" });
    const p = ensurePublication(parsed.data);
    p.hint = String(req.body?.hint ?? "").slice(0, 500);
    p.language = String(req.body?.language ?? "fr").slice(0, 5);
    p.texts = await generateTexts(p, String(req.body?.extra ?? "").slice(0, 1000), (l) => console.log("[niche]", l));
    p.updatedAt = now();
    savePublication(p);
    res.json(p);
  }),
);
app.put("/api/publish/:key", (req, res) => {
  const p = getPublication(String(req.params.key));
  if (!p) return res.status(404).json({ error: "Publication introuvable" });
  const parsed = TextsSchema.safeParse(req.body?.texts);
  if (!parsed.success) return res.status(400).json({ error: "Textes invalides" });
  p.texts = parsed.data;
  p.updatedAt = now();
  savePublication(p);
  res.json(p);
});
app.get(
  "/api/publish/channels",
  asyncRoute(async (_req, res) => {
    try {
      res.json({ enabled: postizEnabled(), channels: await postizChannels() });
    } catch (e) {
      res.json({ enabled: postizEnabled(), channels: [], error: (e as Error).message });
    }
  }),
);
app.post(
  "/api/publish/:key/send",
  asyncRoute(async (req, res) => {
    const p = getPublication(String(req.params.key));
    if (!p) return void res.status(404).json({ error: "Publication introuvable" });
    if (!postizEnabled()) return void res.status(400).json({ error: "POSTIZ_API_KEY manquante dans .env" });
    const ids = z.array(z.string()).parse(req.body?.channels ?? []);
    const all = await postizChannels();
    const chosen = all.filter((c) => ids.includes(c.id));
    if (!chosen.length) return void res.status(400).json({ error: "Aucun réseau choisi" });
    res.json(await postizPublish(p, chosen, typeof req.body?.when === "string" ? req.body.when : null, (l) => console.log("[niche]", l)));
  }),
);

// ---- Mise à jour depuis l'outil ----------------------------------------------

app.get("/api/update", asyncRoute(async (req, res) => void res.json(req.query.check ? await checkUpdate() : updateState)));
app.post(
  "/api/update/apply",
  asyncRoute(async (_req, res) => {
    res.json({ started: true });
    applyUpdate().catch(() => {});
  }),
);

// ---- Fichiers ----------------------------------------------------------------

app.use("/covers", express.static(COVERS_DIR, { maxAge: "7d" }));
app.use("/renders", express.static(RENDERS_DIR, { acceptRanges: true }));
app.use("/public", express.static(PUBLIC_DIR));

const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// Recentrage demandé le 06/11/2026 : ne garder que son propre compte, passer aux niches
// musique viking et femmes glamour. Exécuté une seule fois (marqué dans les réglages).
const RECENTRAGE = "recentrage-20261106";
async function recentrage() {
  const keep = (process.env.NICHE_MY_HANDLE ?? "galeriedesconneries").replace(/^@/, "").toLowerCase();
  const before = getSettings();
  const removed = Number(db.prepare("DELETE FROM accounts WHERE lower(handle) <> ?").run(keep).changes);
  // Marqué fait tout de suite : un plantage plus loin ne doit pas refaire la suppression.
  saveSettings({ hashtags: [], keywords: [], packLoaded: "", done: [...before.done, RECENTRAGE, NETTOYAGE] });
  log(`recentrage : ${removed} compte(s) supprimé(s) avec leurs vidéos, @${keep} conservé`);
  let info: Parameters<typeof upsertAccount>[0] = { handle: keep };
  try {
    info = await fetchTikTokProfile(keep);
  } catch (e) {
    log(`recentrage : profil @${keep} : ${(e as Error).message}`);
  }
  const acc = upsertAccount(info);
  db.prepare("UPDATE accounts SET followed = 1 WHERE id = ?").run(acc.id);
  for (const name of ["musique-viking", "sexy-femme"]) {
    const r = await loadPack(name, log);
    console.log(`[niche] pack ${name} : ${r.accounts} compte(s)`);
  }
  scheduleRefresh();
  await runCollection({ discover: true, refresh: false });
  await runWatch();
}

// Nettoyage du 07/11/2026 : les pages hashtag renvoyées vers l'accueil avaient fait entrer le flux
// « Pour toi » (humour) comme vidéos de hashtag. On retire les vidéos hors niche des comptes non suivis.
const NETTOYAGE = "nettoyage-20261107";
function nettoyage() {
  const s = getSettings();
  const tags = new Set(s.hashtags.map((h) => h.toLowerCase()));
  const rows = db
    .prepare("SELECT v.id, v.hashtags FROM videos v JOIN accounts a ON a.id = v.account_id WHERE a.followed = 0 AND v.favorite = 0 AND v.source IN ('hashtag', 'explore', 'keyword')")
    .all() as { id: number; hashtags: string }[];
  let removed = 0;
  for (const r of rows) {
    let hs: string[] = [];
    try {
      hs = JSON.parse(r.hashtags) as string[];
    } catch {
      hs = [];
    }
    if (!hs.some((h) => tags.has(h.toLowerCase()))) {
      db.prepare("DELETE FROM videos WHERE id = ?").run(r.id);
      removed++;
    }
  }
  const orphans = Number(db.prepare("DELETE FROM accounts WHERE followed = 0 AND id NOT IN (SELECT DISTINCT account_id FROM videos)").run().changes);
  saveSettings({ done: [...s.done, NETTOYAGE] });
  log(`nettoyage : ${removed} vidéo(s) hors niche retirée(s), ${orphans} compte(s) sans vidéo retiré(s)`);
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`[niche] API sur http://localhost:${port}`);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM videos").get() as { n: number }).n;
  const pack = process.env.NICHE_PACK ?? "musique-viking,sexy-femme";
  const settings = getSettings();
  scheduleRefresh();
  scheduleUpdateChecks();
  if (settings.done.includes(RECENTRAGE) && !settings.done.includes(NETTOYAGE)) {
    try {
      nettoyage();
    } catch (e) {
      console.error("[niche] nettoyage :", (e as Error).message);
    }
  }
  if (!settings.done.includes(RECENTRAGE)) {
    recentrage().catch((e) => console.error("[niche] recentrage :", (e as Error).message));
  } else if (pack && !settings.packLoaded) {
    console.log(`[niche] premier lancement : chargement du pack ${pack} (comptes, hashtags, vidéos)…`);
    (async () => {
      for (const name of pack.split(",").map((x) => x.trim()).filter(Boolean)) {
        const r = await loadPack(name, log);
        console.log(`[niche] pack ${name} : ${r.accounts} compte(s), ${r.videos} vidéo(s)`);
      }
      await runCollection({ discover: true, refresh: false });
      await runWatch();
    })().catch((e) => console.error("[niche] pack :", (e as Error).message));
  } else if (count === 0 && process.env.NICHE_NO_DEMO !== "1") {
    console.log(`[niche] base vide : ${seedDemo()} vidéos de démonstration ajoutées`);
  }
});
