// Idées de vidéos à tourner : le modèle lit les vidéos qui marchent dans la niche
// (légendes, hashtags, durées, comptes, chiffres) et propose des vidéos à faire.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db, getSettings } from "./db.js";
import { listCards, type VideoCard } from "./metrics.js";

const IdeaSchema = z.object({
  title: z.string().describe("Titre court de l'idée (une ligne)"),
  hook: z.string().describe("Accroche des 2 premières secondes : ce qu'on voit et ce qu'on entend ou lit à l'écran"),
  format: z.string().describe("Format : sketch, face caméra, montage, POV, duo, réaction, tuto, défi…"),
  durationS: z.number().int().min(5).max(180).describe("Durée conseillée en secondes"),
  script: z.array(z.string()).min(2).max(8).describe("Déroulé en 2 à 8 étapes courtes, prêtes à tourner"),
  why: z.string().describe("Pourquoi ça devrait marcher, en s'appuyant sur les vidéos sources (chiffres, mécanique)"),
  hashtags: z.array(z.string()).max(8),
  basedOn: z.array(z.number().int()).max(3).describe("Numéros des vidéos sources qui inspirent l'idée (liste fournie), vide si idée originale"),
  difficulty: z.enum(["facile", "moyen", "costaud"]),
});
const IdeasSchema = z.object({ ideas: z.array(IdeaSchema).min(3).max(20) });
export type Idea = z.infer<typeof IdeaSchema> & { sources: { id: number; handle: string; url: string; cover: string | null; views: number }[] };
export type IdeasResult = { at: number; days: number; count: number; theme: string; ideas: Idea[]; sourcesCount: number };

const SYSTEM = `Tu es un directeur créatif TikTok francophone. On te donne les vidéos qui marchent en ce moment dans une niche
(légendes, hashtags, durée, vues, vues par heure, engagement). Tu proposes des vidéos NOUVELLES à tourner, faciles à faire
avec un téléphone, qui reprennent les mécaniques qui marchent (accroche, rythme, format, sujet) sans copier.
Règles : écris en français, court et concret ; jamais de tiret long ; chaque idée doit être tournable demain ;
varie les formats ; respecte le thème demandé s'il y en a un ; pas de contenu sexuellement explicite, de nudité
ni de contenu interdit par TikTok ; pas de nom de personne privée.`;

const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

export function lastIdeas(): IdeasResult | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ideas'").get() as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as IdeasResult;
  } catch {
    return null;
  }
}

export async function generateIdeas(opts: { days?: number; count?: number; theme?: string }, log: (l: string) => void): Promise<IdeasResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquante dans .env : impossible de générer des idées");
  const days = opts.days ?? 7;
  const count = Math.min(20, Math.max(3, opts.count ?? 8));
  const theme = (opts.theme ?? "").trim();
  const period = days <= 1 ? "24h" : days <= 3 ? "3d" : days <= 7 ? "7d" : "all";
  let cards = listCards({ view: "viral", period, duration: "all", sort: "score", unfollowed: true, q: "" });
  if (cards.length < 8) cards = cards.concat(listCards({ view: "all", period, duration: "all", sort: "views", unfollowed: true, q: "" }).filter((c) => !cards.some((x) => x.id === c.id)));
  cards = cards.filter((c) => c.source !== "demo").slice(0, 30);
  if (!cards.length) throw new Error("Aucune vidéo relevée sur la période : lance une découverte d'abord");

  const settings = getSettings();
  const lines = cards.map(
    (c, i) =>
      `${i + 1}. @${c.account.handle} · ${c.durationS ?? "?"} s · ${fmt(c.metrics.views)} vues · ${fmt(c.metrics.viewsPerHour ?? 0)} vues/h · engagement ${c.metrics.engagement?.toFixed(1) ?? "?"} %\n   Légende : ${(c.caption || "(vide)").slice(0, 220)}\n   Hashtags : ${c.hashtags.slice(0, 10).map((h) => "#" + h).join(" ") || "(aucun)"}${c.music ? `\n   Musique : ${c.music}` : ""}`,
  );
  const text = [
    `Niche surveillée : hashtags ${settings.hashtags.map((h) => "#" + h).join(" ") || "(aucun)"}${settings.keywords.length ? ` ; recherches « ${settings.keywords.join(" », « ")} »` : ""}.`,
    theme ? `Thème imposé pour les idées : ${theme}.` : "",
    `Vidéos qui marchent sur les ${days} derniers jours (${cards.length}) :`,
    lines.join("\n"),
    `Propose ${count} idées de vidéos à tourner. Pour chaque idée, cite les numéros des vidéos sources qui l'inspirent.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  const model = process.env.NICHE_MODEL || "claude-opus-5-5";
  log(`idées : appel ${model} sur ${cards.length} vidéos`);
  const response = await client.messages.parse({
    model,
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
    output_config: { effort: "medium", format: zodOutputFormat(IdeasSchema) },
  });
  if (response.stop_reason === "refusal") throw new Error("Le modèle a refusé" + (response.stop_details?.explanation ? " : " + response.stop_details.explanation : ""));
  const out = response.parsed_output;
  if (!out) throw new Error("Réponse du modèle illisible");
  const src = (c: VideoCard) => ({ id: c.id, handle: c.account.handle, url: c.url, cover: c.cover, views: c.metrics.views });
  const ideas: Idea[] = out.ideas.slice(0, count).map((i) => ({
    ...i,
    hashtags: i.hashtags.map((h) => h.replace(/^#/, "").trim()).filter(Boolean),
    sources: i.basedOn.map((n) => cards[n - 1]).filter(Boolean).map(src),
  }));
  const result: IdeasResult = { at: Math.floor(Date.now() / 1000), days, count, theme, ideas, sourcesCount: cards.length };
  db.prepare("INSERT INTO settings(key, value) VALUES('ideas', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(result));
  log(`idées : ${ideas.length} proposées`);
  return result;
}
