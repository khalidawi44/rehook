// File d'attente des recréations : une tâche à la fois, étapes visibles dans l'UI.
import fs from "node:fs";
import path from "node:path";
import { db, now, type AccountRow, type JobRow, type SnapshotRow, type VideoRow } from "../db.js";
import { toCard } from "../metrics.js";
import { coverPath } from "../covers.js";
import { DATA_DIR, JOBS_PUBLIC_DIR, PUBLIC_DIR } from "../paths.js";
import { writeBrief, type Brief, type BriefOptions } from "./brief.js";
import { analyzeSource, type SourceAnalysis } from "./analyze.js";
import { imageProvider, makeImages } from "./images.js";
import { findStockClips } from "./stock.js";
import { capturePath } from "../captures.js";
import { translateBrief } from "../translate.js";
import { makeVoices, voiceProvider } from "./voice.js";
import { renderVideo } from "./render.js";
import type { NicheProps } from "../../video/types.js";

export type BriefAnalysis = { frames: string[]; transcript: string | null; transcriptSource: string | null; stickers: string[] };

export type JobOptions = BriefOptions & {
  images?: string;
  voice?: string;
  music?: string | null; // nom de fichier dans data/public/music
  captionStyle?: "karaoke" | "block";
  handle?: string; // signature affichée en fin de vidéo
  reuseBrief?: boolean; // regénérer seulement la vidéo à partir du brief existant
  backgroundCapture?: string | null; // id d'un enregistrement d'écran utilisé en fond des scènes sans clip
  translateTo?: string | null; // doublage : même script traduit, nouvelle voix et nouveau rendu
};

function update(id: number, patch: Partial<Pick<JobRow, "status" | "step" | "progress" | "brief" | "output_file" | "error">>, logLine?: string) {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = ?`);
    params.push(v as string | number | null);
  }
  if (logLine) {
    sets.push("log = log || ?");
    params.push(`${new Date().toISOString().slice(11, 19)} ${logLine}\n`);
    console.log(`[niche] tâche ${id} : ${logLine}`);
  }
  sets.push("updated_at = ?");
  params.push(now());
  params.push(id);
  db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function createJob(videoId: number, options: JobOptions): JobRow {
  const t = now();
  const r = db
    .prepare("INSERT INTO jobs(video_id, options, created_at, updated_at) VALUES(?, ?, ?, ?)")
    .run(videoId, JSON.stringify(options), t, t);
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(Number(r.lastInsertRowid)) as JobRow;
  kick();
  return job;
}

export function retryJob(jobId: number, options: JobOptions): JobRow | null {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as JobRow | undefined;
  if (!job) return null;
  const merged = { ...(JSON.parse(job.options) as JobOptions), ...options };
  db.prepare("UPDATE jobs SET status = 'queued', step = 'En attente', progress = 0, error = NULL, output_file = NULL, options = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(merged),
    now(),
    jobId,
  );
  if (!merged.reuseBrief) db.prepare("UPDATE jobs SET brief = NULL WHERE id = ?").run(jobId);
  kick();
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as JobRow;
}

/** Doublage : nouveau job qui reprend le brief d'un job terminé, traduit dans une autre langue. */
export function dubJob(jobId: number, to: string): JobRow | null {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as JobRow | undefined;
  if (!job?.brief) return null;
  const opts = { ...(JSON.parse(job.options) as JobOptions), reuseBrief: true, translateTo: to, language: to };
  const t = now();
  const r = db.prepare("INSERT INTO jobs(video_id, options, brief, created_at, updated_at) VALUES(?, ?, ?, ?, ?)").run(job.video_id, JSON.stringify(opts), job.brief, t, t);
  kick();
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(Number(r.lastInsertRowid)) as JobRow;
}

let working = false;

function kick() {
  if (working) return;
  const next = db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY id ASC LIMIT 1").get() as JobRow | undefined;
  if (!next) return;
  working = true;
  runJob(next)
    .catch((e) => update(next.id, { status: "error", error: (e as Error).message }, "erreur : " + (e as Error).message))
    .finally(() => {
      working = false;
      kick();
    });
}

// Au démarrage, les tâches interrompues repartent ; et toutes les 30 s on vérifie
// qu'aucune tâche en attente n'est oubliée.
const resumed = db.prepare("UPDATE jobs SET status = 'queued', step = 'En attente', progress = 0 WHERE status = 'running'").run();
if (Number(resumed.changes)) console.log(`[niche] ${resumed.changes} tâche(s) interrompue(s) remise(s) en file`);
setTimeout(kick, 1000);
setInterval(kick, 30_000);

async function runJob(job: JobRow) {
  const opts = JSON.parse(job.options) as JobOptions;
  const log = (l: string) => update(job.id, {}, l);
  const video = db.prepare("SELECT * FROM videos WHERE id = ?").get(job.video_id) as VideoRow | undefined;
  if (!video) throw new Error("Vidéo source introuvable");
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(video.account_id) as AccountRow;
  const snaps = db.prepare("SELECT * FROM snapshots WHERE video_id = ? ORDER BY captured_at DESC LIMIT 6").all(video.id) as SnapshotRow[];
  const card = toCard(video, account, snaps);

  update(job.id, { status: "running", step: "Analyse de la vidéo source", progress: 0.02 }, "démarrage");

  const jobDir = path.join(JOBS_PUBLIC_DIR, String(job.id));
  fs.rmSync(jobDir, { recursive: true, force: true });
  fs.mkdirSync(jobDir, { recursive: true });
  const relDir = `jobs/${job.id}`;

  let brief: Brief & { analysis?: BriefAnalysis };
  if (opts.reuseBrief && job.brief) {
    brief = JSON.parse(job.brief) as Brief;
    log("script : brief existant réutilisé");
    if (opts.translateTo && opts.translateTo !== brief.language) {
      update(job.id, { step: "Traduction", progress: 0.1 });
      const analysis = (brief as Brief & { analysis?: BriefAnalysis }).analysis;
      brief = { ...(await translateBrief(brief, opts.translateTo, log)), analysis } as Brief & { analysis?: BriefAnalysis };
      update(job.id, { brief: JSON.stringify(brief) });
    }
    update(job.id, { progress: 0.25, step: "Images" });
  } else {
    const analysis: SourceAnalysis = await analyzeSource(video, log, (p) => update(job.id, { progress: 0.02 + 0.13 * p }));
    update(job.id, { step: "Script", progress: 0.15 });
    brief = await writeBrief(card, coverPath(video), opts, log, analysis);
    // Images clés copiées à côté du rendu pour l'interface.
    const frameUrls: string[] = [];
    analysis.frames.forEach((f, i) => {
      const dest = path.join(jobDir, `source-frame-${i}.jpg`);
      try {
        fs.copyFileSync(f, dest);
        frameUrls.push(`/public/${relDir}/source-frame-${i}.jpg`);
      } catch {
        // image manquante : on l'ignore
      }
    });
    brief.analysis = { frames: frameUrls, transcript: analysis.transcript, transcriptSource: analysis.transcriptSource, stickers: analysis.stickers };
    update(job.id, { brief: JSON.stringify(brief), progress: 0.25, step: "Images" });
  }

  const provider = imageProvider(opts.images);
  const sourceFrames = fs.existsSync(path.join(DATA_DIR, "analysis", String(video.id)))
    ? fs
        .readdirSync(path.join(DATA_DIR, "analysis", String(video.id)))
        .filter((f) => f.startsWith("frame-"))
        .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))
        .map((f) => path.join(DATA_DIR, "analysis", String(video.id), f))
    : [];
  const clips =
    provider === "stock-video"
      ? await findStockClips(brief, jobDir, relDir, sourceFrames, log, (i, t) => update(job.id, { progress: 0.25 + 0.2 * (i / t) }))
      : brief.scenes.map(() => null);
  // Scènes sans clip : une photo libre de droits en secours, sinon fond typographique.
  const images = await makeImages(
    brief,
    jobDir,
    relDir,
    provider === "stock-video" ? (process.env.PEXELS_API_KEY ? "pexels" : "none") : provider,
    log,
    (i, t) => update(job.id, { progress: 0.25 + 0.2 * (i / t) }),
    clips.map((c) => !!c),
  );
  update(job.id, { progress: 0.45, step: "Voix off" });

  const voices = await makeVoices(brief, jobDir, relDir, voiceProvider(opts.voice), log, (i, t) =>
    update(job.id, { progress: 0.45 + 0.2 * (i / t) }),
  );
  update(job.id, { progress: 0.65, step: "Rendu vidéo" });

  const music = opts.music && fs.existsSync(path.join(PUBLIC_DIR, "music", opts.music)) ? `music/${opts.music}` : null;
  const background = opts.backgroundCapture ? capturePath(opts.backgroundCapture) : null;
  if (opts.backgroundCapture && !background) log("fond : enregistrement introuvable, ignoré");
  if (background) log(`fond : enregistrement d'écran (${Math.round(background.durationS)} s) sur les scènes sans clip`);
  let bgOffset = 0;
  const props: NicheProps = {
    title: brief.title,
    hook: brief.hook,
    language: brief.language,
    scenes: brief.scenes.map((s, i) => {
      const durationS = voices[i].file ? voices[i].durationS + 0.35 : voices[i].durationS;
      let video = clips[i]?.rel ?? null;
      let videoDurationS = clips[i]?.durationS ?? null;
      let videoStartS = 0;
      if (!video && background && background.durationS > 1) {
        video = background.rel;
        videoStartS = bgOffset % background.durationS;
        videoDurationS = background.durationS - videoStartS;
        bgOffset += durationS;
      }
      return {
        onScreen: s.onScreen,
        narration: s.narration,
        image: images[i],
        video,
        videoDurationS,
        videoStartS,
        audio: voices[i].file,
        durationS,
        words: voices[i].words,
      };
    }),
    cta: brief.cta,
    handle: opts.handle || "",
    palette: brief.style.palette.length >= 3 ? brief.style.palette.slice(0, 3) : ["#0f0a1f", "#a855f7", "#f472b6"],
    music,
    musicVolume: 0.12,
    captionStyle: opts.captionStyle ?? "karaoke",
    showHookCard: true,
  };
  fs.writeFileSync(path.join(jobDir, "props.json"), JSON.stringify(props, null, 2));
  const credits = [...new Set(clips.filter(Boolean).map((c) => `${c!.credit} ${c!.url}`))];
  if (credits.length) {
    fs.writeFileSync(path.join(jobDir, "credits.txt"), credits.join("\n"));
    update(job.id, { brief: JSON.stringify({ ...brief, credits }) });
  }

  const file = await renderVideo(job.id, props, log, (p) => update(job.id, { progress: 0.65 + 0.35 * p }));
  update(job.id, { status: "done", step: "Terminé", progress: 1, output_file: file }, "terminé : " + file);
}

export function listJobs(): (JobRow & { video: { id: number; caption: string; cover: string | null; handle: string } })[] {
  const rows = db
    .prepare(
      `SELECT j.*, v.caption AS v_caption, v.cover_file AS v_cover_file, v.cover_url AS v_cover_url, a.handle AS a_handle
       FROM jobs j JOIN videos v ON v.id = j.video_id JOIN accounts a ON a.id = v.account_id ORDER BY j.id DESC LIMIT 100`,
    )
    .all() as (JobRow & { v_caption: string; v_cover_file: string | null; v_cover_url: string | null; a_handle: string })[];
  return rows.map(({ v_caption, v_cover_file, v_cover_url, a_handle, ...j }) => ({
    ...j,
    video: { id: j.video_id, caption: v_caption, cover: v_cover_file ? `/covers/${v_cover_file}` : v_cover_url, handle: a_handle },
  }));
}

export function getJob(id: number) {
  return listJobs().find((j) => j.id === id) ?? null;
}

export function deleteJob(id: number) {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
  if (!job) return false;
  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  fs.rmSync(path.join(JOBS_PUBLIC_DIR, String(id)), { recursive: true, force: true });
  if (job.output_file) fs.rmSync(path.join(PUBLIC_DIR, "..", "renders", job.output_file), { force: true });
  return true;
}
