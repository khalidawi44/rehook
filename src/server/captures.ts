// Enregistrements d'écran : WebM reçu du navigateur, converti en MP4 (H.264)
// dans data/public/captures/, réutilisable comme fond d'une recréation.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { FFMPEG, FFPROBE, mediaDuration } from "./media.js";
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

export type ConvertJob = { id: string; status: "running" | "done" | "error"; progress: number; capture: Capture | null; error: string | null };
const convertJobs = new Map<string, ConvertJob>();
export const getConvertJob = (id: string) => convertJobs.get(id) ?? null;

/** Conversion en arrière-plan avec progression (durée connue côté navigateur). */
export function startCaptureConversion(webm: Buffer, name: string, durationHintS: number): ConvertJob {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const job: ConvertJob = { id, status: "running", progress: 0, capture: null, error: null };
  convertJobs.set(id, job);
  (async () => {
    const src = path.join(CAPTURES_DIR, `${id}.webm`);
    const out = path.join(CAPTURES_DIR, `${id}.mp4`);
    fs.writeFileSync(src, webm);
    try {
      const total = Math.max(1, durationHintS || (await mediaDuration(src)) || 1);
      await new Promise<void>((resolve, reject) => {
        const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-nostats", "-progress", "pipe:1", "-i", src, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]);
        let err = "";
        p.stdout.on("data", (d: Buffer) => {
          const m = String(d).match(/out_time_us=(\d+)/g);
          if (m) job.progress = Math.min(0.99, Number(m[m.length - 1].split("=")[1]) / 1e6 / total);
        });
        p.stderr.on("data", (d: Buffer) => (err += d));
        p.on("error", reject);
        p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg : " + err.slice(-300)))));
      });
      const durationS = (await mediaDuration(out)) ?? 0;
      const dim = await dimensions(out);
      const capture: Capture = { id, name: name.trim() || id, file: `${id}.mp4`, url: `/public/captures/${id}.mp4`, durationS, ...dim, createdAt: Math.floor(Date.now() / 1000) };
      writeMeta([capture, ...readMeta()]);
      job.capture = capture;
      job.progress = 1;
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.error = (e as Error).message;
    } finally {
      fs.rmSync(src, { force: true });
    }
  })();
  return job;
}

export async function saveCapture(webm: Buffer, name: string): Promise<Capture> {
  const job = startCaptureConversion(webm, name, 0);
  while (job.status === "running") await new Promise((r) => setTimeout(r, 300));
  if (job.status === "error" || !job.capture) throw new Error(job.error ?? "Conversion échouée");
  return job.capture;
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
