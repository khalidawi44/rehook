import React from "react";
import { api, fmtNum, timeAgo, type Alert } from "../api";
import { sendToMontage } from "../montageQueue";

export const AlertsPanel: React.FC<{ alerts: Alert[]; reload: () => void; onOpenVideo: (id: number) => void; notifPermission: string; askNotif: () => void }> = ({
  alerts,
  reload,
  onOpenVideo,
  notifPermission,
  askNotif,
}) => {
  const seenAll = async () => {
    await api.alertsSeen();
    reload();
  };
  return (
    <div className="my-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {notifPermission !== "granted" ? (
          <button onClick={askNotif} className="rounded-lg bg-green-500 px-3 py-1.5 font-semibold text-black hover:bg-green-400">
            🔔 Activer les notifications du navigateur
          </button>
        ) : (
          <span className="rounded-lg border border-green-800 px-3 py-1.5 text-green-300">🔔 Notifications actives (garde cet onglet ouvert)</span>
        )}
        <button onClick={seenAll} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">
          Tout marquer comme lu
        </button>
        <span className="text-xs text-zinc-500">
          Une alerte part dès qu'une vidéo suivie gagne des vues bien plus vite qu'à l'intervalle précédent, ou qu'une nouvelle vidéo démarre fort.
        </span>
      </div>
      {!alerts.length ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center text-zinc-400">
          Pas encore d'alerte. La veille relit les compteurs toutes les quelques minutes : la première alerte arrive dès qu'une vidéo décolle.
        </div>
      ) : null}
      {alerts.map((a) => (
        <div key={a.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${a.seen ? "border-zinc-800 bg-zinc-900/40" : "border-green-700 bg-green-500/5"}`}>
          {a.video.cover ? <img src={a.video.cover} alt="" className="h-20 w-14 rounded-lg object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <div className="font-medium">{a.message}</div>
            <div className="truncate text-sm text-zinc-400">{a.video.caption}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {timeAgo(a.created_at)} · {fmtNum(a.views)} vues · {fmtNum(a.views_per_hour)} vues/h
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={() => onOpenVideo(a.video.id)} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-green-400">
              Voir
            </button>
            <a href={a.video.url} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-center text-xs hover:bg-zinc-800">
              TikTok ↗
            </a>
            <button onClick={() => sendToMontage({ source: { kind: "video", id: String(a.video.id) }, name: `@${a.video.handle} : ${a.video.caption.slice(0, 60)}`, url: `/api/videos/${a.video.id}/media`, durationS: null })} className="rounded-lg border border-green-700 px-3 py-1.5 text-xs text-green-300 hover:bg-green-950">
              ✂️ Montage
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
