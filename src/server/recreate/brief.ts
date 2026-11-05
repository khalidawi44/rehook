// Étape 1 de « Recréer cette vidéo » : analyser la vidéo source et écrire une
// variante (même format, même niche, même rythme, histoire différente) avec Claude.
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { VideoCard } from "../metrics.js";

export const SceneSchema = z.object({
  narration: z.string().describe("Texte lu par la voix off, 1 à 3 phrases courtes"),
  onScreen: z.string().describe("Texte affiché à l'écran, 3 à 8 mots, percutant"),
  visual: z.string().describe("Description précise de l'image à générer pour cette scène, style compris"),
  keywords: z.array(z.string()).describe("2 à 4 mots-clés en anglais pour chercher une photo libre de droits"),
  seconds: z.number().describe("Durée visée de la scène en secondes"),
});

export const BriefSchema = z.object({
  language: z.string().describe("Code langue ISO 639-1 de la vidéo (es, en, fr...)"),
  niche: z.string().describe("La niche en 2 à 5 mots"),
  format: z.string().describe("Le format repéré (ex : histoire triste IA en 3 actes, astuce rapide, fait choquant)"),
  whyItWorks: z.string().describe("Pourquoi la vidéo source marche, en 2 ou 3 phrases concrètes"),
  hook: z.string().describe("Accroche des 2 premières secondes, en gros à l'écran"),
  title: z.string().describe("Titre court de la nouvelle vidéo"),
  scenes: z.array(SceneSchema).describe("Entre 4 et 9 scènes, chronologiques"),
  cta: z.string().describe("Appel à l'action final, une phrase"),
  caption: z.string().describe("Légende prête à coller, sans hashtags"),
  hashtags: z.array(z.string()).describe("8 à 15 hashtags sans le #"),
  style: z.object({
    palette: z.array(z.string()).describe("3 couleurs hexadécimales dominantes, fond puis accents"),
    mood: z.string().describe("Ambiance en quelques mots"),
    voice: z.enum(["female", "male"]).describe("Genre de voix off qui colle au format"),
  }),
});

export type Brief = z.infer<typeof BriefSchema>;

export type BriefOptions = {
  twist?: string; // consigne libre de l'utilisateur
  language?: string; // forcer la langue de sortie
  targetSeconds?: number;
  sceneCount?: number;
};

const SYSTEM = `Tu es un créateur de contenu court (TikTok, Reels, Shorts) qui analyse une vidéo virale
et en écrit une nouvelle version : même niche, même format, même structure et même rythme,
mais une histoire ou un angle différent, pour que la nouvelle vidéo soit originale et non une copie.

Règles :
- Tu écris dans la langue de la vidéo source, sauf consigne contraire.
- L'accroche (hook) tient en moins de 10 mots et crée une tension ou une curiosité immédiate.
- Chaque scène a un texte lu (narration) naturel, parlé, sans jargon, et un texte à l'écran très court.
- La somme des durées des scènes doit être proche de la durée visée.
- Les descriptions visuelles sont cohérentes entre elles (mêmes personnages, même univers, même style)
  et reprennent le style visuel repéré sur la miniature si elle est fournie.
- Jamais de nom de personne réelle, jamais de marque, jamais de contenu choquant ou trompeur.
- Pas de tiret long dans les textes. Pas de formules creuses. Court et concret.`;

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "inconnu";
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}

export async function writeBrief(card: VideoCard, coverPath: string | null, opts: BriefOptions, log: (l: string) => void): Promise<Brief> {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  const model = process.env.NICHE_MODEL || "claude-opus-5-5";
  const target = opts.targetSeconds ?? Math.min(90, Math.max(20, card.durationS ?? 45));
  const scenes = opts.sceneCount ?? Math.min(9, Math.max(4, Math.round(target / 8)));

  const facts = [
    `Compte : @${card.account.handle}${card.account.nickname ? ` (${card.account.nickname})` : ""}`,
    `Légende : ${card.caption || "(vide)"}`,
    `Hashtags : ${card.hashtags.map((h) => "#" + h).join(" ") || "(aucun)"}`,
    `Durée : ${card.durationS ?? "inconnue"} s`,
    `Vues : ${fmt(card.metrics.views)} · vues/h : ${fmt(card.metrics.viewsPerHour)} · engagement : ${card.metrics.engagement?.toFixed(1) ?? "?"} %`,
    `Musique : ${card.music ?? "inconnue"}`,
    `Région : ${card.region ?? "inconnue"}`,
  ].join("\n");

  const instructions = [
    `Durée visée : ${target} s, en ${scenes} scènes environ.`,
    opts.language && opts.language !== "auto" ? `Langue de sortie imposée : ${opts.language}.` : "",
    opts.twist ? `Consigne de l'utilisateur : ${opts.twist}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const content: Anthropic.ContentBlockParam[] = [];
  if (coverPath && fs.existsSync(coverPath) && !coverPath.endsWith(".svg")) {
    const ext = coverPath.split(".").pop()?.toLowerCase();
    const media = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    content.push({
      type: "image",
      source: { type: "base64", media_type: media, data: fs.readFileSync(coverPath).toString("base64") },
    });
  }
  content.push({
    type: "text",
    text: `Voici la vidéo source à analyser puis à réinventer.\n\n${facts}\n\n${instructions}\n\nRends le brief complet.`,
  });

  log(`script : appel ${model}`);
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { effort: "medium", format: zodOutputFormat(BriefSchema) },
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Le modèle a refusé ce contenu" + (response.stop_details?.explanation ? " : " + response.stop_details.explanation : ""));
  }
  const brief = response.parsed_output;
  if (!brief) throw new Error("Réponse du modèle illisible");
  if (brief.scenes.length < 3) throw new Error("Brief trop court (moins de 3 scènes)");
  brief.hashtags = brief.hashtags.map((h) => h.replace(/^#/, "").trim()).filter(Boolean);
  log(`script : ${brief.scenes.length} scènes, langue ${brief.language}`);
  return brief;
}
