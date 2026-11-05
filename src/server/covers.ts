// Les miniatures TikTok expirent (x-expires dans l'URL) : on les copie en local.
import fs from "node:fs";
import path from "node:path";
import { COVERS_DIR } from "./paths.js";
import { db, type VideoRow } from "./db.js";
import { BROWSER_UA } from "./providers/tiktok-page.js";

fs.mkdirSync(COVERS_DIR, { recursive: true });

export async function cacheCover(video: VideoRow): Promise<void> {
  if (!video.cover_url || video.cover_file) return;
  if (video.cover_url.startsWith("/")) {
    db.prepare("UPDATE videos SET cover_file = ? WHERE id = ?").run(video.cover_url.replace(/^\/covers\//, ""), video.id);
    return;
  }
  try {
    const r = await fetch(video.cover_url, { headers: { "User-Agent": BROWSER_UA, Referer: "https://www.tiktok.com/" } });
    if (!r.ok) return;
    const type = r.headers.get("content-type") ?? "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const file = `${video.platform}-${video.external_id}.${ext}`;
    fs.writeFileSync(path.join(COVERS_DIR, file), Buffer.from(await r.arrayBuffer()));
    db.prepare("UPDATE videos SET cover_file = ? WHERE id = ?").run(file, video.id);
  } catch {
    // On garde l'URL d'origine, elle marchera encore quelques heures.
  }
}

export function coverPath(video: VideoRow): string | null {
  if (!video.cover_file) return null;
  const p = path.join(COVERS_DIR, video.cover_file);
  return fs.existsSync(p) ? p : null;
}
