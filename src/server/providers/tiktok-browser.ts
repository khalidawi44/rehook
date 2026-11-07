// Découverte via un Chromium local (Playwright) : on ouvre un profil ou une page
// hashtag et on lit les réponses JSON que TikTok envoie à sa propre interface.
// Gratuit, mais TikTok peut demander une vérification : dans ce cas, le
// collecteur rend 0 vidéo et le journal l'indique.
import type { CollectedVideo } from "../db.js";
import { BROWSER_UA, itemToVideo } from "./tiktok-page.js";

type Logger = (line: string) => void;

/** Catégories de la page Explorer (libellés FR et EN tels qu'affichés par TikTok). */
export const EXPLORE_CATEGORIES: { key: string; labels: string[] }[] = [
  { key: "Chant et danse", labels: ["Chant et danse", "Singing & Dancing", "Chant & danse"] },
  { key: "Comédie", labels: ["Comédie", "Comedy"] },
  { key: "Sport", labels: ["Sport", "Sports"] },
  { key: "Anime et BD", labels: ["Anime et BD", "Anime & Comics", "Anime & BD"] },
  { key: "Relations", labels: ["Relations", "Relationship"] },
  { key: "Spectacles", labels: ["Spectacles", "Shows"] },
  { key: "Synchronisation labiale", labels: ["Synchronisation labiale", "Lipsync"] },
  { key: "Vie quotidienne", labels: ["Vie quotidienne", "Daily Life"] },
  { key: "Beauté", labels: ["Beauté", "Beauty Care", "Beauté et soins"] },
  { key: "Jeux", labels: ["Jeux", "Games"] },
  { key: "Société", labels: ["Société", "Society"] },
  { key: "Tenues", labels: ["Tenues", "Outfit"] },
  { key: "Voitures", labels: ["Voitures", "Cars"] },
  { key: "Alimentation", labels: ["Alimentation", "Food"] },
  { key: "Animaux", labels: ["Animaux", "Animals"] },
  { key: "Famille", labels: ["Famille", "Family"] },
];

async function loadPlaywright() {
  try {
    const pw = await import("playwright");
    return pw.chromium;
  } catch {
    throw new Error("Playwright n'est pas installé : npm install playwright && npx playwright install chromium");
  }
}

// Réponses JSON acceptées selon la page ouverte : une page hashtag renvoyée vers l'accueil
// par TikTok émet le flux « Pour toi », qu'il ne faut surtout pas prendre pour le hashtag.
const ACCEPT: Record<string, RegExp> = {
  account: /\/api\/post\/item_list/,
  hashtag: /\/api\/challenge\/item_list/,
  keyword: /\/api\/search\/(general|item)\/full|\/api\/search\/item_list/,
  explore: /\/api\/(prefetch\/explore|explore|recommend)\/item_list/,
};

async function collectFromPages(
  urls: { url: string; source: string; handleHint?: string; tag?: string }[],
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
        if (!(ACCEPT[target.source] ?? ACCEPT.explore).test(u)) return;
        try {
          const j = (await resp.json()) as { itemList?: unknown[]; data?: { item?: unknown }[] };
          const list = j.itemList ?? (j.data ?? []).map((d) => d.item).filter(Boolean) ?? [];
          for (const it of list as Parameters<typeof itemToVideo>[0][]) {
            const v = itemToVideo(it, target.source, target.handleHint);
            if (!v) continue;
            // Page hashtag : on ne garde que les vidéos qui portent vraiment ce hashtag.
            if (target.tag && !v.hashtags.includes(target.tag)) continue;
            if (target.handleHint && v.account.handle.toLowerCase() !== target.handleHint.toLowerCase()) continue;
            items.set(v.externalId, v);
          }
        } catch {
          // réponse vide ou non JSON : TikTok a bloqué cette requête
        }
      };
      page.on("response", handler);
      try {
        await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(5_000);
        const landed = page.url();
        const wanted = new URL(target.url).pathname;
        if (!landed.includes(wanted)) {
          log(`navigateur : ${target.url} renvoyé vers ${landed} : TikTok ne sert pas cette page sans compte connecté. Le fil varié (Explorer) et les comptes suivis restent disponibles ; pour un sujet précis, importe des URL ou suis des comptes.`);
        }
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

/**
 * Fil varié : la page Explorer publique de TikTok et ses catégories (Danse, Comédie, Beauté…).
 * Chaque catégorie est un bouton de la page ; les vidéos reçues après le clic portent son nom.
 */
export async function browserCollectExploreCategories(perPage: number, log: Logger, only?: string[]): Promise<CollectedVideo[]> {
  const chromium = await loadPlaywright();
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE || undefined;
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  const out = new Map<string, CollectedVideo>();
  try {
    const ctx = await browser.newContext({ userAgent: BROWSER_UA, viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
    const page = await ctx.newPage();
    let current = "Pour toi";
    const handler = async (resp: { url(): string; json(): Promise<unknown> }) => {
      const u = resp.url();
      if (!ACCEPT.explore.test(u)) return;
      try {
        const j = (await resp.json()) as { itemList?: unknown[] };
        for (const it of (j.itemList ?? []) as Parameters<typeof itemToVideo>[0][]) {
          const v = itemToVideo(it, "explore");
          if (v) out.set(v.externalId, { ...v, category: current });
        }
      } catch {
        // réponse vide
      }
    };
    page.on("response", handler);
    await page.goto("https://www.tiktok.com/explore", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(5_000);
    if (!page.url().includes("/explore")) log(`explorer : renvoyé vers ${page.url()}`);
    for (let r = 0; r < 2; r++) {
      await page.mouse.wheel(0, 2_500);
      await page.waitForTimeout(2_000);
    }
    log(`explorer : Pour toi : ${out.size} vidéo(s)`);
    const cats = EXPLORE_CATEGORIES.filter((c) => !only?.length || only.includes(c.key));
    for (const cat of cats) {
      const sizeBefore = out.size;
      current = cat.key;
      let clicked = false;
      for (const label of cat.labels) {
        const btn = page.getByRole("button", { name: label, exact: true }).first();
        if (await btn.count().catch(() => 0)) {
          await btn.click({ timeout: 5_000 }).catch(() => {});
          clicked = true;
          break;
        }
        const alt = page.locator(`button:has-text("${label}"), [role=tab]:has-text("${label}"), span:text-is("${label}")`).first();
        if (await alt.count().catch(() => 0)) {
          await alt.click({ timeout: 5_000 }).catch(() => {});
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        log(`explorer : catégorie « ${cat.key} » introuvable sur la page`);
        continue;
      }
      await page.waitForTimeout(3_000);
      let rounds = 0;
      while (out.size - sizeBefore < perPage && rounds < 3) {
        await page.mouse.wheel(0, 2_500);
        await page.waitForTimeout(2_000);
        rounds++;
      }
      log(`explorer : ${cat.key} : ${out.size - sizeBefore} vidéo(s)`);
    }
    page.off("response", handler);
  } finally {
    await browser.close();
  }
  return [...out.values()];
}

export async function browserCollectAccount(handle: string, perPage: number, log: Logger) {
  const h = handle.replace(/^@/, "");
  return collectFromPages([{ url: `https://www.tiktok.com/@${h}`, source: "account", handleHint: h }], perPage, log);
}

export async function browserCollectHashtag(tag: string, perPage: number, log: Logger) {
  const t = tag.replace(/^#/, "");
  return collectFromPages([{ url: `https://www.tiktok.com/tag/${encodeURIComponent(t)}`, source: "hashtag", tag: t.toLowerCase() }], perPage, log);
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
