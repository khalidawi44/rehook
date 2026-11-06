// Tendances de la niche : ce qui marche cette semaine parmi les vidéos virales relevées.
import { db } from "./db.js";
import { listCards } from "./metrics.js";

export function trends(days = 7) {
  const cards = listCards({ view: "viral", period: days <= 1 ? "24h" : days <= 3 ? "3d" : "7d", duration: "all", sort: "score", unfollowed: true, q: "" });
  const tags = new Map<string, { n: number; views: number }>();
  const accounts = new Map<string, { n: number; views: number; handle: string }>();
  const durations: number[] = [];
  for (const c of cards) {
    for (const h of c.hashtags) {
      const t = tags.get(h) ?? { n: 0, views: 0 };
      t.n++;
      t.views += c.metrics.views;
      tags.set(h, t);
    }
    const a = accounts.get(c.account.handle) ?? { n: 0, views: 0, handle: c.account.handle };
    a.n++;
    a.views += c.metrics.views;
    accounts.set(c.account.handle, a);
    if (c.durationS) durations.push(c.durationS);
  }
  const generic = new Set(["fyp", "foryou", "pourtoi", "viral", "fy", "foryoupage", "tiktok", "trending"]);
  const topTags = [...tags.entries()]
    .filter(([h]) => !generic.has(h))
    .map(([tag, v]) => ({ tag, ...v }))
    .sort((a, b) => b.n - a.n || b.views - a.views)
    .slice(0, 15);
  const topAccounts = [...accounts.values()].sort((a, b) => b.views - a.views).slice(0, 8);
  durations.sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;
  const buckets = { "moins de 15 s": 0, "15 à 30 s": 0, "30 à 60 s": 0, "1 à 3 min": 0, "plus de 3 min": 0 };
  for (const d of durations) {
    if (d < 15) buckets["moins de 15 s"]++;
    else if (d < 30) buckets["15 à 30 s"]++;
    else if (d < 60) buckets["30 à 60 s"]++;
    else if (d < 180) buckets["1 à 3 min"]++;
    else buckets["plus de 3 min"]++;
  }
  // Heures de publication des virales (heure locale du serveur)
  const hours = new Array(24).fill(0) as number[];
  for (const c of cards) if (c.postedAt) hours[new Date(c.postedAt * 1000).getHours()]++;
  const alerts = (db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE created_at > ?").get(Math.floor(Date.now() / 1000) - days * 86400) as { n: number }).n;
  return { days, virals: cards.length, topTags, topAccounts, medianDurationS: median, durationBuckets: buckets, hours, alerts };
}
