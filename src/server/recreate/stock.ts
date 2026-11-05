// Clips vidéo libres de droits (API Pexels Videos) : un clip par scène, choisi
// parmi les candidats par le modèle à partir des vignettes, pour coller au plan
// de la vidéo source.
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Brief } from "./brief.js";

export type StockClip = { file: string; durationS: number; width: number; height: number; credit: string; url: string };

type PexelsVideo = {
  id: number;
  duration: number;
  width: number;
  height: number;
  image: string;
  url: string;
  user?: { name?: string };
  video_files: { id: number; quality: string; file_type: string; width: number | null; height: number | null; link: string }[];
};

type Candidate = { video: PexelsVideo; query: string };

async function pexelsSearch(query: string, perPage = 6): Promise<PexelsVideo[]> {
  const u = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=${perPage}`;
  const r = await fetch(u, { headers: { Authorization: process.env.PEXELS_API_KEY! } });
  if (!r.ok) throw new Error(`Pexels vidéos a répondu ${r.status}`);
  const j = (await r.json()) as { videos?: PexelsVideo[] };
  return (j.videos ?? []).filter((v) => v.video_files?.length);
}

function bestFile(v: PexelsVideo) {
  const mp4 = v.video_files.filter((f) => f.file_type === "video/mp4" && f.width && f.height);
  const portrait = mp4.filter((f) => f.height! > f.width!);
  const pool = portrait.length ? portrait : mp4;
  // Le plus proche de 1080 de large sans dépasser 1440 : assez net, pas trop lourd.
  return pool.sort((a, b) => Math.abs(a.width! - 1080) - Math.abs(b.width! - 1080)).find((f) => f.width! <= 1440) ?? pool[0];
}

const PickSchema = z.object({
  choices: z.array(
    z.object({
      scene: z.number().describe("Numéro de la scène, à partir de 1"),
      candidate: z.number().describe("Numéro du clip retenu pour cette scène, à partir de 1, ou 0 si aucun ne convient"),
      why: z.string().describe("En quelques mots"),
    }),
  ),
});

/** Demande au modèle le clip le plus proche de la scène source, d'après les vignettes. */
async function pickWithModel(
  brief: Brief,
  perScene: Candidate[][],
  sourceFrames: string[],
  log: (l: string) => void,
): Promise<number[]> {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  const content: Anthropic.ContentBlockParam[] = [];
  content.push({
    type: "text",
    text: `Tu choisis, pour chaque scène d'une vidéo courte, le clip de banque d'images qui ressemble le plus au plan correspondant de la vidéo source (décor, personnes, action, cadrage, ambiance). Résumé de la source : ${brief.sourceSummary ?? "(inconnu)"}.`,
  });
  if (sourceFrames.length) {
    content.push({ type: "text", text: "Images clés de la vidéo source :" });
    for (const f of sourceFrames.slice(0, 8)) {
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(f).toString("base64") } });
    }
  }
  for (let i = 0; i < perScene.length; i++) {
    const scene = brief.scenes[i];
    content.push({ type: "text", text: `Scène ${i + 1} : « ${scene.onScreen} ». Visuel voulu : ${scene.visual}. Candidats :` });
    for (let c = 0; c < perScene[i].length; c++) {
      content.push({ type: "text", text: `Scène ${i + 1}, clip ${c + 1} (${perScene[i][c].video.duration} s, requête « ${perScene[i][c].query} ») :` });
      content.push({ type: "image", source: { type: "url", url: perScene[i][c].video.image } });
    }
  }
  content.push({ type: "text", text: "Donne ton choix pour chaque scène. Un clip peut servir pour plusieurs scènes si c'est le plus juste." });
  try {
    const response = await client.messages.parse({
      model: process.env.NICHE_MODEL || "claude-opus-5-5",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content }],
      output_config: { effort: "low", format: zodOutputFormat(PickSchema) },
    });
    const out = perScene.map(() => 0);
    for (const c of response.parsed_output?.choices ?? []) {
      if (c.scene >= 1 && c.scene <= out.length) out[c.scene - 1] = c.candidate - 1;
    }
    log("clips : choix du modèle " + out.map((c, i) => `${i + 1}→${c + 1}`).join(" "));
    return out;
  } catch (e) {
    log(`clips : choix automatique (${(e as Error).message})`);
    return perScene.map(() => 0);
  }
}

export async function findStockClips(
  brief: Brief,
  dir: string,
  relDir: string,
  sourceFrames: string[],
  log: (l: string) => void,
  onProgress: (i: number, total: number) => void,
): Promise<(({ rel: string } & StockClip) | null)[]> {
  if (!process.env.PEXELS_API_KEY) {
    log("clips : PEXELS_API_KEY manquante");
    return brief.scenes.map(() => null);
  }
  const perScene: Candidate[][] = [];
  for (let i = 0; i < brief.scenes.length; i++) {
    const s = brief.scenes[i];
    const queries = [s.stockQuery, ...(s.stockAlternatives ?? []), s.keywords.join(" ")].map((q) => q?.trim()).filter(Boolean) as string[];
    const seen = new Set<number>();
    const cands: Candidate[] = [];
    for (const q of queries) {
      if (cands.length >= 6) break;
      try {
        for (const v of await pexelsSearch(q, 5)) {
          if (seen.has(v.id) || v.duration < 2) continue;
          seen.add(v.id);
          cands.push({ video: v, query: q });
        }
      } catch (e) {
        log(`clips scène ${i + 1} « ${q} » : ${(e as Error).message}`);
      }
    }
    perScene.push(cands);
    onProgress(i + 0.5, brief.scenes.length);
  }
  const total = perScene.reduce((a, c) => a + c.length, 0);
  log(`clips : ${total} candidat(s) pour ${brief.scenes.length} scène(s)`);
  const picks = total && perScene.some((c) => c.length > 1) ? await pickWithModel(brief, perScene, sourceFrames, log) : perScene.map(() => 0);

  const out: (({ rel: string } & StockClip) | null)[] = [];
  const downloaded = new Map<number, { rel: string } & StockClip>();
  for (let i = 0; i < perScene.length; i++) {
    const pick = picks[i] >= 0 ? perScene[i][picks[i]] : undefined;
    if (!pick) {
      out.push(null);
      continue;
    }
    if (downloaded.has(pick.video.id)) {
      out.push(downloaded.get(pick.video.id)!);
      continue;
    }
    const f = bestFile(pick.video);
    if (!f) {
      out.push(null);
      continue;
    }
    try {
      const r = await fetch(f.link);
      if (!r.ok) throw new Error(`téléchargement ${r.status}`);
      const file = `clip-${pick.video.id}.mp4`;
      fs.writeFileSync(path.join(dir, file), Buffer.from(await r.arrayBuffer()));
      const clip = {
        rel: `${relDir}/${file}`,
        file: path.join(dir, file),
        durationS: pick.video.duration,
        width: f.width!,
        height: f.height!,
        credit: pick.video.user?.name ? `Vidéo : ${pick.video.user.name} (Pexels)` : "Pexels",
        url: pick.video.url,
      };
      downloaded.set(pick.video.id, clip);
      out.push(clip);
    } catch (e) {
      log(`clip scène ${i + 1} : ${(e as Error).message}`);
      out.push(null);
    }
    onProgress(i + 1, brief.scenes.length);
  }
  log(`clips : ${out.filter(Boolean).length}/${brief.scenes.length} scène(s) avec un clip libre de droits`);
  return out;
}
