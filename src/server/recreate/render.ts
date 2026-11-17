// Étape 4 : rendu MP4 avec Remotion (bundle mis en cache entre deux rendus).
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { PUBLIC_DIR, RENDERS_DIR, VIDEO_ENTRY } from "../paths.js";
import type { RehookProps } from "../../video/types.js";

let serveUrlPromise: Promise<string> | null = null;

function getBundle(log: (l: string) => void): Promise<string> {
  if (!serveUrlPromise) {
    log("rendu : préparation du bundle Remotion (une fois par démarrage)");
    serveUrlPromise = bundle({ entryPoint: VIDEO_ENTRY, publicDir: PUBLIC_DIR }).catch((e) => {
      serveUrlPromise = null;
      throw e;
    });
  }
  return serveUrlPromise;
}

export async function renderVideo(
  jobId: number,
  props: RehookProps,
  log: (l: string) => void,
  onProgress: (p: number) => void,
): Promise<string> {
  fs.mkdirSync(RENDERS_DIR, { recursive: true });
  const serveUrl = await getBundle(log);
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;
  const composition = await selectComposition({ serveUrl, id: "Rehook", inputProps: props, browserExecutable });
  const outputLocation = path.join(RENDERS_DIR, `rehook-${jobId}.mp4`);
  log(`rendu : ${composition.durationInFrames} images à ${composition.fps} i/s`);
  let last = 0;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 20,
    outputLocation,
    inputProps: props,
    browserExecutable,
    chromiumOptions: { gl: "angle" },
    concurrency: process.env.REMOTION_CONCURRENCY ? Number(process.env.REMOTION_CONCURRENCY) : undefined,
    onProgress: ({ progress }) => {
      if (progress - last >= 0.05 || progress === 1) {
        last = progress;
        onProgress(progress);
      }
    },
  });
  return path.basename(outputLocation);
}
