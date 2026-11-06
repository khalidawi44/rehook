// Montage : enchaîne des morceaux de vidéos (sources relevées, enregistrements,
// recréations) avec coupes, effets par clip, transitions, musique, sous-titres
// incrustés et textes, puis exporte en MP4 via ffmpeg. Les exports tournent en
// arrière-plan et se suivent par identifiant.
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { db, type VideoRow } from "./db.js";
import { FFMPEG, FFPROBE, mediaDuration } from "./media.js";
import { PUBLIC_DIR, RENDERS_DIR } from "./paths.js";
import { CAPTURES_DIR, listCaptures } from "./captures.js";
import { ensureSourceFile } from "./recreate/analyze.js";
import { buildAss, DEFAULT_STYLE, transcribeAudio, wordsToCues, type Cue, type SubtitleStyle, type TextItem } from "./subtitles.js";

const execFileP = promisify(execFile);

export type ClipSource = { kind: "video" | "capture" | "render"; id: string };
export type ClipEffect =
  | "zoom-in" | "zoom-out" | "bw" | "warm" | "cold" | "vignette" | "mirror" | "sharpen" | "punch" | "fade-in" | "fade-out" | "blur-bg"
  | "sepia" | "vintage" | "cinematic" | "glow" | "blur" | "pixelate" | "invert" | "shake" | "letterbox" | "flash" | "dream" | "contrast-hard";
export const CLIP_EFFECTS: ClipEffect[] = ["zoom-in", "zoom-out", "bw", "warm", "cold", "vignette", "mirror", "sharpen", "punch", "fade-in", "fade-out", "blur-bg", "sepia", "vintage", "cinematic", "glow", "blur", "pixelate", "invert", "shake", "letterbox", "flash", "dream", "contrast-hard"];
export type Clip = { source: ClipSource; inS: number; outS: number; mute?: boolean; volume?: number; speed?: number; effects?: ClipEffect[] };
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

// ---- Musique -----------------------------------------------------------------

export const MUSIC_DIR = path.join(PUBLIC_DIR, "music");
fs.mkdirSync(MUSIC_DIR, { recursive: true });

export async function listMusic() {
  const files = fs.readdirSync(MUSIC_DIR).filter((f) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f));
  const out: { file: string; name: string; durationS: number | null; url: string }[] = [];
  for (const f of files) out.push({ file: f, name: f.replace(/\.[^.]+$/, ""), durationS: await mediaDuration(path.join(MUSIC_DIR, f)), url: `/public/music/${encodeURIComponent(f)}` });
  return out;
}

export async function saveMusic(data: Buffer, name: string): Promise<{ file: string }> {
  const safe = (name || "musique").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().replace(/\.[^.]+$/, "") || "musique";
  const tmp = path.join(MUSIC_DIR, `.${Date.now()}.upload`);
  fs.writeFileSync(tmp, data);
  let file = `${safe}.mp3`;
  let n = 1;
  while (fs.existsSync(path.join(MUSIC_DIR, file))) file = `${safe}-${++n}.mp3`;
  try {
    await execFileP(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", tmp, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", path.join(MUSIC_DIR, file)]);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return { file };
}

export function deleteMusic(file: string): boolean {
  const p = path.join(MUSIC_DIR, path.basename(file));
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { force: true });
  return true;
}

// ---- Graphe ffmpeg -----------------------------------------------------------

const clipLen = (c: Clip) => Math.max(0.05, (c.outS - c.inS) / Math.min(4, Math.max(0.25, c.speed ?? 1)));

function effectFilters(effects: ClipEffect[], W: number, H: number, fps: number, len: number, i = 0): string[] {
  const f: string[] = [];
  for (const e of effects) {
    if (e === "sepia") f.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0");
    if (e === "vintage") f.push("curves=vintage,vignette=PI/5,noise=alls=10:allf=t");
    if (e === "cinematic") f.push("colorbalance=rs=.12:bs=-.1:rh=-.08:bh=.12,eq=contrast=1.1:saturation=1.05");
    if (e === "glow") f.push(`split[gl${i}a][gl${i}b];[gl${i}b]gblur=sigma=14[gl${i}c];[gl${i}a][gl${i}c]blend=all_mode=screen:all_opacity=0.4`);
    if (e === "dream") f.push(`split[dr${i}a][dr${i}b];[dr${i}b]gblur=sigma=8[dr${i}c];[dr${i}a][dr${i}c]blend=all_mode=lighten:all_opacity=0.5,eq=saturation=1.15`);
    if (e === "blur") f.push("gblur=sigma=6");
    if (e === "pixelate") f.push(`scale=iw/14:ih/14:flags=neighbor,scale=${W}:${H}:flags=neighbor`);
    if (e === "invert") f.push("negate");
    if (e === "shake") f.push(`crop=iw*0.94:ih*0.94:x='(iw-ow)/2+(random(1)-0.5)*ih*0.03':y='(ih-oh)/2+(random(2)-0.5)*ih*0.03',scale=${W}:${H}`);
    if (e === "letterbox") f.push("drawbox=y=0:h=ih*0.1:w=iw:color=black:t=fill,drawbox=y=ih*0.9:h=ih*0.1:w=iw:color=black:t=fill");
    if (e === "flash") f.push("fade=t=in:st=0:d=0.25:color=white");
    if (e === "contrast-hard") f.push("eq=contrast=1.4:brightness=-0.03:saturation=0.9");
    if (e === "zoom-in") f.push(`zoompan=z='min(zoom+0.0012,1.25)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps}`);
    if (e === "zoom-out") f.push(`zoompan=z='if(eq(on,1),1.25,max(zoom-0.0012,1.0))':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps}`);
    if (e === "bw") f.push("hue=s=0");
    if (e === "warm") f.push("colorbalance=rs=.08:gs=.02:bs=-.08");
    if (e === "cold") f.push("colorbalance=rs=-.08:gs=0:bs=.08");
    if (e === "vignette") f.push("vignette=PI/4.5");
    if (e === "mirror") f.push("hflip");
    if (e === "sharpen") f.push("unsharp=5:5:1.0:5:5:0.0");
    if (e === "punch") f.push("eq=contrast=1.18:saturation=1.25");
    if (e === "fade-in") f.push("fade=t=in:st=0:d=0.35");
    if (e === "fade-out") f.push(`fade=t=out:st=${Math.max(0, len - 0.35).toFixed(3)}:d=0.35`);
  }
  return f;
}

type Graph = { args: string[]; filters: string[]; vOut: string; aOut: string; total: number };

async function buildGraph(req: MontageRequest, files: string[], audios: boolean[], withVideo: boolean): Promise<Graph> {
  const W = Math.max(16, Math.round(req.width / 2) * 2);
  const H = Math.max(16, Math.round(req.height / 2) * 2);
  const fps = req.fps ?? 30;
  const args: string[] = [];
  for (const f of files) args.push("-i", f);
  const music = req.music?.file && fs.existsSync(path.join(MUSIC_DIR, path.basename(req.music.file))) ? req.music : null;
  if (music) args.push("-stream_loop", "-1", "-i", path.join(MUSIC_DIR, path.basename(music.file)));
  const musicIndex = files.length;

  const filters: string[] = [];
  const lens = req.clips.map(clipLen);
  req.clips.forEach((c, i) => {
    const speed = Math.min(4, Math.max(0.25, c.speed ?? 1));
    const len = lens[i];
    const effects = c.effects ?? [];
    if (withVideo) {
      let scale: string;
      if (effects.includes("blur-bg")) {
        scale = `split[bg${i}][fg${i}];[bg${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2[bgb${i}];[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs${i}];[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2`;
      } else if (req.fit === "contain") {
        scale = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;
      } else {
        scale = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
      }
      const chain = [`trim=start=${c.inS}:end=${c.outS}`, `setpts=(PTS-STARTPTS)/${speed}`, scale, `fps=${fps}`, ...effectFilters(effects, W, H, fps, len, i), "format=yuv420p", "setsar=1"];
      filters.push(`[${i}:v]${chain.join(",")}[v${i}]`);
    }
    if (audios[i] && !c.mute) {
      const vol = Math.max(0, c.volume ?? 1);
      const tempo = speed === 1 ? "" : `,atempo=${Math.min(2, Math.max(0.5, speed))}`;
      filters.push(`[${i}:a]atrim=start=${c.inS}:end=${c.outS},asetpts=PTS-STARTPTS${tempo},volume=${vol},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    } else {
      filters.push(`anullsrc=r=48000:cl=stereo,aformat=sample_fmts=fltp,atrim=duration=${len.toFixed(3)}[a${i}]`);
    }
  });

  const n = req.clips.length;
  const td = req.transition && req.transition.type !== "none" ? Math.min(1.5, Math.max(0.1, req.transition.durationS)) : 0;
  const canXfade = td > 0 && n > 1 && lens.every((l) => l > td * 2 + 0.1);
  let total = lens.reduce((a, b) => a + b, 0);
  let vOut = "";
  let aOut = "";
  if (canXfade) {
    const type = req.transition!.type;
    let vPrev = withVideo ? "[v0]" : "";
    let aPrev = "[a0]";
    let offset = 0;
    for (let i = 1; i < n; i++) {
      offset += lens[i - 1] - td;
      if (withVideo) {
        const vo = i === n - 1 ? "[vcat]" : `[vx${i}]`;
        filters.push(`${vPrev}[v${i}]xfade=transition=${type}:duration=${td}:offset=${offset.toFixed(3)}${vo}`);
        vPrev = vo;
      }
      const ao = i === n - 1 ? "[acat]" : `[ax${i}]`;
      filters.push(`${aPrev}[a${i}]acrossfade=d=${td}${ao}`);
      aPrev = ao;
    }
    total -= td * (n - 1);
  } else if (n === 1) {
    if (withVideo) filters.push("[v0]null[vcat]");
    filters.push("[a0]anull[acat]");
  } else {
    if (withVideo) filters.push(`${req.clips.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[vcat]`);
    filters.push(`${req.clips.map((_, i) => `[a${i}]`).join("")}concat=n=${n}:v=0:a=1[acat]`);
  }
  vOut = "[vcat]";
  aOut = "[acat]";

  if (withVideo) {
    const fade = req.fadeS ?? 0;
    if (fade > 0 && total > fade * 2) {
      filters.push(`[vcat]fade=t=in:st=0:d=${fade},fade=t=out:st=${(total - fade).toFixed(3)}:d=${fade}[vf]`);
      vOut = "[vf]";
    }
  }
  if (music) {
    const mv = music.volume ?? 0.15;
    const start = Math.max(0, music.startS ?? 0);
    const fi = music.fadeInS ?? 0;
    const fo = music.fadeOutS ?? 0;
    const mchain = [`atrim=start=${start}`, "asetpts=PTS-STARTPTS", `atrim=duration=${total.toFixed(3)}`, "aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo", `volume=${mv}`];
    if (fi > 0) mchain.push(`afade=t=in:st=0:d=${fi}`);
    if (fo > 0 && total > fo) mchain.push(`afade=t=out:st=${(total - fo).toFixed(3)}:d=${fo}`);
    filters.push(`[${musicIndex}:a]${mchain.join(",")}[m]`);
    if (music.duck) {
      // La musique baisse quand la voix parle (compresseur piloté par la piste voix).
      filters.push(`${aOut}asplit[voice][sc]`);
      filters.push(`[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=400:makeup=1[md]`);
      filters.push(`[voice][md]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix]`);
    } else {
      filters.push(`${aOut}[m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix]`);
    }
    aOut = "[amix]";
  }
  return { args, filters, vOut, aOut, total };
}

async function prepare(req: MontageRequest) {
  if (!req.clips.length) throw new Error("Aucun clip");
  const files: string[] = [];
  const audios: boolean[] = [];
  for (const c of req.clips) {
    const f = await resolveSource(c.source);
    files.push(f);
    audios.push(await hasAudio(f));
  }
  return { files, audios };
}

function runFfmpeg(args: string[], cwd: string, total: number, onProgress: (p: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-nostats", "-progress", "pipe:1", ...args], { cwd });
    let err = "";
    p.stdout.on("data", (d: Buffer) => {
      const m = String(d).match(/out_time_us=(\d+)/g);
      if (m) onProgress(Math.min(0.99, Number(m[m.length - 1].split("=")[1]) / 1e6 / Math.max(0.1, total)));
    });
    p.stderr.on("data", (d: Buffer) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg : " + err.slice(-500)))));
  });
}

/** Transcription de la bande son du montage tel qu'il sera exporté (sans la musique). */
export async function transcribeMontage(req: MontageRequest, language: string | undefined, log: (l: string) => void): Promise<{ cues: Cue[]; provider: string; language?: string }> {
  const { files, audios } = await prepare({ ...req, music: null });
  const g = await buildGraph({ ...req, music: null }, files, audios, false);
  fs.mkdirSync(RENDERS_DIR, { recursive: true });
  const audio = path.join(RENDERS_DIR, `transcribe-${Date.now()}.mp3`);
  try {
    await runFfmpeg([...g.args, "-filter_complex", g.filters.join(";"), "-map", g.aOut, "-vn", "-c:a", "libmp3lame", "-b:a", "96k", "-t", g.total.toFixed(3), audio], RENDERS_DIR, g.total, () => {});
    const r = await transcribeAudio(audio, language, log);
    const style = req.subtitles?.style ?? {};
    return { cues: wordsToCues(r.words, style.maxWords ?? DEFAULT_STYLE.maxWords), provider: r.provider, language: r.language };
  } finally {
    fs.rmSync(audio, { force: true });
  }
}

export async function startMontage(req: MontageRequest): Promise<MontageJob> {
  if (!req.clips.length) throw new Error("Aucun clip");
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const job: MontageJob = { id, name: req.name?.trim() || `montage-${id}`, status: "running", progress: 0, output: null, url: null, error: null, createdAt: Math.floor(Date.now() / 1000), durationS: 0 };
  jobs.set(id, job);

  (async () => {
    const { files, audios } = await prepare(req);
    const g = await buildGraph(req, files, audios, true);
    job.durationS = g.total;
    fs.mkdirSync(RENDERS_DIR, { recursive: true });
    const W = Math.max(16, Math.round(req.width / 2) * 2);
    const H = Math.max(16, Math.round(req.height / 2) * 2);
    let vOut = g.vOut;
    const filters = g.filters.slice();
    const cues = req.subtitles?.cues ?? [];
    const texts = req.texts ?? [];
    let assFile: string | null = null;
    if (cues.length || texts.length) {
      const style = { ...DEFAULT_STYLE, ...(req.subtitles?.style ?? {}) };
      assFile = `montage-${id}.ass`;
      fs.writeFileSync(path.join(RENDERS_DIR, assFile), buildAss({ width: W, height: H, cues, style, texts }));
      // Chemins relatifs au dossier de rendu : pas d'échappement de « : » ni de « \ » (Windows).
      filters.push(`${vOut}subtitles=${assFile}:fontsdir=../public/fonts[vsub]`);
      vOut = "[vsub]";
    }
    const outName = `montage-${id}.mp4`;
    try {
      await runFfmpeg(
        [...g.args, "-filter_complex", filters.join(";"), "-map", vOut, "-map", g.aOut, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-t", g.total.toFixed(3), outName],
        RENDERS_DIR,
        g.total,
        (p) => (job.progress = p),
      );
    } finally {
      if (assFile) fs.rmSync(path.join(RENDERS_DIR, assFile), { force: true });
    }
    const out = path.join(RENDERS_DIR, outName);
    job.durationS = (await mediaDuration(out)) ?? g.total;
    job.output = out;
    job.url = `/renders/${outName}`;
    job.progress = 1;
    job.status = "done";
  })().catch((e) => {
    job.status = "error";
    job.error = (e as Error).message;
    console.error("[niche] montage :", job.error);
  });

  return job;
}
