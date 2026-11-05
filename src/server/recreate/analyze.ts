// Analyse de la vidéo source : téléchargement, images clés, transcription
// (sous-titres automatiques TikTok, sinon Whisper si OPENAI_API_KEY), texte incrusté.
// Le résultat est gardé dans data/analysis/<id vidéo>/ pour les relances.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../paths.js";
import { ffmpeg, mediaDuration } from "../media.js";
import { fetchTikTokAsset, fetchTikTokVideoDetail } from "../providers/tiktok-page.js";
import type { VideoRow } from "../db.js";

export type SourceAnalysis = {
  frames: string[]; // chemins absolus des images clés
  frameTimes: number[];
  transcript: string | null;
  transcriptSource: "tiktok" | "whisper" | null;
  stickers: string[];
  durationS: number | null;
  videoFile: string | null;
};

const ANALYSIS_DIR = path.join(DATA_DIR, "analysis");
const MAX_BYTES = 150 * 1024 * 1024;

function parseVtt(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  let stamp = "";
  for (const line of lines) {
    const m = line.match(/^(\d\d):(\d\d):(\d\d)[.,]\d+\s+-->/);
    if (m) {
      const s = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      stamp = `[${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}]`;
      continue;
    }
    if (!line.trim() || line === "WEBVTT" || /^\d+$/.test(line) || line.startsWith("NOTE")) continue;
    out.push(stamp ? `${stamp} ${line.trim()}` : line.trim());
    stamp = "";
  }
  return out.join("\n");
}

async function whisper(audioFile: string, language: string | undefined, log: (l: string) => void): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(audioFile)]), "audio.mp3");
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
    form.append("response_format", "verbose_json");
    if (language && language !== "auto") form.append("language", language);
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!r.ok) throw new Error(`OpenAI a répondu ${r.status}`);
    const j = (await r.json()) as { text?: string; segments?: { start: number; text: string }[] };
    if (j.segments?.length) {
      return j.segments.map((s) => `[${Math.floor(s.start / 60)}:${String(Math.floor(s.start % 60)).padStart(2, "0")}] ${s.text.trim()}`).join("\n");
    }
    return j.text ?? null;
  } catch (e) {
    log(`transcription : ${(e as Error).message}`);
    return null;
  }
}

/** Fichier mp4 de la vidéo source, téléchargé une fois dans data/analysis/<id>/ (lecteur intégré et analyse). */
export async function ensureSourceFile(video: VideoRow, log: (l: string) => void = () => {}): Promise<string | null> {
  const dir = path.join(ANALYSIS_DIR, String(video.id));
  const mp4 = path.join(dir, "source.mp4");
  if (fs.existsSync(mp4) && fs.statSync(mp4).size > 0) return mp4;
  if (video.source === "demo" || !/tiktok\.com/.test(video.url)) return null;
  fs.mkdirSync(dir, { recursive: true });
  try {
    const detail = await fetchTikTokVideoDetail(video.url, video.source);
    if (!detail.playAddr) return null;
    const r = await fetchTikTokAsset(detail.playAddr, detail.cookies);
    if (!r.ok) throw new Error(`TikTok a répondu ${r.status}`);
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new Error("fichier trop gros");
    const tmp = mp4 + ".part";
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    fs.renameSync(tmp, mp4);
    return mp4;
  } catch (e) {
    log(`vidéo source : ${(e as Error).message}`);
    return null;
  }
}

export async function analyzeSource(video: VideoRow, log: (l: string) => void, onProgress?: (p: number) => void): Promise<SourceAnalysis> {
  const dir = path.join(ANALYSIS_DIR, String(video.id));
  const cacheFile = path.join(dir, "analysis.json");
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as SourceAnalysis;
      if (cached.frames.every((f) => fs.existsSync(f))) {
        log("analyse : résultat déjà en cache");
        return cached;
      }
    } catch {
      // cache illisible : on refait
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  const result: SourceAnalysis = { frames: [], frameTimes: [], transcript: null, transcriptSource: null, stickers: [], durationS: video.duration_s, videoFile: null };

  if (video.source === "demo" || !/tiktok\.com/.test(video.url)) {
    log("analyse : pas de vidéo source téléchargeable");
    return result;
  }

  let detail: Awaited<ReturnType<typeof fetchTikTokVideoDetail>>;
  try {
    detail = await fetchTikTokVideoDetail(video.url, video.source);
  } catch (e) {
    log(`analyse : page TikTok : ${(e as Error).message}`);
    return result;
  }
  result.stickers = detail.stickers;
  onProgress?.(0.2);

  // Sous-titres automatiques TikTok : la transcription gratuite.
  const sub = detail.subtitles.find((s) => s.format === "webvtt") ?? detail.subtitles[0];
  if (sub) {
    try {
      const r = await fetchTikTokAsset(sub.url, detail.cookies);
      if (r.ok) {
        const text = parseVtt(await r.text());
        if (text.trim()) {
          result.transcript = text;
          result.transcriptSource = "tiktok";
          log(`analyse : sous-titres TikTok (${sub.lang}, ${text.split("\n").length} lignes)`);
        }
      }
    } catch (e) {
      log(`analyse : sous-titres : ${(e as Error).message}`);
    }
  }
  onProgress?.(0.35);

  // Vidéo : images clés (et audio pour Whisper si pas de sous-titres).
  if (detail.playAddr) {
    const mp4 = path.join(dir, "source.mp4");
    try {
      const r = await fetchTikTokAsset(detail.playAddr, detail.cookies);
      if (!r.ok) throw new Error(`TikTok a répondu ${r.status}`);
      const len = Number(r.headers.get("content-length") ?? 0);
      if (len > MAX_BYTES) throw new Error("fichier trop gros");
      fs.writeFileSync(mp4, Buffer.from(await r.arrayBuffer()));
      result.videoFile = mp4;
      const duration = (await mediaDuration(mp4)) ?? video.duration_s ?? 30;
      result.durationS = duration;
      const n = Math.min(10, Math.max(4, Math.round(duration / 6)));
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) / n) * duration;
        const out = path.join(dir, `frame-${i}.jpg`);
        await ffmpeg(["-ss", t.toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", out]);
        if (fs.existsSync(out)) {
          result.frames.push(out);
          result.frameTimes.push(Math.round(t));
        }
        onProgress?.(0.35 + 0.4 * ((i + 1) / n));
      }
      log(`analyse : ${result.frames.length} images clés sur ${Math.round(duration)} s`);
      if (!result.transcript && process.env.OPENAI_API_KEY) {
        const audio = path.join(dir, "audio.mp3");
        await ffmpeg(["-i", mp4, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audio]);
        const text = await whisper(audio, undefined, log);
        if (text) {
          result.transcript = text;
          result.transcriptSource = "whisper";
          log("analyse : transcription Whisper");
        }
      }
    } catch (e) {
      log(`analyse : vidéo : ${(e as Error).message}`);
    }
  }
  if (!result.transcript) log("analyse : pas de transcription (pas de sous-titres TikTok" + (process.env.OPENAI_API_KEY ? ")" : ", ni OPENAI_API_KEY pour Whisper)"));
  fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
  onProgress?.(1);
  return result;
}
