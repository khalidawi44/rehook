// Étape 1 de « Recréer cette vidéo » : analyser la vidéo source et écrire une
// variante (même format, même niche, même rythme, histoire différente) avec Claude.
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { VideoCard } from "../metrics.js";
import type { SourceAnalysis } from "./analyze.js";

export const SceneSchema = z.object({
  narration: z.string().describe("Texte lu par la voix off, 1 à 3 phrases courtes"),
  onScreen: z.string().describe("Texte affiché à l'écran, 3 à 8 mots, percutant"),
  visual: z.string().describe("Description précise de l'image à générer pour cette scène, style compris"),
  keywords: z.array(z.string()).describe("2 à 4 mots-clés en anglais pour chercher une photo libre de droits"),
  stockQuery: z
    .string()
    .describe("Requête en anglais, 3 à 6 mots, décrivant le plan de banque d'images vidéo qui ressemble le plus à ce que montre la source pour cette scène : lieu, personnes, action, ambiance (ex : two women laughing in car)"),
  stockAlternatives: z.array(z.string()).describe("2 requêtes de repli en anglais, plus générales, pour le même plan"),
  seconds: z.number().describe("Durée visée de la scène en secondes"),
});

export const BriefSchema = z.object({
  sourceSummary: z
    .string()
    .describe("Ce qui se passe dans la vidéo source, plan par plan, avec la chute ou le ressort comique, en 4 à 8 phrases"),
  mechanism: z.string().describe("Le mécanisme qui fait marcher la vidéo (type de blague, structure, rythme), en 1 ou 2 phrases"),
  mode: z
    .enum(["auto", "tournage"])
    .describe("auto si la vidéo peut se rendre en images, texte et voix off ; tournage si c'est un sketch joué par des personnes à filmer"),
  language: z.string().describe("Code langue ISO 639-1 de la vidéo (es, en, fr...)"),
  niche: z.string().describe("La niche en 2 à 5 mots"),
  format: z.string().describe("Le format repéré (ex : histoire triste IA en 3 actes, astuce rapide, fait choquant)"),
  whyItWorks: z.string().describe("Pourquoi la vidéo source marche, en 2 ou 3 phrases concrètes"),
  hook: z.string().describe("Accroche des 2 premières secondes, en gros à l'écran"),
  title: z.string().describe("Titre court de la nouvelle vidéo"),
  scenes: z.array(SceneSchema).describe("Entre 4 et 9 scènes, chronologiques"),
  cta: z.string().describe("Appel à l'action final, une phrase"),
  shootingTips: z.string().describe("Si mode tournage : comment filmer (cadrage, acteurs, accessoires, durée de chaque plan). Sinon vide"),
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

Tu reçois ce qui existe de la vidéo source : images clés dans l'ordre, transcription (ce qui est dit),
texte incrusté à l'écran, légende, hashtags, stats. Commence par comprendre précisément ce qui se passe
et pourquoi ça fait rire ou retient l'attention, puis réinvente une version qui garde EXACTEMENT le même
mécanisme (même type de blague ou de tension, même structure, même rythme, même longueur, même ton,
même genre de personnages et de décor) avec une situation nouvelle.

Règles :
- Tu écris dans la langue parlée dans la vidéo source (transcription), sauf consigne contraire.
- Si la source est un sketch joué par des gens (dialogues, mimiques, situation filmée), mode = tournage :
  les scènes décrivent ce qu'il faut filmer et dire, plan par plan, comme un script à tourner.
- Si la source est une histoire racontée, un texte sur fond, une animation, un montage d'images, mode = auto.
- L'accroche (hook) tient en moins de 10 mots et crée une tension ou une curiosité immédiate.
- Chaque scène a un texte lu (narration) naturel, parlé, sans jargon, et un texte à l'écran très court.
- La somme des durées des scènes doit être proche de la durée visée.
- Les descriptions visuelles sont cohérentes entre elles (mêmes personnages, même univers, même style)
  et reprennent le style visuel repéré sur la miniature si elle est fournie.
- Pour chaque scène, stockQuery décrit le plan réel de la source (regarde les images clés : décor, nombre de
  personnes, genre, âge approximatif, action, cadrage, lumière) en termes de banque d'images vidéo,
  pour retrouver un clip libre de droits qui lui ressemble. Concret et filmable, jamais abstrait.
- Jamais de nom de personne réelle, jamais de marque, jamais de contenu choquant ou trompeur.
- Pas de tiret long dans les textes. Pas de formules creuses. Court et concret.`;

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "inconnu";
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}

export async function writeBrief(
  card: VideoCard,
  coverPath: string | null,
  opts: BriefOptions,
  log: (l: string) => void,
  analysis?: SourceAnalysis,
): Promise<Brief> {
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
  const frames = analysis?.frames.filter((f) => fs.existsSync(f)) ?? [];
  if (frames.length) {
    content.push({ type: "text", text: `Images clés de la vidéo source, dans l'ordre (${frames.length} sur ${Math.round(analysis?.durationS ?? 0)} s) :` });
    frames.forEach((f, i) => {
      content.push({ type: "text", text: `Image ${i + 1} (vers ${analysis?.frameTimes[i] ?? "?"} s) :` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(f).toString("base64") } });
    });
  } else if (coverPath && fs.existsSync(coverPath) && !coverPath.endsWith(".svg")) {
    const ext = coverPath.split(".").pop()?.toLowerCase();
    const media = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    content.push({
      type: "image",
      source: { type: "base64", media_type: media, data: fs.readFileSync(coverPath).toString("base64") },
    });
  }
  const extra = [
    analysis?.transcript ? `Transcription de la vidéo source (${analysis.transcriptSource === "tiktok" ? "sous-titres automatiques" : "Whisper"}) :\n${analysis.transcript}` : "Pas de transcription disponible : appuie-toi sur les images, le texte incrusté et la légende.",
    analysis?.stickers.length ? `Texte incrusté à l'écran : ${analysis.stickers.map((t) => `« ${t} »`).join(" / ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  content.push({
    type: "text",
    text: `Voici la vidéo source à analyser puis à réinventer.\n\n${facts}\n\n${extra}\n\n${instructions}\n\nRends le brief complet.`,
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
