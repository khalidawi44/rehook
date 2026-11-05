// Montage : enchaîne des morceaux de vidéos (sources relevées, enregistrements,
// recréations) avec coupes, son par clip, musique et format de sortie, puis
// exporte en MP4 via ffmpeg. Les exports tournent en arrière-plan et se suivent
// par identifiant.
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { db, type VideoRow } from "./db.js";
import { FFMPEG, FFPROBE, mediaDuration } from "./media.js";
import { PUBLIC_DIR, RENDERS_DIR } from "./paths.js";
import { CAPTURES_DIR, listCaptures } from "./captures.js";
import { ensureSourceFile } from "./recreate/analyze.js";

const execFileP = promisify(execFile);

export type ClipSource = { kind: "video" | "capture" | "render"; id: string };
export type Clip = { source: ClipSource; inS: number; outS: number; mute?: boolean; volume?: number; speed?: number };
export type MontageRequest = {
  name?: string;
  clips: Clip[];
  width: number;
  height: number;
  fit: "cover" | "contain";
  fps?: number;
  music?: string | null;
  musicVolume?: number;
  fadeS?: number;
};

export type MontageJob = {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  progress: number;
  output: string | null;
  url: string | null;
  error: string | null;
  createdAt: number;
  durationS: number;
};

const jobs = new Map<string, MontageJob>();

export function listMontages(): MontageJob[] {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getMontage(id: string): MontageJob | null {
  return jobs.get(id) ?? null;
}

async function resolveSource(src: ClipSource): Promise<string> {
  if (src.kind === "video") {
    const v = db.prepare("SELECT * FROM videos WHERE id = ?").get(Number(src.id)) as VideoRow | undefined;
    if (!v) throw new Error("Vidéo introuvable : " + src.id);
    const f = await ensureSourceFile(v);
    if (!f) throw new Error("Fichier indisponible pour la vidéo " + src.id);
    return f;
  }
  if (src.kind === "capture") {
    const c = listCaptures().find((x) => x.id === src.id);
    if (!c) throw new Error("Enregistrement introuvable : " + src.id);
    return path.join(CAPTURES_DIR, c.file);
  }
  const f = path.join(RENDERS_DIR, `niche-${Number(src.id)}.mp4`);
  if (!fs.existsSync(f)) throw new Error("Rendu introuvable : " + src.id);
  return f;
}

async function hasAudio(file: string): Promise<boolean> {
  try {
    const { stdout } = await execFileP(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file]);
    return stdout.includes("audio");
  } catch {
    return false;
  }
}

/** Sources disponibles pour le chutier. */
export async function montageSources() {
  const videos = db
    .prepare(
      `SELECT v.id, v.caption, v.duration_s, v.cover_file, v.cover_url, a.handle FROM videos v JOIN accounts a ON a.id = v.account_id
       WHERE v.source <> 'demo' ORDER BY v.last_seen_at DESC LIMIT 300`,
    )
    .all() as { id: number; caption: string; duration_s: number | null; cover_file: string | null; cover_url: string | null; handle: string }[];
  const renders = (db.prepare("SELECT id, brief, created_at FROM jobs WHERE status = 'done' AND output_file IS NOT NULL ORDER BY id DESC").all() as { id: number; brief: string | null; created_at: number }[])
    .filter((j) => fs.existsSync(path.join(RENDERS_DIR, `niche-${j.id}.mp4`)))
    .map((j) => {
      let title = `Recréation #${j.id}`;
      try {
        title = (JSON.parse(j.brief ?? "{}") as { title?: string }).title ?? title;
      } catch {
        // titre par défaut
      }
      return { id: String(j.id), name: title, url: `/renders/niche-${j.id}.mp4` };
    });
  return {
    videos: videos.map((v) => ({
      id: String(v.id),
      name: `@${v.handle} : ${v.caption.slice(0, 60) || "(sans légende)"}`,
      durationS: v.duration_s,
      cover: v.cover_file ? `/covers/${v.cover_file}` : v.cover_url,
      url: `/api/videos/${v.id}/media`,
    })),
    captures: listCaptures().map((c) => ({ id: c.id, name: c.name, durationS: c.durationS, url: c.url })),
    renders,
  };
}

export async function startMontage(req: MontageRequest): Promise<MontageJob> {
  if (!req.clips.length) throw new Error("Aucun clip");
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const W = Math.max(16, Math.round(req.width / 2) * 2);
  const H = Math.max(16, Math.round(req.height / 2) * 2);
  const fps = req.fps ?? 30;
  const job: MontageJob = { id, name: req.name?.trim() || `montage-${id}`, status: "running", progress: 0, output: null, url: null, error: null, createdAt: Math.floor(Date.now() / 1000), durationS: 0 };
  jobs.set(id, job);

  (async () => {
    const files: string[] = [];
    const audios: boolean[] = [];
    for (const c of req.clips) {
      const f = await resolveSource(c.source);
      files.push(f);
      audios.push(await hasAudio(f));
    }
    const args: string[] = ["-hide_banner", "-loglevel", "error", "-y", "-nostats", "-progress", "pipe:1"];
    for (const f of files) args.push("-i", f);
    const musicFile = req.music && fs.existsSync(path.join(PUBLIC_DIR, "music", req.music)) ? path.join(PUBLIC_DIR, "music", req.music) : null;
    if (musicFile) args.push("-stream_loop", "-1", "-i", musicFile);
    const musicIndex = files.length;

    const filters: string[] = [];
    let total = 0;
    req.clips.forEach((c, i) => {
      const speed = Math.min(4, Math.max(0.25, c.speed ?? 1));
      const dur = Math.max(0.05, (c.outS - c.inS) / speed);
      total += dur;
      const scale =
        req.fit === "contain"
          ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`
          : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
      filters.push(`[${i}:v]trim=start=${c.inS}:end=${c.outS},setpts=(PTS-STARTPTS)/${speed},${scale},fps=${fps},format=yuv420p,setsar=1[v${i}]`);
      if (audios[i] && !c.mute) {
        const vol = Math.max(0, c.volume ?? 1);
        const tempo = speed === 1 ? "" : `,atempo=${Math.min(2, Math.max(0.5, speed))}`;
        filters.push(`[${i}:a]atrim=start=${c.inS}:end=${c.outS},asetpts=PTS-STARTPTS${tempo},volume=${vol},aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
      } else {
        filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${dur.toFixed(3)}[a${i}]`);
      }
    });
    job.durationS = total;
    const concatIn = req.clips.map((_, i) => `[v${i}][a${i}]`).join("");
    filters.push(`${concatIn}concat=n=${req.clips.length}:v=1:a=1[vcat][acat]`);
    let vOut = "[vcat]";
    let aOut = "[acat]";
    const fade = req.fadeS ?? 0;
    if (fade > 0 && total > fade * 2) {
      filters.push(`[vcat]fade=t=in:st=0:d=${fade},fade=t=out:st=${(total - fade).toFixed(3)}:d=${fade}[vf]`);
      vOut = "[vf]";
    }
    if (musicFile) {
      const mv = req.musicVolume ?? 0.15;
      filters.push(`[${musicIndex}:a]volume=${mv},atrim=duration=${total.toFixed(3)}[m]`);
      filters.push(`${aOut}[m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix]`);
      aOut = "[amix]";
    }
    const out = path.join(RENDERS_DIR, `montage-${id}.mp4`);
    fs.mkdirSync(RENDERS_DIR, { recursive: true });
    args.push("-filter_complex", filters.join(";"), "-map", vOut, "-map", aOut, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-t", total.toFixed(3), out);

    await new Promise<void>((resolve, reject) => {
      const p = spawn(FFMPEG, args);
      let err = "";
      p.stdout.on("data", (d: Buffer) => {
        const m = String(d).match(/out_time_us=(\d+)/g);
        if (m) {
          const us = Number(m[m.length - 1].split("=")[1]);
          job.progress = Math.min(0.99, us / 1e6 / Math.max(0.1, total));
        }
      });
      p.stderr.on("data", (d: Buffer) => (err += d));
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg : " + err.slice(-400)))));
    });
    job.durationS = (await mediaDuration(out)) ?? total;
    job.output = out;
    job.url = `/renders/montage-${id}.mp4`;
    job.progress = 1;
    job.status = "done";
  })().catch((e) => {
    job.status = "error";
    job.error = (e as Error).message;
    console.error("[niche] montage :", job.error);
  });

  return job;
}
