// Analyses média rapides avec ffmpeg : silences, miniatures, onde sonore, tempo, image de couverture.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFMPEG, ffmpeg, mediaDuration } from "../media.js";
import { DATA_DIR } from "../paths.js";

const execFileP = promisify(execFile);
export const CACHE_DIR = path.join(DATA_DIR, "cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const keyOf = (file: string, tag: string) => crypto.createHash("md5").update(`${tag}|${file}|${fs.statSync(file).size}`).digest("hex");

/** Segments parlés (hors silences) entre inS et outS, avec marge. */
export async function speechSegments(file: string, inS: number, outS: number, thresholdDb = -32, minSilenceS = 0.45, padS = 0.12): Promise<{ start: number; end: number }[]> {
  const args = ["-hide_banner", "-nostats", "-ss", String(inS), "-to", String(outS), "-i", file, "-vn", "-af", `silencedetect=noise=${thresholdDb}dB:d=${minSilenceS}`, "-f", "null", "-"];
  let log = "";
  try {
    const r = await execFileP(FFMPEG, args, { maxBuffer: 16 * 1024 * 1024 });
    log = r.stderr;
  } catch (e) {
    log = (e as { stderr?: string }).stderr ?? "";
  }
  const silences: { start: number; end: number }[] = [];
  let cur: number | null = null;
  for (const m of log.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    const t = inS + parseFloat(m[2]);
    if (m[1] === "start") cur = t;
    else if (cur !== null) {
      silences.push({ start: cur, end: t });
      cur = null;
    }
  }
  if (cur !== null) silences.push({ start: cur, end: outS });
  const out: { start: number; end: number }[] = [];
  let pos = inS;
  for (const s of silences) {
    const end = Math.min(outS, s.start + padS);
    if (end - pos > 0.25) out.push({ start: pos, end });
    pos = Math.max(pos, s.end - padS);
  }
  if (outS - pos > 0.25) out.push({ start: pos, end: outS });
  return out.length ? out : [{ start: inS, end: outS }];
}

/** Bande de miniatures (sprite horizontal) : n images de 90 px de haut. */
export async function thumbStrip(file: string, n = 24): Promise<string> {
  const out = path.join(CACHE_DIR, `thumbs-${keyOf(file, "t" + n)}.jpg`);
  if (fs.existsSync(out)) return out;
  const d = (await mediaDuration(file)) ?? 10;
  const fps = n / Math.max(0.5, d);
  await ffmpeg(["-i", file, "-vf", `fps=${fps.toFixed(5)},scale=-2:90,tile=${n}x1`, "-frames:v", "1", "-q:v", "6", out]);
  return out;
}

/** Image de l'onde sonore (fond transparent). */
export async function waveImage(file: string): Promise<string | null> {
  const out = path.join(CACHE_DIR, `wave-${keyOf(file, "w")}.png`);
  if (fs.existsSync(out)) return out;
  try {
    await ffmpeg(["-i", file, "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=1600x60:colors=#22c55e@0.9", "-frames:v", "1", out]);
    return out;
  } catch {
    return null;
  }
}

/** Tempo (BPM) par autocorrélation de l'énergie, sur 60 s max. */
export async function detectBpm(file: string): Promise<number | null> {
  const pcm = path.join(CACHE_DIR, `bpm-${keyOf(file, "b")}.pcm`);
  try {
    await ffmpeg(["-i", file, "-t", "60", "-ac", "1", "-ar", "8000", "-f", "f32le", pcm]);
    const buf = fs.readFileSync(pcm);
    const x = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const hop = 80; // 10 ms
    const frames = Math.floor(x.length / hop);
    const energy = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let e = 0;
      for (let j = 0; j < hop; j++) e += x[i * hop + j] ** 2;
      energy[i] = Math.sqrt(e / hop);
    }
    // Flux d'énergie positif (onsets)
    const flux = new Float32Array(frames);
    for (let i = 1; i < frames; i++) flux[i] = Math.max(0, energy[i] - energy[i - 1]);
    let best = 0;
    let bestLag = 0;
    for (let bpm = 60; bpm <= 180; bpm++) {
      const lag = Math.round(6000 / bpm); // en trames de 10 ms
      let s = 0;
      for (let i = lag; i < frames; i++) s += flux[i] * flux[i - lag];
      // léger biais vers les tempos moyens
      const w = s * (1 - Math.abs(bpm - 120) / 400);
      if (w > best) {
        best = w;
        bestLag = bpm;
      }
    }
    return bestLag || null;
  } catch {
    return null;
  } finally {
    fs.rmSync(pcm, { force: true });
  }
}

/** Image de couverture : une image de la vidéo + un titre incrusté (ASS). */
export async function coverImage(video: string, atS: number, title: string, out: string, font = "Anton"): Promise<string> {
  const W = 1080;
  const H = 1920;
  const esc = title.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: T,${font},150,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,6,5,60,60,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:10.00,T,,0,0,0,,${esc}\n`;
  const assFile = path.join(CACHE_DIR, `cover-${Date.now()}.ass`);
  fs.writeFileSync(assFile, ass);
  try {
    await execFileP(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(atS), "-i", video, "-frames:v", "1", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},subtitles=${path.basename(assFile)}:fontsdir=../public/fonts`, "-q:v", "3", out], { cwd: CACHE_DIR });
  } finally {
    fs.rmSync(assFile, { force: true });
  }
  return out;
}
