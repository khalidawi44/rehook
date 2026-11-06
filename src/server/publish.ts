// Publication : textes prêts pour chaque réseau (Claude), envoi en un clic via
// Postiz (TikTok, Instagram, YouTube, X, Facebook, Threads, LinkedIn…) et
// partage depuis le téléphone pour le reste (Snapchat).
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db, type JobRow } from "./db.js";
import { DATA_DIR, RENDERS_DIR, ROOT } from "./paths.js";
import { getMontage } from "./montage.js";

const execFileP = promisify(execFile);

export type PublishSource = { kind: "montage" | "render" | "capture"; id: string };

export const TextsSchema = z.object({
  tiktok: z.object({ caption: z.string().describe("Légende TikTok, 1 à 3 lignes, accroche en premier, sans les hashtags"), hashtags: z.array(z.string()).describe("5 à 8 hashtags sans #") }),
  instagram: z.object({ caption: z.string().describe("Légende Instagram Reels, un peu plus développée, sans les hashtags"), hashtags: z.array(z.string()).describe("8 à 15 hashtags sans #") }),
  youtube: z.object({ title: z.string().describe("Titre YouTube Shorts, moins de 80 caractères"), description: z.string().describe("Description, 2 à 4 lignes"), tags: z.array(z.string()).describe("5 à 10 mots-clés") }),
  x: z.object({ text: z.string().describe("Post X, moins de 250 caractères, hashtags compris (2 max)") }),
  facebook: z.object({ text: z.string().describe("Texte Facebook Reels, 1 à 3 lignes, 3 hashtags max") }),
  threads: z.object({ text: z.string().describe("Post Threads, moins de 400 caractères") }),
  snapchat: z.object({ caption: z.string().describe("Légende Spotlight, très courte, 3 à 5 hashtags inclus") }),
});
export type Texts = z.infer<typeof TextsSchema>;

export type Publication = {
  key: string;
  source: PublishSource;
  file: string;
  url: string;
  createdAt: number;
  updatedAt: number;
  language: string;
  hint: string;
  context: string;
  texts: Texts | null;
  sent: { at: number; channel: string; provider: string; status: "ok" | "error"; detail: string }[];
};

const FILE = path.join(DATA_DIR, "publications.json");

function readAll(): Publication[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Publication[];
  } catch {
    return [];
  }
}
function writeAll(list: Publication[]) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

export function listPublications(): Publication[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getPublication(key: string): Publication | null {
  return readAll().find((p) => p.key === key) ?? null;
}
export function savePublication(p: Publication) {
  const list = readAll().filter((x) => x.key !== p.key);
  list.push(p);
  writeAll(list);
}

/** Fichier vidéo et contexte textuel d'une source. */
export function resolvePublishSource(src: PublishSource): { file: string; url: string; context: string } {
  if (src.kind === "render") {
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(Number(src.id)) as JobRow | undefined;
    if (!job?.output_file) throw new Error("Recréation introuvable ou pas encore rendue");
    const file = path.join(RENDERS_DIR, job.output_file);
    let context = "";
    try {
      const b = JSON.parse(job.brief ?? "{}") as { title?: string; hook?: string; caption?: string; hashtags?: string[]; sourceSummary?: string; mechanism?: string; language?: string; scenes?: { narration: string }[] };
      context = [
        b.title ? `Titre : ${b.title}` : "",
        b.hook ? `Accroche : ${b.hook}` : "",
        b.sourceSummary ? `Ce qui se passe : ${b.sourceSummary}` : "",
        b.mechanism ? `Mécanisme : ${b.mechanism}` : "",
        b.scenes?.length ? `Narration : ${b.scenes.map((s) => s.narration).join(" ")}` : "",
        b.caption ? `Légende proposée au script : ${b.caption}` : "",
        b.hashtags?.length ? `Hashtags proposés : ${b.hashtags.join(", ")}` : "",
        b.language ? `Langue : ${b.language}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch {
      // brief illisible : contexte vide
    }
    return { file, url: `/renders/${job.output_file}`, context };
  }
  if (src.kind === "montage") {
    const m = getMontage(src.id);
    if (!m?.output) throw new Error("Export de montage introuvable (les exports ne survivent pas à un redémarrage : réexporte)");
    return { file: m.output, url: m.url!, context: `Montage « ${m.name} », ${Math.round(m.durationS)} s.` };
  }
  const f = path.join(DATA_DIR, "public", "captures", `${path.basename(src.id)}.mp4`);
  if (!fs.existsSync(f)) throw new Error("Enregistrement introuvable");
  return { file: f, url: `/public/captures/${path.basename(src.id)}.mp4`, context: "Enregistrement d'écran." };
}

const SYSTEM = `Tu écris les textes de publication d'une vidéo courte pour chaque réseau, dans la langue demandée.
Règles : accroche en première ligne, phrases courtes, concret, ton de créateur (pas de communiqué),
aucune formule creuse, pas de tiret long, pas de majuscules partout, emojis avec parcimonie (0 à 3).
Hashtags pertinents au contenu, puis 2 ou 3 génériques de la niche. Pas de hashtag inventé ou interdit.
Respecte les limites : TikTok et Instagram 2200 caractères, X 250, YouTube titre 80, Snapchat très court.`;

export async function generateTexts(p: Publication, extra: string, log: (l: string) => void): Promise<Texts> {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  const lang = p.language && p.language !== "auto" ? p.language : "fr";
  const prompt = [
    `Langue de sortie : ${lang}.`,
    `Contexte de la vidéo :\n${p.context || "(aucun : appuie-toi sur la consigne)"}`,
    extra ? `Mots du créateur sur cette vidéo : ${extra}` : "",
    p.hint ? `Consigne : ${p.hint}` : "",
    "Rends les textes pour tous les réseaux.",
  ]
    .filter(Boolean)
    .join("\n\n");
  log("textes : appel du modèle");
  const r = await client.messages.parse({
    model: process.env.NICHE_MODEL || "claude-opus-5-5",
    max_tokens: 6000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort: "low", format: zodOutputFormat(TextsSchema) },
  });
  if (r.stop_reason === "refusal") throw new Error("Le modèle a refusé ce contenu");
  if (!r.parsed_output) throw new Error("Réponse du modèle illisible");
  const t = r.parsed_output;
  const clean = (h: string[]) => h.map((x) => x.replace(/^#/, "").replace(/\s+/g, "").trim()).filter(Boolean);
  t.tiktok.hashtags = clean(t.tiktok.hashtags);
  t.instagram.hashtags = clean(t.instagram.hashtags);
  return t;
}

// ---- Postiz ------------------------------------------------------------------

export type Channel = { id: string; name: string; identifier: string; picture?: string; disabled?: boolean };

function postizEnv() {
  return { ...process.env, POSTIZ_API_KEY: process.env.POSTIZ_API_KEY ?? "", ...(process.env.POSTIZ_API_URL ? { POSTIZ_API_URL: process.env.POSTIZ_API_URL } : {}) };
}

async function postiz(args: string[]): Promise<string> {
  const bin = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "postiz.cmd" : "postiz");
  const { stdout } = await execFileP(bin, args, { env: postizEnv(), maxBuffer: 8 * 1024 * 1024, shell: process.platform === "win32" });
  return stdout;
}

function jsonFrom(out: string): unknown {
  const i = Math.min(...["[", "{"].map((c) => out.indexOf(c)).filter((x) => x >= 0));
  if (!Number.isFinite(i)) throw new Error("Réponse Postiz illisible : " + out.slice(0, 200));
  return JSON.parse(out.slice(i));
}

export function postizEnabled() {
  return !!process.env.POSTIZ_API_KEY;
}

export async function postizChannels(): Promise<Channel[]> {
  if (!postizEnabled()) return [];
  const list = jsonFrom(await postiz(["integrations:list"])) as Channel[];
  return list.map((c) => ({ id: c.id, name: c.name, identifier: c.identifier, picture: c.picture, disabled: c.disabled }));
}

function textFor(t: Texts, identifier: string): { content: string; settings: Record<string, unknown> } {
  const id = identifier.toLowerCase();
  const tags = (h: string[]) => h.map((x) => "#" + x).join(" ");
  if (id.includes("tiktok")) return { content: `${t.tiktok.caption}\n\n${tags(t.tiktok.hashtags)}`.trim(), settings: { privacy_level: "PUBLIC_TO_EVERYONE", duet: true, stitch: true, content_posting_method: "DIRECT_POST" } };
  if (id.includes("instagram")) return { content: `${t.instagram.caption}\n\n${tags(t.instagram.hashtags)}`.trim(), settings: { post_type: "post" } };
  if (id.includes("youtube")) return { content: t.youtube.description, settings: { title: t.youtube.title.slice(0, 100), type: "public", tags: t.youtube.tags.map((v) => ({ value: v, label: v })) } };
  if (id === "x" || id.includes("twitter")) return { content: t.x.text, settings: { who_can_reply_post: "everyone" } };
  if (id.includes("facebook")) return { content: t.facebook.text, settings: {} };
  if (id.includes("threads")) return { content: t.threads.text, settings: {} };
  return { content: `${t.instagram.caption}\n\n${tags(t.instagram.hashtags)}`.trim(), settings: {} };
}

export async function postizPublish(p: Publication, channels: Channel[], when: string | null, log: (l: string) => void) {
  if (!p.texts) throw new Error("Génère d'abord les textes");
  if (!fs.existsSync(p.file)) throw new Error("Fichier vidéo introuvable");
  log("postiz : envoi du fichier");
  const up = jsonFrom(await postiz(["upload", p.file])) as { path?: string };
  if (!up.path) throw new Error("Postiz n'a pas renvoyé d'adresse pour la vidéo");
  const date = when ? new Date(when).toISOString() : new Date(Date.now() + 90_000).toISOString();
  const results: Publication["sent"] = [];
  for (const ch of channels) {
    const { content, settings } = textFor(p.texts, ch.identifier);
    try {
      const out = await postiz(["posts:create", "-c", content, "-m", up.path, "-s", date, "--settings", JSON.stringify(settings), "-i", ch.id]);
      results.push({ at: Math.floor(Date.now() / 1000), channel: ch.name, provider: ch.identifier, status: "ok", detail: out.trim().slice(0, 200) });
      log(`postiz : ${ch.name} (${ch.identifier}) programmé pour ${date}`);
    } catch (e) {
      const msg = (e as { stderr?: string; message: string }).stderr || (e as Error).message;
      results.push({ at: Math.floor(Date.now() / 1000), channel: ch.name, provider: ch.identifier, status: "error", detail: msg.slice(0, 300) });
      log(`postiz : ${ch.name} : ${msg.slice(0, 200)}`);
    }
  }
  p.sent.push(...results);
  p.updatedAt = Math.floor(Date.now() / 1000);
  savePublication(p);
  return results;
}
