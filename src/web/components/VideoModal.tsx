import React, { useEffect, useState } from "react";
import { api, fmtDuration, fmtNum, timeAgo, type Snapshot, type VideoCard } from "../api";
import { Modal } from "./Modal";

export const VideoModal: React.FC<{
  card: VideoCard;
  onClose: () => void;
  onRecreate: () => void;
  onFavorite: () => void;
  onDeleted: () => void;
}> = ({ card, onClose, onRecreate, onFavorite, onDeleted }) => {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [playerError, setPlayerError] = useState(false);
  useEffect(() => {
    api.video(card.id).then((v) => setSnaps(v.snapshots)).catch(() => {});
  }, [card.id]);
  const m = card.metrics;
  const remove = async () => {
    if (!confirm("Retirer cette vidéo de Niche ?")) return;
    await api.deleteVideo(card.id);
    onDeleted();
  };
  return (
    <Modal title={`@${card.account.handle}`} onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <div>
          {card.source !== "demo" && !playerError ? (
            <video
              key={card.id}
              src={`/api/videos/${card.id}/media`}
              poster={card.cover ?? undefined}
              controls
              autoPlay
              playsInline
              preload="auto"
              onError={() => setPlayerError(true)}
              className="aspect-[9/16] w-full rounded-xl bg-black object-contain"
            />
          ) : card.cover ? (
            <img src={card.cover} alt="" className="w-full rounded-xl object-cover" />
          ) : null}
          {playerError ? <p className="mt-2 text-xs text-zinc-500">Lecture impossible ici (TikTok n'a pas fourni le fichier). Le lien ci-dessous ouvre la vidéo sur TikTok.</p> : null}
          {!playerError && card.source !== "demo" ? <p className="mt-1 text-center text-xs text-zinc-500">Vidéo d'origine, sans les sous-titres du lecteur TikTok</p> : null}
          <a href={card.url} target="_blank" rel="noreferrer" className="mt-3 block rounded-lg border border-zinc-700 px-3 py-2 text-center text-sm hover:bg-zinc-800">
            Ouvrir sur TikTok ↗
          </a>
        </div>
        <div className="space-y-4 text-sm">
          <p className="whitespace-pre-wrap text-zinc-200">{card.caption || "(sans légende)"}</p>
          {card.hashtags.length ? <p className="text-zinc-400">{card.hashtags.map((h) => "#" + h).join(" ")}</p> : null}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-zinc-300 sm:grid-cols-3">
            <Row k="Vues" v={fmtNum(m.views)} />
            <Row k="Vues par heure" v={fmtNum(m.viewsPerHour)} />
            <Row k="Croissance" v={m.growth !== null ? `+${fmtNum(m.growth)} en ${m.growthHours?.toFixed(1).replace(".", ",")} h` : "au prochain relevé"} />
            <Row k="J'aime" v={fmtNum(m.likes)} />
            <Row k="Commentaires" v={fmtNum(m.comments)} />
            <Row k="Partages" v={fmtNum(m.shares)} />
            <Row k="Engagement" v={m.engagement !== null ? m.engagement.toFixed(2).replace(".", ",") + " %" : "…"} />
            <Row k="Durée" v={fmtDuration(card.durationS)} />
            <Row k="Publiée" v={timeAgo(card.postedAt)} />
            <Row k="Abonnés du compte" v={fmtNum(card.account.followers)} />
            <Row k="Médiane du compte" v={m.accountMedianViews ? fmtNum(m.accountMedianViews) : "pas assez de vidéos"} />
            <Row k="Musique" v={card.music ?? "…"} />
          </dl>
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="mb-1 font-medium">{m.viral ? "🔥 Vidéo virale" : "Pas encore virale"}</div>
            <div className="text-zinc-400">{m.viral ? "Raisons : " + m.viralReasons.join(", ") : "Les seuils se règlent dans Réglages."}</div>
          </div>
          {snaps.length > 1 ? (
            <div>
              <div className="mb-1 font-medium">Relevés ({snaps.length})</div>
              <Sparkline snaps={snaps} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={onRecreate} className="rounded-xl bg-green-500 px-4 py-2 font-semibold text-black hover:bg-green-400">
              ↻ Recréer cette vidéo
            </button>
            <button onClick={onFavorite} className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800">
              {card.favorite ? "★ Favori" : "☆ Mettre en favori"}
            </button>
            <button onClick={remove} className="ml-auto rounded-xl border border-red-900 px-4 py-2 text-red-300 hover:bg-red-950">
              Retirer
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex justify-between gap-2 border-b border-zinc-800/60 py-1">
    <dt className="text-zinc-500">{k}</dt>
    <dd className="text-right font-medium">{v}</dd>
  </div>
);

const Sparkline: React.FC<{ snaps: Snapshot[] }> = ({ snaps }) => {
  const w = 480;
  const h = 80;
  const xs = snaps.map((s) => s.captured_at);
  const ys = snaps.map((s) => s.views);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) || x0 + 1;
  const y1 = Math.max(...ys) || 1;
  const pts = snaps.map((s) => `${(((s.captured_at - x0) / (x1 - x0 || 1)) * (w - 10) + 5).toFixed(1)},${(h - 5 - (s.views / y1) * (h - 10)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full rounded-lg bg-zinc-900">
      <polyline points={pts.join(" ")} fill="none" stroke="#22c55e" strokeWidth="2" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.split(",")[0]} cy={p.split(",")[1]} r="3" fill="#22c55e" />
      ))}
    </svg>
  );
};
