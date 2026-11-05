// Chemins de ffmpeg et ffprobe : binaires embarqués (ffmpeg-static) ou ceux du système.
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const execFileP = promisify(execFile);

function staticPath(pkg: string): string | null {
  try {
    const mod = require(pkg) as string | { path?: string };
    const p = typeof mod === "string" ? mod : mod?.path;
    return p || null;
  } catch {
    return null;
  }
}

export const FFMPEG = process.env.FFMPEG_PATH || staticPath("ffmpeg-static") || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || staticPath("ffprobe-static") || "ffprobe";

export async function ffmpeg(args: string[]): Promise<void> {
  await execFileP(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 16 * 1024 * 1024 });
}

export async function mediaDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileP(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}
