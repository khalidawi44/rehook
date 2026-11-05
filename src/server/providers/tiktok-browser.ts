// Découverte via un Chromium local (Playwright) : on ouvre un profil ou une page
// hashtag et on lit les réponses JSON que TikTok envoie à sa propre interface.
// Gratuit, mais TikTok peut demander une vérification : dans ce cas, le
// collecteur rend 0 vidéo et le journal l'indique.
import type { CollectedVideo } from "../db.js";
import { BROWSER_UA, itemToVideo } from "./tiktok-page.js";

type Logger = (line: string) => void;

async function loadPlaywright() {
  try {
    const pw = await import("playwright");
    return pw.chromium;
  } catch {
    throw new Error("Playwright n'est pas installé : npm install playwright && npx playwright install chromium");
  }
}

async function collectFromPages(
  urls: { url: string; source: string; handleHint?: string }[],
  perPage: number,
  log: Logger,
): Promise<CollectedVideo[]> {
  const chromium = await loadPlaywright();
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE || undefined;
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  const out: CollectedVideo[] = [];
  try {
    const ctx = await browser.newContext({ userAgent: BROWSER_UA, viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
    const page = await ctx.newPage();
    for (const target of urls) {
      const items = new Map<string, CollectedVideo>();
      const handler = async (resp: { url(): string; json(): Promise<unknown> }) => {
        const u = resp.url();
        if (!/\/api\/(post|challenge|search|prefetch\/explore)\/item_list|\/api\/search\/(general|item)\/full/.test(u)) return;
        try {
          const j = (await resp.json()) as { itemList?: unknown[]; data?: { item?: unknown }[] };
          const list = j.itemList ?? (j.data ?? []).map((d) => d.item).filter(Boolean) ?? [];
          for (const it of list as Parameters<typeof itemToVideo>[0][]) {
            const v = itemToVideo(it, target.source, target.handleHint);
            if (v) items.set(v.externalId, v);
          }
        } catch {
          // réponse vide ou non JSON : TikTok a bloqué cette requête
        }
      };
      page.on("response", handler);
      try {
        await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(5_000);
        let rounds = 0;
        while (items.size < perPage && rounds < 6) {
          await page.mouse.wheel(0, 2_500);
          await page.waitForTimeout(2_500);
          rounds++;
        }
      } catch (e) {
        log(`navigateur : ${target.url} : ${(e as Error).message}`);
      }
      page.off("response", handler);
      log(`navigateur : ${target.url} : ${items.size} vidéo(s)`);
      out.push(...[...items.values()].slice(0, perPage));
    }
  } finally {
    await browser.close();
  }
  return out;
}

export async function browserCollectAccount(handle: string, perPage: number, log: Logger) {
  const h = handle.replace(/^@/, "");
  return collectFromPages([{ url: `https://www.tiktok.com/@${h}`, source: "account", handleHint: h }], perPage, log);
}

export async function browserCollectHashtag(tag: string, perPage: number, log: Logger) {
  const t = tag.replace(/^#/, "");
  return collectFromPages([{ url: `https://www.tiktok.com/tag/${encodeURIComponent(t)}`, source: "hashtag" }], perPage, log);
}

export async function browserCollectKeyword(keyword: string, perPage: number, log: Logger) {
  return collectFromPages(
    [{ url: `https://www.tiktok.com/search/video?q=${encodeURIComponent(keyword)}`, source: "keyword" }],
    perPage,
    log,
  );
}

export async function browserCollectExplore(perPage: number, log: Logger) {
  return collectFromPages([{ url: "https://www.tiktok.com/explore", source: "explore" }], perPage, log);
}
