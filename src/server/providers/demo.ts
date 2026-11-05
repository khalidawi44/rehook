// Données de démonstration : comptes et vidéos fictifs (handles « demo_… »)
// pour voir l'interface avant de brancher une vraie source. Les miniatures sont
// des SVG générés en local. Tout se retire d'un clic dans les réglages.
import fs from "node:fs";
import path from "node:path";
import { COVERS_DIR } from "../paths.js";
import { db, now, upsertVideo, type CollectedVideo } from "../db.js";

const PALETTES = [
  ["#7c3aed", "#db2777"],
  ["#0ea5e9", "#22c55e"],
  ["#f97316", "#ef4444"],
  ["#14b8a6", "#6366f1"],
  ["#eab308", "#f43f5e"],
  ["#1e293b", "#64748b"],
];

const DEMO: {
  handle: string;
  nickname: string;
  followers: number;
  followed: boolean;
  region: string;
  videos: { caption: string; views: number; vph: number; ageH: number; dur: number; eng: number }[];
}[] = [
  {
    handle: "demo_juicyhearts",
    nickname: "Juicy Hearts",
    followers: 184_000,
    followed: true,
    region: "ES",
    videos: [
      { caption: "Las uvas de su cabello ya salieron a la calle.. y nadie puede cortarlas #ai #aifruit #storytime #aistory #sadstory", views: 927_000, vph: 80_100, ageH: 22, dur: 112, eng: 3.3 },
      { caption: "Ella pidió un deseo a la luna de fresa #ai #aifruit #storytime", views: 61_000, vph: 900, ageH: 70, dur: 95, eng: 2.1 },
      { caption: "El niño que hablaba con las naranjas #aistory #sadstory", views: 48_000, vph: 500, ageH: 120, dur: 88, eng: 2.4 },
      { caption: "Nadie creía en la niña de cristal #aistory #emotionalstory", views: 55_000, vph: 400, ageH: 160, dur: 101, eng: 1.9 },
    ],
  },
  {
    handle: "demo_trendunova",
    nickname: "fypvanta",
    followers: 52_000,
    followed: true,
    region: "US",
    videos: [
      { caption: "Part 2 Two Brothers. Two Destinies. #aianimation #brainrot #emotionalstory #fruitstory", views: 595_000, vph: 30_900, ageH: 22, dur: 74, eng: 4.1 },
      { caption: "Part 1 Two Brothers. Two Destinies. #aianimation #brainrot", views: 310_000, vph: 6_200, ageH: 46, dur: 71, eng: 3.8 },
      { caption: "The dragon who forgot how to fly #aianimation #story", views: 22_000, vph: 150, ageH: 190, dur: 66, eng: 2.0 },
    ],
  },
  {
    handle: "demo_clinicdrama",
    nickname: "Clinic Drama",
    followers: 23_000,
    followed: false,
    region: "US",
    videos: [
      { caption: "The nurse who found out at the elevator #storytime #nursetok #aistory", views: 412_000, vph: 18_400, ageH: 19, dur: 58, eng: 5.2 },
      { caption: "Night shift secrets part 3 #nursetok #storytime", views: 38_000, vph: 320, ageH: 96, dur: 52, eng: 3.0 },
    ],
  },
  {
    handle: "demo_fruitsatelier",
    nickname: "Fruits Atelier",
    followers: 9_800,
    followed: false,
    region: "FR",
    videos: [
      { caption: "Le raton laveur qui réparait les chaussures du quartier #aistory #histoire #brainrot", views: 150_000, vph: 9_800, ageH: 14, dur: 47, eng: 6.1 },
      { caption: "La boulangère et le renard de minuit #aistory #histoire", views: 12_000, vph: 90, ageH: 140, dur: 51, eng: 2.2 },
      { caption: "Le chat qui comptait les étoiles #aistory", views: 9_500, vph: 60, ageH: 200, dur: 44, eng: 1.8 },
    ],
  },
  {
    handle: "demo_pixelcuisine",
    nickname: "Pixel Cuisine",
    followers: 310_000,
    followed: true,
    region: "FR",
    videos: [
      { caption: "3 ingrédients, 2 minutes, zéro vaisselle #recette #astuce #cuisine", views: 88_000, vph: 1_100, ageH: 60, dur: 28, eng: 4.4 },
      { caption: "Le secret des pâtes de ma grand-mère #recette #cuisine", views: 1_240_000, vph: 61_000, ageH: 17, dur: 33, eng: 7.2 },
      { caption: "Pourquoi vos œufs collent (et comment arrêter) #astuce #cuisine", views: 102_000, vph: 700, ageH: 130, dur: 25, eng: 3.9 },
    ],
  },
  {
    handle: "demo_minihistoria",
    nickname: "Mini Historia",
    followers: 4_300,
    followed: false,
    region: "ES",
    videos: [
      { caption: "El pueblo que desapareció en una noche #historia #misterio #storytime", views: 260_000, vph: 24_000, ageH: 9, dur: 142, eng: 5.6 },
    ],
  },
];

function svgCover(title: string, i: number): string {
  const [a, b] = PALETTES[i % PALETTES.length];
  const words = title.replace(/#\S+/g, "").trim().split(/\s+/).slice(0, 6).join(" ");
  const esc = words.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="540" height="960" fill="url(#g)"/>
<circle cx="${120 + (i * 97) % 300}" cy="${260 + (i * 53) % 400}" r="${140 + (i * 31) % 90}" fill="white" fill-opacity="0.12"/>
<text x="40" y="860" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="white" fill-opacity="0.9">${esc}</text>
<text x="40" y="910" font-family="Arial, sans-serif" font-size="22" fill="white" fill-opacity="0.6">démo</text>
</svg>`;
}

export function seedDemo(): number {
  const t = now();
  let i = 0;
  let count = 0;
  for (const acc of DEMO) {
    for (const v of acc.videos) {
      i++;
      const coverFile = `demo-${i}.svg`;
      fs.writeFileSync(path.join(COVERS_DIR, coverFile), svgCover(v.caption, i));
      const externalId = `demo-${acc.handle}-${i}`;
      const exists = db.prepare("SELECT id FROM videos WHERE external_id = ?").get(externalId);
      if (exists) continue;
      const likes = Math.round((v.views * v.eng) / 100 * 0.85);
      const comments = Math.round((v.views * v.eng) / 100 * 0.1);
      const shares = Math.round((v.views * v.eng) / 100 * 0.05);
      const hashtags = [...v.caption.matchAll(/#(\w+)/g)].map((m) => m[1].toLowerCase());
      const base: CollectedVideo = {
        externalId,
        url: `https://www.tiktok.com/@${acc.handle}/video/${7_000_000_000_000_000_000 + i}`,
        caption: v.caption,
        hashtags,
        durationS: v.dur,
        postedAt: t - Math.round(v.ageH * 3600),
        coverUrl: `/covers/${coverFile}`,
        region: acc.region,
        music: "son original",
        source: "demo",
        account: { handle: acc.handle, nickname: acc.nickname, avatarUrl: null, followers: acc.followers, region: acc.region },
        stats: { views: v.views, likes, comments, shares, saves: Math.round(likes * 0.2) },
      };
      // Deux relevés à 2 h d'écart pour que « Vues/h » et « Croissance » existent.
      const earlier = { ...base, stats: { ...base.stats, views: Math.max(0, v.views - v.vph * 2), likes: Math.round(likes * 0.9) } };
      const { video } = upsertVideo(earlier);
      db.prepare("UPDATE snapshots SET captured_at = ? WHERE video_id = ?").run(t - 7200, video.id);
      upsertVideo(base);
      db.prepare("UPDATE videos SET cover_file = ? WHERE id = ?").run(coverFile, video.id);
      db.prepare("UPDATE accounts SET followed = ? WHERE handle = ?").run(acc.followed ? 1 : 0, acc.handle);
      count++;
    }
  }
  if (count) {
    db.prepare("INSERT INTO runs(started_at, finished_at, ok, summary) VALUES(?, ?, 1, ?)").run(t - 7200, t - 7190, `démo : ${count} vidéo(s)`);
  }
  return count;
}

export function removeDemo(): number {
  const r = db.prepare("DELETE FROM videos WHERE source = 'demo'").run();
  db.prepare("DELETE FROM accounts WHERE handle LIKE 'demo_%' AND id NOT IN (SELECT account_id FROM videos)").run();
  for (const f of fs.readdirSync(COVERS_DIR)) if (f.startsWith("demo-")) fs.rmSync(path.join(COVERS_DIR, f), { force: true });
  return Number(r.changes);
}
