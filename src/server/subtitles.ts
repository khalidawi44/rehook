// Sous-titres et textes à l'écran : transcription (OpenAI Whisper si clé, sinon
// Whisper local via transformers.js) et génération d'un fichier ASS incrusté
// par ffmpeg (libass), avec karaoké mot à mot.
import fs from "node:fs";
import path from "node:path";
import { ffmpeg } from "./media.js";
import { DATA_DIR } from "./paths.js";

export type Word = { text: string; start: number; end: number };
export type Cue = { id: string; start: number; end: number; text: string; words: Word[] };

export type SubtitleStyle = {
  mode: "karaoke" | "block";
  position: "bottom" | "center" | "top";
  size: number; // en pixels pour une hauteur de 1920
  font: string;
  color: string; // #rrggbb
  highlight: string; // #rrggbb (mot en cours, karaoké)
  outline: string; // #rrggbb
  box: boolean; // fond semi-transparent
  uppercase: boolean;
  maxWords: number;
};

export type TextItem = {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number; // 0 à 1
  y: number; // 0 à 1
  size: number;
  color: string;
  font: string;
  animation: "none" | "pop" | "fade";
};

export const DEFAULT_STYLE: SubtitleStyle = {
  mode: "karaoke",
  position: "bottom",
  size: 84,
  font: "Anton",
  color: "#ffffff",
  highlight: "#facc15",
  outline: "#000000",
  box: false,
  uppercase: true,
  maxWords: 4,
};

// ---- Transcription -----------------------------------------------------------

export type TranscribeResult = { words: Word[]; provider: "openai" | "local"; language?: string };

async function transcribeOpenAI(audio: string, language?: string): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(audio)]), "audio.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (language && language !== "auto") form.append("language", language);
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  if (!r.ok) throw new Error(`OpenAI a répondu ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { language?: string; words?: { word: string; start: number; end: number }[]; text?: string };
  const words = (j.words ?? []).map((w) => ({ text: w.word.trim(), start: w.start, end: w.end })).filter((w) => w.text);
  return { words, provider: "openai", language: j.language };
}

let pipelinePromise: Promise<unknown> | null = null;

async function localPipeline(log: (l: string) => void) {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const tf = await import("@huggingface/transformers");
      tf.env.cacheDir = path.join(DATA_DIR, "models");
      fs.mkdirSync(tf.env.cacheDir, { recursive: true });
      const model = process.env.NICHE_WHISPER_MODEL || "onnx-community/whisper-base_timestamped";
      log(`transcription locale : chargement de ${model} (téléchargé une fois)`);
      return tf.pipeline("automatic-speech-recognition", model, { dtype: "q8" } as never);
    })().catch((e) => {
      pipelinePromise = null;
      throw e;
    });
  }
  return pipelinePromise;
}

async function transcribeLocal(audio: string, language: string | undefined, log: (l: string) => void): Promise<TranscribeResult> {
  const pcm = audio + ".pcm";
  await ffmpeg(["-i", audio, "-ac", "1", "-ar", "16000", "-f", "f32le", pcm]);
  const buf = fs.readFileSync(pcm);
  fs.rmSync(pcm, { force: true });
  const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const asr = (await localPipeline(log)) as (input: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>;
  const out = await asr(samples, {
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
    language: language && language !== "auto" ? language : undefined,
    task: "transcribe",
  });
  const words: Word[] = [];
  let last = 0;
  for (const c of out.chunks ?? []) {
    const text = c.text.trim();
    if (!text) continue;
    const start = c.timestamp[0] ?? last;
    const end = c.timestamp[1] ?? start + 0.3;
    words.push({ text, start, end });
    last = end;
  }
  return { words, provider: "local" };
}

export async function transcribeAudio(audio: string, language: string | undefined, log: (l: string) => void): Promise<TranscribeResult> {
  if (process.env.OPENAI_API_KEY && (process.env.NICHE_TRANSCRIBE ?? "auto") !== "local") return transcribeOpenAI(audio, language);
  return transcribeLocal(audio, language, log);
}

/** Regroupe les mots en sous-titres courts. */
export function wordsToCues(words: Word[], maxWords = 4, maxSeconds = 2.2): Cue[] {
  const cues: Cue[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({ id: Math.random().toString(36).slice(2, 9), start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" "), words: cur });
    cur = [];
  };
  for (const w of words) {
    const tooLong = cur.length >= maxWords || (cur.length && w.end - cur[0].start > maxSeconds);
    const gap = cur.length && w.start - cur[cur.length - 1].end > 0.8;
    const punct = cur.length && /[.!?…]$/.test(cur[cur.length - 1].text);
    if (tooLong || gap || punct) flush();
    cur.push(w);
  }
  flush();
  return cues;
}

/** Répartit un texte modifié sur la durée du sous-titre (mots sans minutage). */
export function spreadCue(cue: Cue): Word[] {
  const parts = cue.text.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const known = cue.words.length === parts.length && cue.words.every((w, i) => w.text === parts[i]);
  if (known) return cue.words;
  const dur = Math.max(0.3, cue.end - cue.start);
  const weights = parts.map((p) => Math.max(2, p.length + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = cue.start;
  return parts.map((p, i) => {
    const d = (weights[i] / total) * dur;
    const w = { text: p, start: t, end: t + d };
    t += d;
    return w;
  });
}

// ---- ASS ---------------------------------------------------------------------

const assColor = (hex: string, alpha = 0) => {
  const m = hex.replace("#", "").padEnd(6, "0");
  const r = m.slice(0, 2);
  const g = m.slice(2, 4);
  const b = m.slice(4, 6);
  return `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${b}${g}${r}`.toUpperCase();
};

const assTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
};

const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");

export function buildAss(opts: { width: number; height: number; cues: Cue[]; style: SubtitleStyle; texts: TextItem[] }): string {
  const { width: W, height: H, style, texts } = opts;
  const scale = H / 1920;
  const size = Math.round(style.size * scale);
  const margin = Math.round(40 * scale);
  const marginV = style.position === "bottom" ? Math.round(420 * scale) : style.position === "top" ? Math.round(260 * scale) : 0;
  const align = style.position === "bottom" ? 2 : style.position === "top" ? 8 : 5;
  const outline = Math.max(1, Math.round(4 * scale));
  const shadow = Math.round(3 * scale);
  const lines: string[] = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Karaoké : PrimaryColour = mot déjà chanté / en cours, SecondaryColour = mot à venir.
    `Style: Sub,${style.font},${size},${assColor(style.mode === "karaoke" ? style.highlight : style.color)},${assColor(style.color)},${assColor(style.outline)},${assColor("#000000", style.box ? 0x60 : 0x00)},-1,0,0,0,100,100,0,0,${style.box ? 3 : 1},${outline},${shadow},${align},${margin},${margin},${marginV},1`,
    `Style: Txt,${style.font},${Math.round(72 * scale)},${assColor("#ffffff")},${assColor("#ffffff")},${assColor("#000000")},${assColor("#000000", 0x00)},-1,0,0,0,100,100,0,0,1,${outline},${shadow},5,${margin},${margin},0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  for (const cue of opts.cues) {
    const words = spreadCue(cue);
    if (!words.length) continue;
    const start = Math.max(0, cue.start);
    const end = Math.max(start + 0.2, cue.end);
    let text: string;
    if (style.mode === "karaoke") {
      // Chaque mot reçoit sa durée en centièmes ; le premier commence dès l'ouverture.
      let t = start;
      text = words
        .map((w) => {
          const wStart = Math.max(t, w.start);
          const lead = Math.round((wStart - t) * 100);
          const dur = Math.max(1, Math.round((Math.max(w.end, wStart + 0.05) - wStart) * 100));
          t = wStart + dur / 100;
          const body = esc(style.uppercase ? w.text.toUpperCase() : w.text);
          return (lead > 0 ? `{\\k${lead}}` : "") + `{\\kf${dur}}${body}`;
        })
        .join(" ");
    } else {
      text = esc(style.uppercase ? cue.text.toUpperCase() : cue.text);
    }
    const pop = `{\\fad(80,80)}`;
    lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Sub,,0,0,0,,${pop}${text}`);
  }
  for (const t of texts) {
    if (!t.text.trim() || t.end <= t.start) continue;
    const x = Math.round(t.x * W);
    const y = Math.round(t.y * H);
    const fs = Math.round(t.size * scale);
    const anim = t.animation === "pop" ? `{\\t(0,150,\\fscx100\\fscy100)\\fscx60\\fscy60}` : t.animation === "fade" ? `{\\fad(250,250)}` : "";
    lines.push(`Dialogue: 1,${assTime(t.start)},${assTime(t.end)},Txt,,0,0,0,,{\\pos(${x},${y})\\fn${t.font || style.font}\\fs${fs}\\1c${assColor(t.color)}}${anim}${esc(t.text)}`);
  }
  return lines.join("\n") + "\n";
}
