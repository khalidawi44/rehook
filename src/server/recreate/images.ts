// Étape 2 : une image par scène. none = fonds typographiques dessinés par Remotion,
// pexels = photo libre de droits, openai = image générée.
import fs from "node:fs";
import path from "node:path";
import type { Brief } from "./brief.js";

export type ImageProvider = "none" | "pexels" | "pexels-video" | "openai";

export function imageProvider(override?: string): ImageProvider {
  const p = (override || process.env.NICHE_IMAGES || (process.env.PEXELS_API_KEY ? "pexels-video" : "none")).toLowerCase();
  if ((p === "pexels-video" || p === "pexels") && !process.env.PEXELS_API_KEY) return "none";
  if (p === "pexels-video") return "pexels-video";
  if (p === "pexels") return "pexels";
  if (p === "openai" && process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

async function pexels(keywords: string[], dest: string): Promise<boolean> {
  const q = encodeURIComponent(keywords.join(" ") || "abstract");
  const r = await fetch(`https://api.pexels.com/v1/search?query=${q}&orientation=portrait&per_page=5`, {
    headers: { Authorization: process.env.PEXELS_API_KEY! },
  });
  if (!r.ok) throw new Error(`Pexels a répondu ${r.status}`);
  const j = (await r.json()) as { photos?: { src?: { large2x?: string; large?: string } }[] };
  const pick = j.photos?.[Math.floor(Math.random() * Math.min(5, j.photos.length))];
  const url = pick?.src?.large2x ?? pick?.src?.large;
  if (!url) return false;
  const img = await fetch(url);
  if (!img.ok) return false;
  fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
  return true;
}

async function openaiImage(prompt: string, style: string, dest: string): Promise<boolean> {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: `${prompt}. Style : ${style}. Format vertical 9:16, sans texte dans l'image.`,
      size: "1024x1536",
      quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
    }),
  });
  if (!r.ok) throw new Error(`OpenAI images a répondu ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { data?: { b64_json?: string; url?: string }[] };
  const d = j.data?.[0];
  if (d?.b64_json) {
    fs.writeFileSync(dest, Buffer.from(d.b64_json, "base64"));
    return true;
  }
  if (d?.url) {
    const img = await fetch(d.url);
    fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
    return true;
  }
  return false;
}

/**
 * Produit les images dans `dir` (dossier public du rendu) et renvoie, pour
 * chaque scène, le chemin relatif au dossier public (ou null).
 */
export async function makeImages(
  brief: Brief,
  dir: string,
  relDir: string,
  provider: ImageProvider,
  log: (l: string) => void,
  onProgress: (i: number, total: number) => void,
  skip: boolean[] = [],
): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  if (provider === "none" || provider === "pexels-video") {
    if (provider === "none") log("images : fonds typographiques (aucun fournisseur)");
    return brief.scenes.map(() => null);
  }
  for (let i = 0; i < brief.scenes.length; i++) {
    const scene = brief.scenes[i];
    if (skip[i]) {
      out.push(null);
      continue;
    }
    const file = `scene-${i}.${provider === "pexels" ? "jpg" : "png"}`;
    const dest = path.join(dir, file);
    try {
      const ok =
        provider === "pexels"
          ? await pexels(scene.keywords, dest)
          : await openaiImage(scene.visual, brief.style.mood, dest);
      out.push(ok ? `${relDir}/${file}` : null);
    } catch (e) {
      log(`image ${i + 1} : ${(e as Error).message}`);
      out.push(null);
    }
    onProgress(i + 1, brief.scenes.length);
  }
  log(`images : ${out.filter(Boolean).length}/${brief.scenes.length} (${provider})`);
  return out;
}
