// API Niche + fichiers statiques (interface compilée, miniatures, rendus).
import "./env.js";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { z } from "zod";
import { db, getSettings, now, saveSettings, upsertAccount, type AccountRow, type SnapshotRow, type VideoRow } from "./db.js";
import { listCards, stats, toCard, type ListQuery } from "./metrics.js";
import { discoveryMode, importUrls, runCollection, runState, scheduleRefresh } from "./collector.js";
import { fetchTikTokProfile } from "./providers/tiktok-page.js";
import { removeDemo, seedDemo } from "./providers/demo.js";
import { createJob, deleteJob, getJob, listJobs, retryJob } from "./recreate/index.js";
import { imageProvider } from "./recreate/images.js";
import { voiceProvider } from "./recreate/voice.js";
import { COVERS_DIR, PUBLIC_DIR, RENDERS_DIR, ROOT } from "./paths.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const asyncRoute =
  (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response) =>
    fn(req, res).catch((e: Error) => {
      console.error("[niche]", e);
      res.status(500).json({ error: e.message });
    });

// ---- Tableau de bord ---------------------------------------------------------

app.get("/api/stats", (_req, res) => {
  res.json({
    ...stats(),
    run: runState,
    providers: {
      discovery: discoveryMode(),
      images: imageProvider(),
      voice: voiceProvider(),
      anthropic: !!process.env.ANTHROPIC_API_KEY,
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

// ---- Réglages ----------------------------------------------------------------

app.get("/api/settings", (_req, res) => res.json(getSettings()));

const SettingsSchema = z.object({
  hashtags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  viralMinViews: z.number().min(0).optional(),
  viralMinViewsPerHour: z.number().min(0).optional(),
  viralOutlierFactor: z.number().min(1).optional(),
  refreshMinutes: z.number().min(0).optional(),
  videosPerSource: z.number().min(1).max(200).optional(),
  language: z.string().optional(),
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

app.get("/api/music", (_req, res) => {
  const dir = path.join(PUBLIC_DIR, "music");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(f)) : [];
  res.json(files);
});

// ---- Fichiers ----------------------------------------------------------------

app.use("/covers", express.static(COVERS_DIR, { maxAge: "7d" }));
app.use("/renders", express.static(RENDERS_DIR, { acceptRanges: true }));
app.use("/public", express.static(PUBLIC_DIR));

const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`[niche] API sur http://localhost:${port}`);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM videos").get() as { n: number }).n;
  if (count === 0 && process.env.NICHE_NO_DEMO !== "1") {
    console.log(`[niche] base vide : ${seedDemo()} vidéos de démonstration ajoutées`);
  }
  scheduleRefresh();
});
