import React, { useEffect, useState } from "react";
import { api, type Publication, type PublishSource } from "../api";
import { PublishPanel } from "./PublishPanel";
import { sendToMontage } from "../montageQueue";

const BEST: { network: string; hours: string; days: string }[] = [
  { network: "TikTok", hours: "12 h à 14 h, 19 h à 22 h", days: "mardi, jeudi, dimanche" },
  { network: "Instagram Reels", hours: "11 h à 13 h, 18 h à 21 h", days: "lundi, mercredi, vendredi" },
  { network: "YouTube Shorts", hours: "15 h à 18 h", days: "vendredi, samedi, dimanche" },
  { network: "Snapchat", hours: "20 h à 23 h", days: "tous les jours, soir" },
  { network: "X", hours: "8 h à 10 h, 12 h à 13 h", days: "mardi à jeudi" },
  { network: "Facebook", hours: "9 h à 11 h, 13 h à 15 h", days: "mercredi, jeudi" },
];

export const PlanningPanel: React.FC<{ notify: (m: string) => void }> = ({ notify }) => {
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [reminders, setReminders] = useState<{ id: number; due_at: number; message: string }[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [uploading, setUploading] = useState(false);
  const [publish, setPublish] = useState<{ source: PublishSource; title: string } | null>(null);
  const [imported, setImported] = useState<{ id: string; name: string; url: string; durationS: number } | null>(null);
  const publishFile = async (file: File) => {
    setUploading(true);
    try {
      const c = await api.saveCapture(file, file.name.replace(/\.[^.]+$/, ""));
      setImported({ id: c.id, name: c.name, url: c.url, durationS: c.durationS });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  useEffect(() => {
    api.publications().then(setPubs).catch(() => {});
    api.reminders().then(setReminders).catch(() => {});
  }, []);
  const scheduled = pubs
    .flatMap((p) => p.sent.filter((s) => s.status === "ok" && s.scheduledFor).map((s) => ({ ...s, key: p.key, title: p.texts?.tiktok.caption.split("\n")[0] ?? p.key, url: p.url })))
    .sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? -1 : 1));
  const byDay = new Map<string, typeof scheduled>();
  for (const s of scheduled) {
    const d = new Date(s.scheduledFor!).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const loadStats = async (key: string) => {
    try {
      const r = await api.publishAnalytics(key);
      setStats((s) => ({ ...s, [key]: r }));
      if (!r.length) notify("Pas de statistiques disponibles (post pas encore publié, ou identifiant inconnu)");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <div className="my-4 grid gap-4 lg:grid-cols-[1fr_320px]">
      {publish ? <PublishPanel source={publish.source} title={publish.title} onClose={() => setPublish(null)} notify={notify} /> : null}
      <div className="space-y-3">
        <label className="block cursor-pointer rounded-xl border border-dashed border-green-700 p-4 text-center hover:bg-green-950/40">
          <div className="text-sm font-semibold text-green-300">{uploading ? "Envoi et préparation du fichier…" : "⬆ Importer un montage CapCut"}</div>
          <div className="mt-1 text-xs text-zinc-400">Dépose ici la vidéo exportée de CapCut ou de l'éditeur TikTok. Tu peux ensuite l'ouvrir dans le montage (logo, sous-titres, textes, musique) ou la publier partout.</div>
          <input type="file" accept="video/*" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && publishFile(e.target.files[0])} />
        </label>
        {imported ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-green-700 bg-green-950/30 p-3 text-sm">
            <video src={imported.url} className="h-24 rounded bg-black" muted />
            <div className="min-w-40 flex-1">
              <div className="font-medium">{imported.name}</div>
              <div className="text-xs text-zinc-400">Importée. Ajoute logo, sous-titres, textes ou musique dans le montage, ou publie-la telle quelle.</div>
            </div>
            <button onClick={() => sendToMontage({ source: { kind: "capture", id: imported.id }, name: imported.name, url: imported.url, durationS: imported.durationS })} className="rounded-lg bg-green-500 px-3 py-2 text-sm font-semibold text-black hover:bg-green-400">✂️ Ouvrir dans le montage</button>
            <button onClick={() => setPublish({ source: { kind: "capture", id: imported.id }, title: imported.name })} className="rounded-lg border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800">📣 Publier telle quelle</button>
          </div>
        ) : null}
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="mb-2 text-sm font-medium">📅 Publications programmées</div>
          {!byDay.size ? <p className="text-sm text-zinc-500">Rien de programmé. Depuis « Publier partout », choisis une date pour programmer.</p> : null}
          {[...byDay.entries()].map(([day, list]) => (
            <div key={day} className="mb-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">{day}</div>
              <ul className="mt-1 space-y-1">
                {list.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 p-2 text-sm">
                    <span className="font-mono text-xs text-zinc-400">{new Date(s.scheduledFor!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs">{s.channel}</span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <button onClick={() => loadStats(s.key)} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">📈 Stats</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {Object.entries(stats).map(([k, v]) => (
            <details key={k} open className="mt-2 rounded-lg border border-zinc-800 p-2 text-xs">
              <summary className="cursor-pointer text-zinc-400">Statistiques {k}</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-zinc-300">{JSON.stringify(v, null, 1)}</pre>
            </details>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="mb-2 text-sm font-medium">⏰ Rappels Telegram à venir</div>
          {!reminders.length ? <p className="text-sm text-zinc-500">Aucun. Un rappel part 30 minutes avant chaque publication programmée (si Telegram est configuré).</p> : null}
          <ul className="space-y-1 text-sm">
            {reminders.map((r) => (
              <li key={r.id} className="text-zinc-300"><span className="font-mono text-xs text-zinc-500">{new Date(r.due_at * 1000).toLocaleString("fr-FR")}</span> · {r.message}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-800 p-3 text-sm">
        <div className="mb-2 font-medium">🕒 Meilleures heures (repères généraux)</div>
        <ul className="space-y-2">
          {BEST.map((b) => (
            <li key={b.network}>
              <div className="font-medium">{b.network}</div>
              <div className="text-xs text-zinc-400">{b.hours} · {b.days}</div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">Ces repères sont ceux du public francophone en général ; l'histogramme « Ce qui marche dans ta niche » (onglet Viral) montre les heures réelles des virales de tes comptes.</p>
      </div>
    </div>
  );
};
