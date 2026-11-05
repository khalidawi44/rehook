import React, { useState } from "react";
import { api, timeAgo, type Brief, type Job } from "../api";

const STEPS = ["Analyse de la vidéo source", "Script", "Images", "Voix off", "Rendu vidéo", "Terminé"];

export const JobsPanel: React.FC<{ jobs: Job[]; reload: () => void; notify: (m: string) => void }> = ({ jobs, reload, notify }) => {
  const [open, setOpen] = useState<number | null>(null);
  if (!jobs.length) {
    return (
      <div className="my-10 rounded-xl border border-dashed border-zinc-700 p-10 text-center text-zinc-400">
        Aucune recréation pour l'instant. Cliquez sur « Recréer cette vidéo » sur une carte.
      </div>
    );
  }
  return (
    <div className="my-4 space-y-3">
      {jobs.map((j) => (
        <JobRow key={j.id} job={j} open={open === j.id} toggle={() => setOpen(open === j.id ? null : j.id)} reload={reload} notify={notify} />
      ))}
    </div>
  );
};

const JobRow: React.FC<{ job: Job; open: boolean; toggle: () => void; reload: () => void; notify: (m: string) => void }> = ({ job, open, toggle, reload, notify }) => {
  const brief = job.brief ? (JSON.parse(job.brief) as Brief) : null;
  const pct = Math.round(job.progress * 100);
  const color = job.status === "done" ? "bg-green-500" : job.status === "error" ? "bg-red-500" : "bg-amber-400";
  const remove = async () => {
    if (!confirm("Supprimer cette recréation et sa vidéo ?")) return;
    await api.deleteJob(job.id);
    reload();
  };
  const retry = async (reuseBrief: boolean) => {
    await api.retryJob(job.id, { reuseBrief });
    notify(reuseBrief ? "Nouveau rendu lancé avec le même script" : "Nouveau script et nouveau rendu lancés");
    reload();
  };
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => notify("Copié"));
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <button onClick={toggle} className="flex w-full items-center gap-3 p-3 text-left">
        {job.video.cover ? <img src={job.video.cover} alt="" className="h-16 w-12 rounded-lg object-cover" /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">#{job.id}</span>
            <span className="text-zinc-400">d'après @{job.video.handle}</span>
            <span className="ml-auto text-xs text-zinc-500">{timeAgo(job.created_at)}</span>
          </div>
          <div className="truncate text-sm text-zinc-300">{brief?.title ?? job.video.caption}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${color} ${job.status === "running" ? "animate-pulse" : ""}`} />
            {job.status === "error" ? <span className="text-red-300">Erreur : {job.error}</span> : <span>{job.step}</span>}
            {job.status === "running" ? <span>{pct} %</span> : null}
          </div>
          {job.status === "running" || job.status === "queued" ? (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
        </div>
      </button>
      {open ? (
        <div className="grid gap-4 border-t border-zinc-800 p-4 md:grid-cols-[300px_1fr]">
          <div>
            {job.output_file ? (
              <>
                <video src={`/renders/${job.output_file}`} controls className="w-full rounded-xl bg-black" />
                <a href={`/renders/${job.output_file}`} download className="mt-2 block rounded-lg bg-green-500 px-3 py-2 text-center text-sm font-semibold text-black hover:bg-green-400">
                  Télécharger le MP4
                </a>
              </>
            ) : (
              <div className="grid aspect-[9/16] place-items-center rounded-xl bg-zinc-900 text-sm text-zinc-500">
                {job.status === "error" ? "Pas de vidéo" : "En cours…"}
              </div>
            )}
            <ol className="mt-3 space-y-1 text-xs text-zinc-400">
              {STEPS.map((s, i) => {
                const idx = STEPS.indexOf(job.step);
                const done = job.status === "done" || i < idx;
                const cur = s === job.step && job.status === "running";
                return (
                  <li key={s} className={done ? "text-green-400" : cur ? "text-amber-300" : ""}>
                    {done ? "✓" : cur ? "▶" : "○"} {s}
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {brief ? (
                <button onClick={() => retry(true)} className="rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800">
                  Refaire le rendu
                </button>
              ) : null}
              <button onClick={() => retry(false)} className="rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800">
                Nouveau script
              </button>
              <button onClick={remove} className="rounded-lg border border-red-900 px-2 py-1 text-red-300 hover:bg-red-950">
                Supprimer
              </button>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            {brief ? (
              <>
                {brief.mode === "tournage" ? (
                  <div className="rounded-xl border border-amber-700 bg-amber-500/10 p-3 text-amber-200">
                    <div className="font-semibold">🎬 Sketch à tourner</div>
                    <p className="text-sm">
                      La source est jouée par des personnes : Niche te donne le script à filmer, plan par plan. La vidéo rendue ci-contre est une maquette (voix + texte) pour caler le rythme.
                    </p>
                    {brief.shootingTips ? <p className="mt-1 text-sm text-amber-100">{brief.shootingTips}</p> : null}
                  </div>
                ) : null}
                {brief.sourceSummary ? (
                  <div className="rounded-xl border border-zinc-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Ce qui se passe dans la vidéo source</div>
                    {brief.analysis?.frames.length ? (
                      <div className="my-2 flex gap-1 overflow-x-auto">
                        {brief.analysis.frames.map((f) => (
                          <img key={f} src={f} alt="" className="h-28 w-16 flex-none rounded object-cover" />
                        ))}
                      </div>
                    ) : null}
                    <p className="text-zinc-300">{brief.sourceSummary}</p>
                    {brief.mechanism ? <p className="mt-1 text-sm text-zinc-400">Mécanisme : {brief.mechanism}</p> : null}
                    {brief.analysis?.stickers.length ? <p className="mt-1 text-xs text-zinc-500">Texte incrusté : {brief.analysis.stickers.map((t) => `« ${t} »`).join(" / ")}</p> : null}
                    {brief.analysis?.transcript ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-zinc-500">Transcription ({brief.analysis.transcriptSource === "tiktok" ? "sous-titres TikTok" : "Whisper"})</summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">{brief.analysis.transcript}</pre>
                      </details>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">Pas de transcription pour cette vidéo (pas de sous-titres TikTok ; mettre OPENAI_API_KEY pour Whisper).</p>
                    )}
                  </div>
                ) : null}
                <div className="rounded-xl border border-zinc-800 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Pourquoi la source marche</div>
                  <p className="text-zinc-300">{brief.whyItWorks}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Niche : {brief.niche} · Format : {brief.format} · Langue : {brief.language}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Accroche</div>
                  <p className="text-lg font-bold">{brief.hook}</p>
                </div>
                <div className="rounded-xl border border-zinc-800 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Scènes</div>
                  <ol className="space-y-2">
                    {brief.scenes.map((s, i) => (
                      <li key={i} className="rounded-lg bg-zinc-900 p-2">
                        <div className="font-semibold">
                          {i + 1}. {s.onScreen} <span className="text-xs font-normal text-zinc-500">({s.seconds} s)</span>
                        </div>
                        <div className="text-zinc-300">{s.narration}</div>
                        <div className="text-xs text-zinc-500">Visuel : {s.visual}</div>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 font-medium">Fin : {brief.cta}</p>
                  {brief.credits?.length ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-zinc-500">Clips utilisés ({brief.credits.length}, licence Pexels)</summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-zinc-400">
                        {brief.credits.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
                <div className="rounded-xl border border-zinc-800 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Légende et hashtags</div>
                    <button onClick={() => copy(brief.caption + "\n\n" + brief.hashtags.map((h) => "#" + h).join(" "))} className="text-xs text-green-400 hover:underline">
                      Copier
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-zinc-300">{brief.caption}</p>
                  <p className="mt-1 text-zinc-400">{brief.hashtags.map((h) => "#" + h).join(" ")}</p>
                </div>
              </>
            ) : null}
            <details className="rounded-xl border border-zinc-800 p-3">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">Journal</summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">{job.log || "…"}</pre>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
};
