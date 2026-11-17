// Détection « ça explose » : après chaque nouveau relevé d'une vidéo, on compare
// le rythme du dernier intervalle au précédent. Alerte dans l'appli, et sur
// Telegram si NICHE_TELEGRAM_BOT_TOKEN + NICHE_TELEGRAM_CHAT_ID sont définis.
import { db, getSettings, now, type AccountRow, type SnapshotRow, type VideoRow } from "./db.js";

export type AlertRow = {
  id: number;
  video_id: number;
  kind: "explose" | "nouvelle" | "accelere" | "record";
  message: string;
  views: number;
  views_per_hour: number;
  created_at: number;
  seen: number;
};

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + " M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(".", ",") + " k";
  return String(Math.round(n));
};

function rate(a: SnapshotRow, b: SnapshotRow): number | null {
  const h = (a.captured_at - b.captured_at) / 3600;
  if (h < 1 / 60) return null; // moins d'une minute : pas significatif
  return Math.max(0, a.views - b.views) / h;
}

function lastAlert(videoId: number): AlertRow | undefined {
  return db.prepare("SELECT * FROM alerts WHERE video_id = ? ORDER BY created_at DESC LIMIT 1").get(videoId) as AlertRow | undefined;
}

function record(video: VideoRow, kind: AlertRow["kind"], message: string, views: number, vph: number) {
  db.prepare("INSERT INTO alerts(video_id, kind, message, views, views_per_hour, created_at) VALUES(?, ?, ?, ?, ?, ?)").run(
    video.id,
    kind,
    message,
    views,
    vph,
    now(),
  );
  console.log("[rehook] ALERTE", message);
  void sendTelegram(`${message}\n${video.url}`);
}

/** À appeler juste après l'enregistrement d'un relevé. Renvoie true si une alerte est créée. */
export function detectAlert(video: VideoRow, isNew: boolean): boolean {
  if (video.source === "demo") return false;
  const s = getSettings();
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(video.account_id) as AccountRow;
  const snaps = db.prepare("SELECT * FROM snapshots WHERE video_id = ? ORDER BY captured_at DESC LIMIT 3").all(video.id) as SnapshotRow[];
  const last = snaps[0];
  if (!last) return false;
  const ageH = video.posted_at ? Math.max(0.05, (last.captured_at - video.posted_at) / 3600) : null;
  const previous = lastAlert(video.id);

  // 1. Vidéo découverte à l'instant, déjà lancée.
  if (isNew && ageH !== null && ageH <= 24) {
    const vph = last.views / ageH;
    if (last.views >= s.alertMinViews && vph >= s.alertMinViewsPerHour) {
      record(video, "nouvelle", `🔥 Nouvelle vidéo de @${account.handle} déjà à ${fmt(last.views)} vues en ${ageH < 1 ? Math.round(ageH * 60) + " min" : ageH.toFixed(1).replace(".", ",") + " h"} (${fmt(vph)} vues/h)`, last.views, vph);
      return true;
    }
    return false;
  }

  // 1 bis. Vidéo qui dépasse nettement la moyenne des 10 dernières vidéos du compte (record du compte).
  if (account && last.views >= s.alertMinViews && (!previous || previous.kind !== "record")) {
    const others = db
      .prepare(
        `SELECT MAX(sn.views) AS views FROM videos v JOIN snapshots sn ON sn.video_id = v.id
         WHERE v.account_id = ? AND v.id <> ? GROUP BY v.id ORDER BY v.posted_at DESC LIMIT 10`,
      )
      .all(video.account_id, video.id) as { views: number }[];
    if (others.length >= 4) {
      const avg = others.reduce((a, o) => a + o.views, 0) / others.length;
      if (avg > 0 && last.views >= 3 * avg) {
        record(video, "record", `🏆 @${account.handle} fait ${(last.views / avg).toFixed(1).replace(".", ",")}x sa moyenne : ${fmt(last.views)} vues (moyenne ${fmt(avg)} sur ${others.length} vidéos)`, last.views, 0);
        return true;
      }
    }
  }

  // 2. Rythme du dernier intervalle contre le précédent.
  const prev = snaps[1];
  if (!prev) return false;
  const vph = rate(last, prev);
  if (vph === null) return false;
  if (last.views < s.alertMinViews || vph < s.alertMinViewsPerHour) return false;
  const before = snaps[2] ? rate(prev, snaps[2]) : null;
  const accelerating = before === null || vph >= 1.8 * before;
  const gained = last.views - prev.views;
  const minutes = Math.round((last.captured_at - prev.captured_at) / 60);
  const window = minutes < 60 ? `${Math.max(1, minutes)} min` : `${(minutes / 60).toFixed(1).replace(".", ",")} h`;

  if (!previous || now() - previous.created_at > 6 * 3600) {
    if (!accelerating && before !== null) return false;
    record(video, "explose", `🚀 @${account.handle} explose : +${fmt(gained)} vues en ${window} (${fmt(vph)} vues/h, ${fmt(last.views)} au total)`, last.views, vph);
    return true;
  }
  if (vph >= 3 * previous.views_per_hour) {
    record(video, "accelere", `⚡ @${account.handle} accélère encore : ${fmt(vph)} vues/h (${fmt(last.views)} au total)`, last.views, vph);
    return true;
  }
  return false;
}

export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.NICHE_TELEGRAM_BOT_TOKEN;
  const chat = process.env.NICHE_TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: false }),
    });
  } catch (e) {
    console.warn("[rehook] telegram :", (e as Error).message);
  }
}

export function listAlerts(limit = 100) {
  return db
    .prepare(
      `SELECT al.*, v.caption AS v_caption, v.url AS v_url, v.cover_file AS v_cover_file, v.cover_url AS v_cover_url, a.handle AS a_handle
       FROM alerts al JOIN videos v ON v.id = al.video_id JOIN accounts a ON a.id = v.account_id
       ORDER BY al.created_at DESC LIMIT ?`,
    )
    .all(limit)
    .map((r) => {
      const row = r as AlertRow & { v_caption: string; v_url: string; v_cover_file: string | null; v_cover_url: string | null; a_handle: string };
      const { v_caption, v_url, v_cover_file, v_cover_url, a_handle, ...al } = row;
      return { ...al, video: { id: al.video_id, caption: v_caption, url: v_url, cover: v_cover_file ? `/covers/${v_cover_file}` : v_cover_url, handle: a_handle } };
    });
}

export function unseenCount(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE seen = 0").get() as { n: number }).n;
}

export function markSeen(id?: number) {
  if (id) db.prepare("UPDATE alerts SET seen = 1 WHERE id = ?").run(id);
  else db.prepare("UPDATE alerts SET seen = 1").run();
}
