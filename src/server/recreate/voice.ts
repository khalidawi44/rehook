// Étape 3 : la voix off, une piste par scène. edge (gratuit, sans clé) donne
// aussi le minutage de chaque mot, utilisé pour les sous-titres karaoké.
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { Brief } from "./brief.js";

const execFileP = promisify(execFile);

export type VoiceProvider = "none" | "edge" | "openai" | "elevenlabs" | "piper";

export type Word = { text: string; start: number; end: number };

export type SceneAudio = { file: string | null; durationS: number; words: Word[] };

export function voiceProvider(override?: string): VoiceProvider {
  const p = (override || process.env.NICHE_VOICE || "edge").toLowerCase();
  if (p === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (p === "elevenlabs" && process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) return "elevenlabs";
  if (p === "piper" && process.env.PIPER_MODEL) return "piper";
  if (p === "none") return "none";
  return "edge";
}

const EDGE_VOICES: Record<string, { female: string; male: string }> = {
  fr: { female: "fr-FR-DeniseNeural", male: "fr-FR-HenriNeural" },
  es: { female: "es-ES-ElviraNeural", male: "es-ES-AlvaroNeural" },
  en: { female: "en-US-AriaNeural", male: "en-US-GuyNeural" },
  de: { female: "de-DE-KatjaNeural", male: "de-DE-ConradNeural" },
  it: { female: "it-IT-ElsaNeural", male: "it-IT-DiegoNeural" },
  pt: { female: "pt-BR-FranciscaNeural", male: "pt-BR-AntonioNeural" },
  nl: { female: "nl-NL-ColetteNeural", male: "nl-NL-MaartenNeural" },
  ar: { female: "ar-EG-SalmaNeural", male: "ar-EG-ShakirNeural" },
  tr: { female: "tr-TR-EmelNeural", male: "tr-TR-AhmetNeural" },
  ja: { female: "ja-JP-NanamiNeural", male: "ja-JP-KeitaNeural" },
};

export async function audioDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileP("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

/** Minutage approximatif quand le fournisseur ne donne pas les mots. */
export function spreadWords(text: string, durationS: number, lead = 0.15): Word[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const usable = Math.max(0.5, durationS - lead - 0.2);
  const weights = words.map((w) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = lead;
  return words.map((w, i) => {
    const d = (weights[i] / total) * usable;
    const word = { text: w, start: t, end: t + d };
    t += d;
    return word;
  });
}

function estimateSeconds(text: string, language: string) {
  // Environ 2,6 mots/s en voix off dynamique, un peu moins en espagnol/italien.
  const rate = ["es", "it", "pt"].includes(language) ? 2.4 : 2.6;
  return Math.max(1.5, text.split(/\s+/).filter(Boolean).length / rate + 0.4);
}

async function edgeTts(text: string, language: string, gender: "female" | "male", dir: string): Promise<{ file: string; words: Word[] }> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const voice = process.env.EDGE_VOICE || (EDGE_VOICES[language] ?? EDGE_VOICES.en)[gender];
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const { audioFilePath, metadataFilePath } = await tts.toFile(dir, safe, { rate: process.env.EDGE_RATE || "+8%" });
  tts.close();
  const words: Word[] = [];
  if (metadataFilePath && fs.existsSync(metadataFilePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(metadataFilePath, "utf8")) as unknown;
      const walk = (x: unknown) => {
        if (Array.isArray(x)) return x.forEach(walk);
        if (x && typeof x === "object") {
          const o = x as { Type?: string; Data?: { Offset?: number; Duration?: number; text?: { Text?: string } } };
          if (o.Type === "WordBoundary" && o.Data?.text?.Text) {
            const start = (o.Data.Offset ?? 0) / 1e7;
            words.push({ text: o.Data.text.Text, start, end: start + (o.Data.Duration ?? 0) / 1e7 });
          } else Object.values(o).forEach(walk);
        }
      };
      walk(raw);
    } catch {
      // on retombera sur le minutage approximatif
    }
  }
  return { file: audioFilePath, words };
}

async function openaiTts(text: string, gender: "female" | "male", dest: string) {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || (gender === "female" ? "nova" : "onyx"),
      input: text,
      response_format: "mp3",
    }),
  });
  if (!r.ok) throw new Error(`OpenAI audio a répondu ${r.status} : ${(await r.text()).slice(0, 200)}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

async function elevenlabsTts(text: string, dest: string) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2" }),
  });
  if (!r.ok) throw new Error(`ElevenLabs a répondu ${r.status} : ${(await r.text()).slice(0, 200)}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

function piperTts(text: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.PIPER_BIN || "piper", ["--model", process.env.PIPER_MODEL!, "--output_file", dest]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error("piper : " + err.slice(-300)))));
    p.stdin.end(text);
  });
}

/**
 * Génère la voix de chaque scène dans `dir` (dossier public du rendu).
 * Renvoie fichier (relatif au dossier public), durée et minutage des mots.
 */
export async function makeVoices(
  brief: Brief,
  dir: string,
  relDir: string,
  provider: VoiceProvider,
  log: (l: string) => void,
  onProgress: (i: number, total: number) => void,
): Promise<SceneAudio[]> {
  const out: SceneAudio[] = [];
  for (let i = 0; i < brief.scenes.length; i++) {
    const scene = brief.scenes[i];
    const text = scene.narration.trim();
    const fallbackS = Math.max(scene.seconds || 0, estimateSeconds(text, brief.language));
    if (provider === "none" || !text) {
      out.push({ file: null, durationS: fallbackS, words: spreadWords(text, fallbackS) });
      onProgress(i + 1, brief.scenes.length);
      continue;
    }
    try {
      let file: string;
      let words: Word[] = [];
      if (provider === "edge") {
        const sceneDir = path.join(dir, `voice-${i}`);
        fs.mkdirSync(sceneDir, { recursive: true });
        const r = await edgeTts(text, brief.language, brief.style.voice, sceneDir);
        file = path.join(dir, `voice-${i}.mp3`);
        fs.renameSync(r.file, file);
        fs.rmSync(sceneDir, { recursive: true, force: true });
        words = r.words;
      } else if (provider === "openai") {
        file = path.join(dir, `voice-${i}.mp3`);
        await openaiTts(text, brief.style.voice, file);
      } else if (provider === "elevenlabs") {
        file = path.join(dir, `voice-${i}.mp3`);
        await elevenlabsTts(text, file);
      } else {
        file = path.join(dir, `voice-${i}.wav`);
        await piperTts(text, file);
      }
      const d = (await audioDuration(file)) ?? (words.length ? words[words.length - 1].end + 0.3 : fallbackS);
      if (!words.length) words = spreadWords(text, d);
      out.push({ file: `${relDir}/${path.basename(file)}`, durationS: d, words });
    } catch (e) {
      log(`voix ${i + 1} : ${(e as Error).message}`);
      out.push({ file: null, durationS: fallbackS, words: spreadWords(text, fallbackS) });
    }
    onProgress(i + 1, brief.scenes.length);
  }
  log(`voix : ${out.filter((s) => s.file).length}/${brief.scenes.length} (${provider})`);
  return out;
}
