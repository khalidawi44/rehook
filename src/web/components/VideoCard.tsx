import React from "react";
import { fmtDuration, fmtNum, timeAgo, type VideoCard as Card } from "../api";

export const VideoCard: React.FC<{
  card: Card;
  now?: number;
  onOpen: () => void;
  onRecreate: () => void;
  onFavorite: () => void;
}> = ({ card, now, onOpen, onRecreate, onFavorite }) => {
  const m = card.metrics;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 transition hover:border-zinc-600">
      <button onClick={onOpen} className="relative block w-full bg-zinc-800 text-left">
        {card.cover ? (
          <img src={card.cover} alt="" className="card-cover w-full object-cover" loading="lazy" />
        ) : (
          <div className="card-cover grid w-full place-items-center text-zinc-500">pas de miniature</div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          {m.viral ? <span className="rounded-md bg-violet-500/90 px-2 py-0.5 text-xs font-semibold text-white">Viral</span> : null}
          {card.source === "demo" ? <span className="rounded-md bg-zinc-700/90 px-2 py-0.5 text-xs text-zinc-200">démo</span> : null}
        </div>
        {card.durationS ? <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs">{fmtDuration(card.durationS)}</span> : null}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2 text-sm">
          {card.account.avatar ? (
            <img src={card.account.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-700 text-xs">{card.account.handle[0]?.toUpperCase()}</span>
          )}
          <a href={card.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
            @{card.account.handle}
          </a>
          {card.account.followed ? <span title="Compte suivi" className="text-green-400">●</span> : null}
          {card.region ? <span className="ml-auto text-xs text-zinc-500">{card.region}</span> : null}
        </div>
        <p className="line-clamp-2 text-sm text-zinc-300" title={card.caption}>
          {card.caption || <span className="italic text-zinc-500">sans légende</span>}
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
          <div>
            <div>👁 Vues</div>
            <div className="text-base font-bold text-white">{fmtNum(m.views)}</div>
          </div>
          <div>
            <div>⏱ Vues/h</div>
            <div className="text-base font-bold text-white">{fmtNum(m.viewsPerHour)}</div>
          </div>
          <div>
            <div>📈 Croissance</div>
            <div className="text-base font-bold text-green-400">{m.growth !== null ? "+" + fmtNum(m.growth) : "…"}</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{timeAgo(card.postedAt, now)}</span>
          <span>Engagement {m.engagement !== null ? m.engagement.toFixed(1).replace(".", ",") + " %" : "…"}</span>
        </div>
        <div className="mt-auto flex gap-2 pt-1">
          <button
            onClick={onRecreate}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-3 py-2 text-sm font-semibold text-black hover:bg-green-400"
          >
            ↻ Recréer cette vidéo
          </button>
          <button onClick={onOpen} title="Fiche de la vidéo" className="rounded-xl border border-zinc-700 px-3 hover:bg-zinc-800">
            📄
          </button>
          <button
            onClick={onFavorite}
            title={card.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            className={`rounded-xl border px-3 hover:bg-zinc-800 ${card.favorite ? "border-amber-400 text-amber-300" : "border-zinc-700"}`}
          >
            {card.favorite ? "★" : "☆"}
          </button>
        </div>
      </div>
    </article>
  );
};
