import React, { useEffect, useState } from "react";
import { api, fmtNum, timeAgo, type Idea, type IdeasResult } from "../api";
import { inputCls } from "./Modal";

/** Idées de vidéos à tourner, proposées par le modèle à partir des vidéos qui marchent. */
export const IdeasPanel: React.FC<{ notify: (m: string) => void; onRecreate: (videoId: number, twist: string) => void; hasModel: boolean }> = ({ notify, onRecreate, hasModel }) => {
  const [open, setOpen] = useState(() => localStorage.getItem("rehook.ideas.open") === "1");
  const [result, setResult] = useState<IdeasResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(7);
  const [count, setCount] = useState(8);
  const [theme, setTheme] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("rehook.ideas.done") ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem("rehook.ideas.open", open ? "1" : "0");
    if (open && !result) api.ideas().then((r) => setResult(r.result)).catch(() => {});
  }, [open, result]);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.generateIdeas({ days, count, theme });
      setResult(r);
      notify(`${r.ideas.length} idées proposées à partir de ${r.sourcesCount} vidéos.`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copy = (i: Idea) => {
    const txt = [i.title, "", "Accroche : " + i.hook, "Format : " + i.format + " · " + i.durationS + " s", "", ...i.script.map((l, k) => `${k + 1}. ${l}`), "", i.hashtags.map((h) => "#" + h).join(" ")].join("\n");
    navigator.clipboard?.writeText(txt).then(() => notify("Idée copiée."));
  };
  const toggleDone = (key: string) => {
    const next = { ...done, [key]: !done[key] };
    setDone(next);
    localStorage.setItem("rehook.ideas.done", JSON.stringify(next));
  };
  const twistFor = (i: Idea) => `Idée à suivre : ${i.title}. Accroche : ${i.hook}. Format ${i.format}, ${i.durationS} s. Déroulé : ${i.script.join(" / ")}`;

  return (
    <div className="my-3 rounded-xl border border-zinc-800">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <span className="font-medium">💡 Idées de vidéos à tourner</span>
        <span className="text-xs text-zinc-500">{open ? "replier" : "déplier"}</span>
        {result ? <span className="ml-auto text-xs text-zinc-500">{result.ideas.length} idées · {timeAgo(result.at)}</span> : null}
      </button>
      {open ? (
        <div className="border-t border-zinc-800 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs">
              <option value={1}>Vidéos des 24 h</option>
              <option value={3}>3 jours</option>
              <option value={7}>7 jours</option>
              <option value={30}>Tout</option>
            </select>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs">
              {[5, 8, 12, 20].map((n) => (
                <option key={n} value={n}>{n} idées</option>
              ))}
            </select>
            <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Thème (optionnel) : ex. musique viking, humour, bikini" className={inputCls + " max-w-xs text-xs"} />
            <button onClick={generate} disabled={busy || !hasModel} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-green-400 disabled:opacity-50">
              {busy ? "Réflexion en cours…" : result ? "Nouvelles idées" : "Proposer des idées"}
            </button>
            {!hasModel ? <span className="text-xs text-amber-300">ANTHROPIC_API_KEY manquante dans .env</span> : null}
          </div>
          {!result && !busy ? <p className="mt-3 text-zinc-500">Le modèle lit les vidéos qui marchent dans ta niche (légendes, hashtags, durées, chiffres) et propose des vidéos à faire, avec accroche, déroulé et hashtags.</p> : null}
          {result ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {result.ideas.map((i, k) => {
                const key = `${result.at}-${k}`;
                return (
                  <article key={key} className={`flex flex-col gap-2 rounded-xl border p-3 ${done[key] ? "border-zinc-800 opacity-60" : "border-zinc-700 bg-zinc-900/60"}`}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={!!done[key]} onChange={() => toggleDone(key)} title="Déjà tournée" className="mt-1 accent-green-500" />
                      <div className="flex-1">
                        <div className="font-semibold">{i.title}</div>
                        <div className="text-xs text-zinc-500">{i.format} · {i.durationS} s · {i.difficulty}</div>
                      </div>
                    </div>
                    <p className="rounded-lg bg-zinc-800/80 p-2 text-xs"><span className="text-zinc-500">Accroche : </span>{i.hook}</p>
                    <ol className="list-decimal space-y-0.5 pl-5 text-xs text-zinc-300">
                      {i.script.map((l, j) => (
                        <li key={j}>{l}</li>
                      ))}
                    </ol>
                    <p className="text-xs text-zinc-400">{i.why}</p>
                    {i.hashtags.length ? <p className="text-xs text-green-300">{i.hashtags.map((h) => "#" + h).join(" ")}</p> : null}
                    {i.sources.length ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {i.sources.map((s) => (
                          <a key={s.id} href={s.url} target="_blank" rel="noreferrer" title={`@${s.handle} · ${fmtNum(s.views)} vues`} className="flex items-center gap-1 rounded-md border border-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-800">
                            {s.cover ? <img src={s.cover} alt="" className="h-8 w-6 rounded object-cover" /> : null}@{s.handle}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-auto flex gap-2 pt-1">
                      {i.sources[0] ? (
                        <button onClick={() => onRecreate(i.sources[0].id, twistFor(i))} className="flex-1 rounded-lg bg-green-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-green-400">
                          ↻ Recréer avec cette idée
                        </button>
                      ) : null}
                      {i.sources[0] ? (
                        <a href={`/api/videos/${i.sources[0].id}/media?download=1`} download onClick={() => copy(i)} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800" title="Télécharge la vidéo source et copie le script, pour monter dans CapCut">
                          ⬇ CapCut
                        </a>
                      ) : null}
                      <button onClick={() => copy(i)} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800">
                        Copier
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
