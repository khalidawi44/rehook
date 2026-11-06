import React, { useEffect, useState } from "react";
import { api, fmtNum, type Trends } from "../api";

export const TrendsPanel: React.FC = () => {
  const [t, setT] = useState<Trends | null>(null);
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) api.trends(days).then(setT).catch(() => {});
  }, [open, days]);
  const maxH = t ? Math.max(1, ...t.hours) : 1;
  return (
    <div className="my-3 rounded-xl border border-zinc-800">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <span className="font-medium">📊 Ce qui marche dans ta niche</span>
        <span className="text-xs text-zinc-500">{open ? "replier" : "déplier"}</span>
        {open ? (
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} onClick={(e) => e.stopPropagation()} className="ml-auto rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs">
            <option value={1}>24 h</option>
            <option value={3}>3 jours</option>
            <option value={7}>7 jours</option>
          </select>
        ) : null}
      </button>
      {open && t ? (
        <div className="grid gap-4 border-t border-zinc-800 p-3 text-sm md:grid-cols-3">
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Hashtags des virales ({t.virals} vidéos)</div>
            {t.topTags.length ? (
              <ul className="space-y-0.5">
                {t.topTags.map((h) => (
                  <li key={h.tag} className="flex justify-between gap-2">
                    <span>#{h.tag}</span>
                    <span className="text-zinc-500">{h.n} vidéo{h.n > 1 ? "s" : ""} · {fmtNum(h.views)} vues</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-zinc-500">Pas encore de vidéo virale sur la période.</p>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Comptes qui cartonnent</div>
            <ul className="space-y-0.5">
              {t.topAccounts.map((a) => (
                <li key={a.handle} className="flex justify-between gap-2">
                  <a href={`https://www.tiktok.com/@${a.handle}`} target="_blank" rel="noreferrer" className="hover:underline">@{a.handle}</a>
                  <span className="text-zinc-500">{a.n} · {fmtNum(a.views)} vues</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Durées</div>
            <ul className="space-y-0.5 text-zinc-300">
              {Object.entries(t.durationBuckets).map(([k, n]) => (
                <li key={k} className="flex justify-between"><span>{k}</span><span className="text-zinc-500">{n}</span></li>
              ))}
            </ul>
            {t.medianDurationS ? <p className="mt-1 text-xs text-zinc-500">Durée médiane des virales : {Math.round(t.medianDurationS)} s.</p> : null}
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Heures de publication des virales</div>
            <div className="flex h-24 items-end gap-0.5">
              {t.hours.map((n, h) => (
                <div key={h} className="flex-1 rounded-t bg-green-500/70" style={{ height: `${(n / maxH) * 100}%` }} title={`${h} h : ${n}`} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500"><span>0 h</span><span>12 h</span><span>23 h</span></div>
            <p className="mt-2 text-xs text-zinc-500">{t.alerts} alerte(s) sur la période. Repères généraux TikTok France : 12 h à 14 h et 19 h à 22 h, mardi à jeudi et dimanche soir.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};
