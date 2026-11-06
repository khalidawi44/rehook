// Traduction : brief d'une recréation (doublage dans une autre langue) et sous-titres d'un montage.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Brief } from "./recreate/brief.js";
import type { Cue } from "./subtitles.js";

function client() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
}

const LANG_NAMES: Record<string, string> = { fr: "français", en: "anglais", es: "espagnol", de: "allemand", it: "italien", pt: "portugais", nl: "néerlandais", ar: "arabe", tr: "turc", ja: "japonais" };

const BriefTranslationSchema = z.object({
  title: z.string(),
  hook: z.string(),
  scenes: z.array(z.object({ narration: z.string(), onScreen: z.string() })),
  cta: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
});

export async function translateBrief(brief: Brief, to: string, log: (l: string) => void): Promise<Brief> {
  const lang = LANG_NAMES[to] ?? to;
  log(`traduction du script en ${lang}`);
  const r = await client().messages.parse({
    model: process.env.NICHE_MODEL || "claude-opus-5-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: `Tu traduis le script d'une vidéo courte en ${lang}, en gardant le même nombre de scènes, le même rythme et le même ton parlé. Adapte les expressions et les hashtags à ce public (pas de mot à mot), garde les textes à l'écran très courts. Pas de tiret long.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ title: brief.title, hook: brief.hook, scenes: brief.scenes.map((s) => ({ narration: s.narration, onScreen: s.onScreen })), cta: brief.cta, caption: brief.caption, hashtags: brief.hashtags }),
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(BriefTranslationSchema) },
  });
  const t = r.parsed_output;
  if (!t || t.scenes.length !== brief.scenes.length) throw new Error("Traduction incomplète");
  return {
    ...brief,
    language: to,
    title: t.title,
    hook: t.hook,
    cta: t.cta,
    caption: t.caption,
    hashtags: t.hashtags.map((h) => h.replace(/^#/, "")),
    scenes: brief.scenes.map((s, i) => ({ ...s, narration: t.scenes[i].narration, onScreen: t.scenes[i].onScreen })),
  };
}

const CuesTranslationSchema = z.object({ lines: z.array(z.string()) });

export async function translateCues(cues: Cue[], to: string, log: (l: string) => void): Promise<Cue[]> {
  if (!cues.length) return cues;
  const lang = LANG_NAMES[to] ?? to;
  log(`traduction de ${cues.length} sous-titres en ${lang}`);
  const r = await client().messages.parse({
    model: process.env.NICHE_MODEL || "claude-opus-5-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: `Tu traduis des sous-titres de vidéo courte en ${lang}, ligne par ligne, même nombre de lignes, chaque ligne aussi courte que l'originale (ce sont des sous-titres qui défilent vite). Ton parlé, naturel.`,
    messages: [{ role: "user", content: JSON.stringify({ lines: cues.map((c) => c.text) }) }],
    output_config: { effort: "low", format: zodOutputFormat(CuesTranslationSchema) },
  });
  const lines = r.parsed_output?.lines;
  if (!lines || lines.length !== cues.length) throw new Error("Traduction incomplète");
  return cues.map((c, i) => ({ ...c, text: lines[i], words: [] }));
}
