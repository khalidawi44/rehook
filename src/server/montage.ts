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
import { coverImage, detectBpm } from "./tools/media-analysis.js";
import { personCenterX } from "./tools/smartcrop.js";

const execFileP = promisify(execFile);

export type ClipSource = { kind: "video" | "capture" | "render"; id: string };
export type ClipEffect =
  | "zoom-in" | "zoom-out" | "bw" | "warm" | "cold" | "vignette" | "mirror" | "sharpen" | "punch" | "fade-in" | "fade-out" | "blur-bg"
  | "sepia" | "vintage" | "cinematic" | "glow" | "blur" | "pixelate" | "invert" | "shake" | "letterbox" | "flash" | "dream" | "contrast-hard"
  | "teal-orange" | "noir" | "pastel" | "faded" | "vivid" | "matte" | "neon" | "old-film" | "stabilize" | "vhs" | "rgb-split" | "spin";
export const CLIP_EFFECTS: ClipEffect[] = ["zoom-in", "zoom-out", "bw", "warm", "cold", "vignette", "mirror", "sharpen", "punch", "fade-in", "fade-out", "blur-bg", "sepia", "vintage", "cinematic", "glow", "blur", "pixelate", "invert", "shake", "letterbox", "flash", "dream", "contrast-hard", "teal-orange", "noir", "pastel", "faded", "vivid", "matte", "neon", "old-film", "stabilize", "vhs", "rgb-split", "spin"];
/** Réglages image (comme CapCut « Ajuster ») : 0 = neutre pour tout sauf contraste, saturation et gamma (1 = neutre). */
export type ClipAdjust = { brightness?: number; contrast?: number; saturation?: number; gamma?: number; temperature?: number; hue?: number; sharpen?: number; opacity?: number };
export type ClipZoom = { start: number; end: number; x: number; y: number };
export type ClipFreeze = { at: "start" | "end"; durationS: number };
export type ClipAudio = { fadeInS?: number; fadeOutS?: number; denoise?: boolean; pitch?: number; boost?: boolean; bass?: number; treble?: number; echo?: boolean };
export type ClipChroma = { color: string; similarity: number; blend: number; bgColor?: string; background?: ClipSource | null };
export type ClipMask = "none" | "circle" | "rounded" | "heart" | "star" | "diamond";
export type Clip = {
  source: ClipSource;
  inS: number;
  outS: number;
  mute?: boolean;
  volume?: number;
  speed?: number;
  effects?: ClipEffect[];
  smartCrop?: boolean;
  cropX?: number | null;
  reverse?: boolean;
  rotate?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  adjust?: ClipAdjust | null;
  zoom?: ClipZoom | null;
  freeze?: ClipFreeze | null;
  audio?: ClipAudio | null;
  chroma?: ClipChroma | null;
  mask?: ClipMask;
};
/** Calque posé sur toute la vidéo : image (sticker, logo) ou vidéo incrustée (PiP). Positions et taille en fraction de l'image. */
export type Overlay = { id: string; kind: "image" | "video"; file?: string; source?: ClipSource; x: number; y: number; w: number; start: number; end: number; opacity?: number; rotate?: number; mute?: boolean; shape?: "rect" | "circle" | "rounded" };
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
  overlays?: Overlay[];
  padColor?: string;
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
  coverUrl?: string | null;
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
  const f = path.join(RENDERS_DIR, `rehook-${Number(src.id)}.mp4`);
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
      `SELECT v.id, v.caption, v.duration_s, v.cover_file, v.cover_url, v.posted_at, v.favorite, a.handle, a.followed,
              (SELECT MAX(s.views) FROM snapshots s WHERE s.video_id = v.id) AS views
       FROM videos v JOIN accounts a ON a.id = v.account_id
       WHERE v.source <> 'demo' ORDER BY v.last_seen_at DESC LIMIT 600`,
    )
    .all() as { id: number; caption: string; duration_s: number | null; cover_file: string | null; cover_url: string | null; posted_at: number | null; favorite: number; handle: string; followed: number; views: number | null }[];
  const renders = (db.prepare("SELECT id, brief, created_at FROM jobs WHERE status = 'done' AND output_file IS NOT NULL ORDER BY id DESC").all() as { id: number; brief: string | null; created_at: number }[])
    .filter((j) => fs.existsSync(path.join(RENDERS_DIR, `rehook-${j.id}.mp4`)))
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
      handle: v.handle,
      durationS: v.duration_s,
      cover: v.cover_file ? `/covers/${v.cover_file}` : v.cover_url,
      url: `/api/videos/${v.id}/media`,
      views: v.views ?? 0,
      postedAt: v.posted_at,
      favorite: !!v.favorite,
      followed: !!v.followed,
    })),
    captures: listCaptures().map((c) => ({ id: c.id, name: c.name, durationS: c.durationS, url: c.url })),
    renders,
  };
}

// ---- Musique -----------------------------------------------------------------

export const MUSIC_DIR = path.join(PUBLIC_DIR, "music");
fs.mkdirSync(MUSIC_DIR, { recursive: true });

function musicMeta(f: string): { bpm?: number | null; durationS?: number | null } {
  try {
    return JSON.parse(fs.readFileSync(path.join(MUSIC_DIR, f + ".json"), "utf8"));
  } catch {
    return {};
  }
}

export async function listMusic() {
  const files = fs.readdirSync(MUSIC_DIR).filter((f) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f));
  const out: { file: string; name: string; durationS: number | null; url: string; bpm: number | null }[] = [];
  for (const f of files) {
    let meta = musicMeta(f);
    if (meta.bpm === undefined) {
      const full = path.join(MUSIC_DIR, f);
      meta = { bpm: await detectBpm(full), durationS: await mediaDuration(full) };
      fs.writeFileSync(full + ".json", JSON.stringify(meta));
    }
    out.push({ file: f, name: f.replace(/\.[^.]+$/, ""), durationS: meta.durationS ?? (await mediaDuration(path.join(MUSIC_DIR, f))), url: `/public/music/${encodeURIComponent(f)}`, bpm: meta.bpm ?? null });
  }
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
  fs.rmSync(p + ".json", { force: true });
  return true;
}

// ---- Graphe ffmpeg -----------------------------------------------------------

const clipSpeed = (c: Clip) => Math.min(4, Math.max(0.25, c.speed ?? 1));
const freezeLen = (c: Clip) => (c.freeze && c.freeze.durationS > 0 ? Math.min(10, c.freeze.durationS) : 0);
const clipLen = (c: Clip) => Math.max(0.05, (c.outS - c.inS) / clipSpeed(c)) + freezeLen(c);
/** atempo n'accepte que 0.5 à 2 : on enchaîne plusieurs étages pour x0.25 ou x4. */
function atempoChain(speed: number): string {
  const parts: string[] = [];
  let s = speed;
  while (s > 2) {
    parts.push("atempo=2");
    s /= 2;
  }
  while (s < 0.5) {
    parts.push("atempo=0.5");
    s *= 2;
  }
  if (Math.abs(s - 1) > 0.001) parts.push(`atempo=${s.toFixed(4)}`);
  return parts.length ? "," + parts.join(",") : "";
}
const ffColor = (c: string | undefined, fallback: string) => {
  const m = (c ?? "").trim().match(/^#?([0-9a-f]{6})$/i);
  return m ? "0x" + m[1] : fallback;
};
export const STICKERS_DIR = path.join(PUBLIC_DIR, "stickers");
fs.mkdirSync(STICKERS_DIR, { recursive: true });
export function listStickers(): { file: string; url: string }[] {
  return fs
    .readdirSync(STICKERS_DIR)
    .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
    .map((f) => ({ file: f, url: `/public/stickers/${encodeURIComponent(f)}` }));
}
export function saveSticker(data: Buffer, name: string): { file: string } {
  const ext = (name.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] ?? "png").toLowerCase();
  const safe = name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "sticker";
  let file = `${safe}.${ext}`;
  let n = 1;
  while (fs.existsSync(path.join(STICKERS_DIR, file))) file = `${safe}-${++n}.${ext}`;
  fs.writeFileSync(path.join(STICKERS_DIR, file), data);
  return { file };
}
export function deleteSticker(file: string): boolean {
  const p = path.join(STICKERS_DIR, path.basename(file));
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { force: true });
  return true;
}
/** Masque de forme : alpha via geq, puis fond noir (ou couleur de fond) derrière. */
function maskFilter(mask: ClipMask | undefined, W: number, H: number, bg: string): string {
  if (!mask || mask === "none") return "";
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2;
  let a = "";
  if (mask === "circle") a = `if(lte((X-${cx})*(X-${cx})+(Y-${cy})*(Y-${cy}),${r * r}),255,0)`;
  else if (mask === "rounded") {
    const rr = Math.round(Math.min(W, H) * 0.12);
    a = `if(lt(X,${rr})*lt(Y,${rr})*gt((X-${rr})*(X-${rr})+(Y-${rr})*(Y-${rr}),${rr * rr})+gt(X,${W - rr})*lt(Y,${rr})*gt((X-${W - rr})*(X-${W - rr})+(Y-${rr})*(Y-${rr}),${rr * rr})+lt(X,${rr})*gt(Y,${H - rr})*gt((X-${rr})*(X-${rr})+(Y-${H - rr})*(Y-${H - rr}),${rr * rr})+gt(X,${W - rr})*gt(Y,${H - rr})*gt((X-${W - rr})*(X-${W - rr})+(Y-${H - rr})*(Y-${H - rr}),${rr * rr}),0,255)`;
  } else if (mask === "diamond") a = `if(lte(abs(X-${cx})/${cx}+abs(Y-${cy})/${cy},1),255,0)`;
  else if (mask === "heart") {
    // Cœur : équation (x²+y²-1)³ - x²y³ <= 0 sur un repère normalisé.
    a = `if(lte(pow(pow((X-${cx})/${r * 0.75},2)+pow(-(Y-${cy * 0.9})/${r * 0.75},2)-1,3)-pow((X-${cx})/${r * 0.75},2)*pow(-(Y-${cy * 0.9})/${r * 0.75},3),0),255,0)`;
  } else if (mask === "star") {
    // Étoile à 5 branches : rayon polaire d'un bord droit entre une pointe (rayon r) et un creux (0,382 r).
    const psi = `(PI/5-abs(mod(atan2(Y-${cy},X-${cx})+PI/2+4*PI,2*PI/5)-PI/5))`;
    a = `if(lte(hypot(X-${cx},Y-${cy}),${r}*0.382*sin(PI/5)/(0.382*sin(PI/5-${psi})+sin(${psi}))),255,0)`;
  }
  if (!a) return "";
  return `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${a}',split[mk_a][mk_b];[mk_b]drawbox=c=${bg}:t=fill,format=rgba[mk_bg];[mk_bg][mk_a]overlay=format=auto,format=yuv420p`;
}

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
    if (e === "teal-orange") f.push("colorbalance=rs=.18:gs=-.02:bs=-.18:rh=-.1:bh=.18:rm=.06:bm=-.06,eq=contrast=1.08:saturation=1.1");
    if (e === "noir") f.push("hue=s=0,eq=contrast=1.35:brightness=-0.05:gamma=0.9,vignette=PI/4");
    if (e === "pastel") f.push("eq=contrast=0.9:brightness=0.06:saturation=0.8,colorbalance=rs=.05:bs=.05");
    if (e === "faded") f.push("curves=all='0/0.08 0.5/0.5 1/0.92',eq=saturation=0.75:contrast=0.95");
    if (e === "vivid") f.push("eq=saturation=1.6:contrast=1.12");
    if (e === "matte") f.push("curves=all='0/0.12 0.3/0.32 0.7/0.72 1/0.95',eq=saturation=0.9");
    if (e === "neon") f.push("eq=saturation=1.8:contrast=1.2,hue=h=12,unsharp=5:5:0.8");
    if (e === "old-film") f.push("hue=s=0.12,curves=vintage,noise=alls=22:allf=t+u,vignette=PI/4,eq=contrast=1.1");
    if (e === "stabilize") f.push("deshake=rx=32:ry=32:edge=mirror");
    if (e === "vhs") f.push(`eq=saturation=1.25:contrast=0.95,noise=alls=14:allf=t,chromashift=cbh=-6:crh=6,scale=iw*0.5:ih*0.5,scale=${W}:${H}:flags=bilinear`);
    if (e === "rgb-split") f.push("chromashift=cbh=10:crh=-10:cbv=4:crv=-4");
    if (e === "spin") f.push(`rotate=2*PI*t/${Math.max(0.5, len).toFixed(3)}:c=black`);
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
  let nextIndex = files.length + (music ? 1 : 0);
  // Fonds des incrustations fond vert (une entrée vidéo par clip concerné, en boucle)
  const chromaBg: (number | null)[] = [];
  for (const c of req.clips) {
    if (withVideo && c.chroma?.background) {
      const f = await resolveSource(c.chroma.background);
      args.push("-stream_loop", "-1", "-i", f);
      chromaBg.push(nextIndex++);
    } else chromaBg.push(null);
  }
  // Calques (stickers, images, vidéos incrustées)
  const overlays = withVideo ? (req.overlays ?? []).filter((o) => o.end > o.start && o.w > 0) : [];
  const overlayIndex: number[] = [];
  for (const o of overlays) {
    if (o.kind === "image") {
      const f = path.join(STICKERS_DIR, path.basename(o.file ?? ""));
      if (!fs.existsSync(f)) throw new Error("Sticker introuvable : " + o.file);
      if (/\.gif$/i.test(f)) args.push("-ignore_loop", "0", "-i", f);
      else args.push("-loop", "1", "-i", f);
    } else {
      if (!o.source) throw new Error("Calque vidéo sans source");
      args.push("-i", await resolveSource(o.source));
    }
    overlayIndex.push(nextIndex++);
  }
  const padColor = ffColor(req.padColor, "black");

  const filters: string[] = [];
  const lens = req.clips.map(clipLen);
  req.clips.forEach((c, i) => {
    const speed = clipSpeed(c);
    const len = lens[i];
    const effects = c.effects ?? [];
    const fz = freezeLen(c);
    if (withVideo) {
      const pre: string[] = [];
      if (c.rotate === 90) pre.push("transpose=1");
      else if (c.rotate === 180) pre.push("hflip,vflip");
      else if (c.rotate === 270) pre.push("transpose=2");
      if (c.flipH) pre.push("hflip");
      if (c.flipV) pre.push("vflip");
      let scale: string;
      if (effects.includes("blur-bg")) {
        scale = `split[bg${i}][fg${i}];[bg${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2[bgb${i}];[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs${i}];[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2`;
      } else if (req.fit === "contain") {
        scale = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`;
      } else if (typeof c.cropX === "number") {
        // Recadrage centré sur les personnes détectées (cropX = centre horizontal 0..1).
        const cx = Math.max(0, Math.min(1, c.cropX)).toFixed(3);
        scale = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:x='min(max(${cx}*iw-${W}/2,0),iw-${W})':y='(ih-${H})/2'`;
      } else {
        scale = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
      }
      const post: string[] = [];
      // Réglages image
      const a = c.adjust;
      if (a) {
        const eq: string[] = [];
        if (a.brightness) eq.push(`brightness=${Math.max(-1, Math.min(1, a.brightness)).toFixed(3)}`);
        if (a.contrast !== undefined && Math.abs(a.contrast - 1) > 0.001) eq.push(`contrast=${Math.max(0, Math.min(3, a.contrast)).toFixed(3)}`);
        if (a.saturation !== undefined && Math.abs(a.saturation - 1) > 0.001) eq.push(`saturation=${Math.max(0, Math.min(3, a.saturation)).toFixed(3)}`);
        if (a.gamma !== undefined && Math.abs(a.gamma - 1) > 0.001) eq.push(`gamma=${Math.max(0.1, Math.min(10, a.gamma)).toFixed(3)}`);
        if (eq.length) post.push("eq=" + eq.join(":"));
        if (a.temperature) {
          const t = Math.max(-1, Math.min(1, a.temperature));
          post.push(`colorbalance=rs=${(t * 0.25).toFixed(3)}:bs=${(-t * 0.25).toFixed(3)}:rm=${(t * 0.12).toFixed(3)}:bm=${(-t * 0.12).toFixed(3)}`);
        }
        if (a.hue) post.push(`hue=h=${Math.max(-180, Math.min(180, a.hue)).toFixed(1)}`);
        if (a.sharpen) post.push(`unsharp=5:5:${Math.max(-2, Math.min(3, a.sharpen)).toFixed(2)}:5:5:0`);
      }
      // Zoom animé (image clé début et fin, point d'intérêt x,y)
      if (c.zoom && (Math.abs(c.zoom.start - 1) > 0.001 || Math.abs(c.zoom.end - 1) > 0.001)) {
        const zs = Math.max(1, Math.min(4, c.zoom.start)).toFixed(3);
        const ze = Math.max(1, Math.min(4, c.zoom.end)).toFixed(3);
        const fx = Math.max(0, Math.min(1, c.zoom.x)).toFixed(3);
        const fy = Math.max(0, Math.min(1, c.zoom.y)).toFixed(3);
        const frames = Math.max(1, Math.round((len - fz) * fps));
        post.push(`zoompan=z='${zs}+(${ze}-${zs})*min(on,${frames})/${frames}':x='(iw-iw/zoom)*${fx}':y='(ih-ih/zoom)*${fy}':d=1:s=${W}x${H}:fps=${fps}`);
      }
      // Fond vert : on retire la couleur puis on pose sur un fond (vidéo en boucle ou couleur)
      let chroma = "";
      if (c.chroma) {
        const col = ffColor(c.chroma.color, "0x00FF00");
        const sim = Math.max(0.01, Math.min(1, c.chroma.similarity || 0.3)).toFixed(3);
        const bl = Math.max(0, Math.min(1, c.chroma.blend || 0.1)).toFixed(3);
        const bgi = chromaBg[i];
        const bgLabel = `[cbg${i}]`;
        if (bgi !== null) filters.push(`[${bgi}:v]trim=duration=${len.toFixed(3)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps}${bgLabel}`);
        else filters.push(`color=c=${ffColor(c.chroma.bgColor, "black")}:s=${W}x${H}:r=${fps}:d=${len.toFixed(3)}${bgLabel}`);
        chroma = `format=yuva420p,chromakey=${col}:${sim}:${bl}[ck${i}];${bgLabel}[ck${i}]overlay=shortest=1:format=auto`;
      }
      if (a?.opacity !== undefined && a.opacity < 0.999) {
        post.push(`format=rgba,colorchannelmixer=aa=${Math.max(0, Math.min(1, a.opacity)).toFixed(3)},split[op${i}a][op${i}b];[op${i}b]drawbox=c=black:t=fill,format=rgba[op${i}bg];[op${i}bg][op${i}a]overlay=format=auto`);
      }
      const mask = maskFilter(c.mask, W, H, padColor).replace(/mk_/g, `mk${i}_`);
      const freeze = fz > 0 ? (c.freeze!.at === "end" ? `tpad=stop_mode=clone:stop_duration=${fz.toFixed(3)}` : `tpad=start_mode=clone:start_duration=${fz.toFixed(3)}`) : "";
      const chain = [
        `trim=start=${c.inS}:end=${c.outS}`,
        `setpts=(PTS-STARTPTS)/${speed}`,
        ...(c.reverse ? ["reverse"] : []),
        ...pre,
        scale,
        `fps=${fps}`,
        ...(chroma ? [chroma] : []),
        ...post,
        ...(mask ? [mask] : []),
        ...effectFilters(effects, W, H, fps, len - fz, i),
        ...(freeze ? [freeze] : []),
        "format=yuv420p",
        "setsar=1",
      ];
      filters.push(`[${i}:v]${chain.join(",")}[v${i}]`);
    }
    if (audios[i] && !c.mute) {
      const vol = Math.max(0, c.volume ?? 1);
      const au = c.audio ?? {};
      const extra: string[] = [];
      if (c.reverse) extra.push("areverse");
      if (au.denoise) extra.push("afftdn=nf=-25");
      if (au.pitch) {
        const st = Math.max(-12, Math.min(12, au.pitch));
        const ratio = Math.pow(2, st / 12);
        extra.push(`asetrate=48000*${ratio.toFixed(5)},aresample=48000${atempoChain(1 / ratio)}`);
      }
      if (au.bass) extra.push(`bass=g=${Math.max(-20, Math.min(20, au.bass)).toFixed(1)}`);
      if (au.treble) extra.push(`treble=g=${Math.max(-20, Math.min(20, au.treble)).toFixed(1)}`);
      if (au.boost) extra.push("acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=3,alimiter=limit=0.95");
      if (au.echo) extra.push("aecho=0.8:0.5:70:0.3");
      const bodyLen = len - fz;
      if (au.fadeInS && au.fadeInS > 0) extra.push(`afade=t=in:st=0:d=${Math.min(bodyLen, au.fadeInS).toFixed(3)}`);
      if (au.fadeOutS && au.fadeOutS > 0) extra.push(`afade=t=out:st=${Math.max(0, bodyLen - au.fadeOutS).toFixed(3)}:d=${Math.min(bodyLen, au.fadeOutS).toFixed(3)}`);
      if (fz > 0) extra.push(c.freeze!.at === "end" ? `apad=pad_dur=${fz.toFixed(3)}` : `adelay=${Math.round(fz * 1000)}|${Math.round(fz * 1000)}`);
      filters.push(`[${i}:a]aresample=48000,atrim=start=${c.inS}:end=${c.outS},asetpts=PTS-STARTPTS${atempoChain(speed)},volume=${vol}${extra.length ? "," + extra.join(",") : ""},aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=${len.toFixed(3)}[a${i}]`);
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
    overlays.forEach((o, k) => {
      const idx = overlayIndex[k];
      const ow = Math.max(8, Math.round((Math.min(1, o.w) * W) / 2) * 2);
      const st = Math.max(0, o.start).toFixed(3);
      const en = Math.min(total, o.end).toFixed(3);
      const op = Math.max(0, Math.min(1, o.opacity ?? 1));
      const parts = [o.kind === "video" ? `trim=duration=${(o.end - o.start).toFixed(3)},setpts=PTS-STARTPTS+${st}/TB` : `setpts=PTS-STARTPTS+${st}/TB`, `scale=${ow}:-2`, "format=rgba"];
      if (o.rotate) parts.push(`rotate=${((o.rotate * Math.PI) / 180).toFixed(4)}:c=none:ow=rotw(iw):oh=roth(ih)`);
      if (o.shape === "circle") parts.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2),(min(W,H)/2)*(min(W,H)/2)),alpha(X,Y),0)'`);
      else if (o.shape === "rounded") parts.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(X,W*0.12)*lt(Y,W*0.12)*gt((X-W*0.12)*(X-W*0.12)+(Y-W*0.12)*(Y-W*0.12),W*W*0.0144)+gt(X,W-W*0.12)*lt(Y,W*0.12)*gt((X-W+W*0.12)*(X-W+W*0.12)+(Y-W*0.12)*(Y-W*0.12),W*W*0.0144)+lt(X,W*0.12)*gt(Y,H-W*0.12)*gt((X-W*0.12)*(X-W*0.12)+(Y-H+W*0.12)*(Y-H+W*0.12),W*W*0.0144)+gt(X,W-W*0.12)*gt(Y,H-W*0.12)*gt((X-W+W*0.12)*(X-W+W*0.12)+(Y-H+W*0.12)*(Y-H+W*0.12),W*W*0.0144),0,alpha(X,Y))'`);
      if (op < 0.999) parts.push(`colorchannelmixer=aa=${op.toFixed(3)}`);
      filters.push(`[${idx}:v]${parts.join(",")}[ov${k}]`);
      const outLabel = `[vo${k}]`;
      filters.push(`${vOut}[ov${k}]overlay=x=${Math.round(Math.max(0, Math.min(1, o.x)) * W)}:y=${Math.round(Math.max(0, Math.min(1, o.y)) * H)}:enable='between(t,${st},${en})':eof_action=pass:format=auto${outLabel}`);
      vOut = outLabel;
    });
    // Son des calques vidéo (PiP) mixé à la bande son, sauf si coupé
    const withSound = overlays.map((o, k) => ({ o, k })).filter(({ o }) => o.kind === "video" && !o.mute);
    if (withSound.length) {
      const labels: string[] = [];
      for (const { o, k } of withSound) {
        const d = Math.max(0.05, o.end - o.start).toFixed(3);
        filters.push(`[${overlayIndex[k]}:a]aresample=48000,atrim=duration=${d},asetpts=PTS-STARTPTS,adelay=${Math.round(o.start * 1000)}|${Math.round(o.start * 1000)},aformat=sample_fmts=fltp:channel_layouts=stereo[oa${k}]`);
        labels.push(`[oa${k}]`);
      }
      filters.push(`${aOut}${labels.join("")}amix=inputs=${labels.length + 1}:duration=first:dropout_transition=0:normalize=0[aov]`);
      aOut = "[aov]";
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

async function prepare(req: MontageRequest, log: (l: string) => void = () => {}) {
  if (!req.clips.length) throw new Error("Aucun clip");
  const files: string[] = [];
  const audios: boolean[] = [];
  for (const c of req.clips) {
    const f = await resolveSource(c.source);
    files.push(f);
    audios.push(await hasAudio(f));
    if (c.smartCrop && req.fit === "cover" && typeof c.cropX !== "number") {
      c.cropX = await personCenterX(f, c.inS, c.outS, log);
      if (typeof c.cropX === "number") log(`recadrage : personnes au centre à ${Math.round(c.cropX * 100)} % de la largeur`);
    }
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
    const { files, audios } = await prepare(req, (l) => console.log("[rehook] montage :", l));
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
    if (req.cover) {
      try {
        const coverName = `montage-${id}-cover.jpg`;
        await coverImage(out, Math.max(0, Math.min(job.durationS - 0.1, req.cover.atS)), req.cover.title, path.join(RENDERS_DIR, coverName), req.subtitles?.style?.font || "Anton");
        job.coverUrl = `/renders/${coverName}`;
      } catch (e) {
        console.warn("[rehook] couverture :", (e as Error).message);
      }
    }
    job.progress = 1;
    job.status = "done";
  })().catch((e) => {
    job.status = "error";
    job.error = (e as Error).message;
    console.error("[rehook] montage :", job.error);
  });

  return job;
}
