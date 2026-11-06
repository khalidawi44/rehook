// Recadrage intelligent : détection des personnes (modèle léger en local) sur
// quelques images d'un clip, pour centrer le recadrage vertical sur elles.
import fs from "node:fs";
import path from "node:path";
import { ffmpeg } from "../media.js";
import { CACHE_DIR } from "./media-analysis.js";
import { DATA_DIR } from "../paths.js";

let detectorPromise: Promise<unknown> | null = null;

async function detector(log: (l: string) => void) {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const tf = await import("@huggingface/transformers");
      tf.env.cacheDir = path.join(DATA_DIR, "models");
      log("recadrage : chargement du détecteur de personnes (téléchargé une fois)");
      return tf.pipeline("object-detection", process.env.NICHE_DETECT_MODEL || "Xenova/yolos-tiny", { dtype: "q8" } as never);
    })().catch((e) => {
      detectorPromise = null;
      throw e;
    });
  }
  return detectorPromise;
}

type Det = { label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } };

/**
 * Renvoie le centre horizontal (0 à 1) des personnes visibles dans le clip,
 * ou null si aucune personne n'est détectée.
 */
export async function personCenterX(file: string, inS: number, outS: number, log: (l: string) => void): Promise<number | null> {
  const n = 3;
  const xs: number[] = [];
  const ws: number[] = [];
  try {
    const det = (await detector(log)) as (img: string, opts: Record<string, unknown>) => Promise<Det[]>;
    for (let i = 0; i < n; i++) {
      const t = inS + ((i + 0.5) / n) * (outS - inS);
      const frame = path.join(CACHE_DIR, `sc-${Date.now()}-${i}.jpg`);
      await ffmpeg(["-ss", t.toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "5", frame]);
      try {
        const dets = await det(frame, { threshold: 0.5 });
        for (const d of dets) {
          if (d.label !== "person") continue;
          const w = d.box.xmax - d.box.xmin;
          const h = d.box.ymax - d.box.ymin;
          xs.push((d.box.xmin + d.box.xmax) / 2);
          ws.push(w * h * d.score);
        }
      } finally {
        fs.rmSync(frame, { force: true });
      }
    }
  } catch (e) {
    log(`recadrage : ${(e as Error).message}`);
    return null;
  }
  if (!xs.length) return null;
  const total = ws.reduce((a, b) => a + b, 0);
  const cx = xs.reduce((a, x, i) => a + x * ws[i], 0) / total;
  return cx / 640;
}
