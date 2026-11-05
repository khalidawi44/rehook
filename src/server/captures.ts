// Enregistrements d'écran : WebM reçu du navigateur, converti en MP4 (H.264)
// dans data/public/captures/, réutilisable comme fond d'une recréation.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFPROBE, ffmpeg, mediaDuration } from "./media.js";
import { PUBLIC_DIR } from "./paths.js";

const execFileP = promisify(execFile);
export const CAPTURES_DIR = path.join(PUBLIC_DIR, "captures");
fs.mkdirSync(CAPTURES_DIR, { recursive: true });

export type Capture = { id: string; name: string; file: string; url: string; durationS: number; width: number; height: number; createdAt: number };

const metaFile = path.join(CAPTURES_DIR, "captures.json");

function readMeta(): Capture[] {
  try {
    return JSON.parse(fs.readFileSync(metaFile, "utf8")) as Capture[];
  } catch {
    return [];
  }
}

function writeMeta(list: Capture[]) {
  fs.writeFileSync(metaFile, JSON.stringify(list, null, 2));
}

export function listCaptures(): Capture[] {
  return readMeta().filter((c) => fs.existsSync(path.join(CAPTURES_DIR, c.file)));
}

async function dimensions(file: string): Promise<{ width: number; height: number }> {
  try {
    const { stdout } = await execFileP(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]);
    const [w, h] = stdout.trim().split(",").map(Number);
    return { width: w || 0, height: h || 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

export async function saveCapture(webm: Buffer, name: string): Promise<Capture> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const src = path.join(CAPTURES_DIR, `${id}.webm`);
  const out = path.join(CAPTURES_DIR, `${id}.mp4`);
  fs.writeFileSync(src, webm);
  try {
    await ffmpeg(["-i", src, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]);
  } finally {
    fs.rmSync(src, { force: true });
  }
  const durationS = (await mediaDuration(out)) ?? 0;
  const dim = await dimensions(out);
  const capture: Capture = { id, name: name.trim() || id, file: `${id}.mp4`, url: `/public/captures/${id}.mp4`, durationS, ...dim, createdAt: Math.floor(Date.now() / 1000) };
  writeMeta([capture, ...readMeta()]);
  return capture;
}

export function deleteCapture(id: string): boolean {
  const list = readMeta();
  const c = list.find((x) => x.id === id);
  if (!c) return false;
  fs.rmSync(path.join(CAPTURES_DIR, c.file), { force: true });
  writeMeta(list.filter((x) => x.id !== id));
  return true;
}

export function capturePath(id: string): { rel: string; durationS: number } | null {
  const c = readMeta().find((x) => x.id === id);
  if (!c || !fs.existsSync(path.join(CAPTURES_DIR, c.file))) return null;
  return { rel: `captures/${c.file}`, durationS: c.durationS };
}
