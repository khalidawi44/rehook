import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtNum, type VideoCard } from "../api";
import { sendToMontage } from "../montageQueue";

/** Fil vertical façon TikTok : une vidéo par écran, lecture automatique, actions à droite. */
export const FeedPanel: React.FC<{
  notify: (m: string) => void;
  onOpen: (c: VideoCard) => void;
  onRecreate: (c: VideoCard) => void;
  onChanged: () => void;
}> = ({ notify, onOpen, onRecreate, onChanged }) => {
  const [cards, setCards] = useState<VideoCard[]>([]);
  const [cats, setCats] = useState<{ key: string; n: number; unseen: number }[]>([]);
  const [category, setCategory] = useState(() => localStorage.getItem("niche.feed.cat") ?? "");
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem("niche.feed.muted") !== "0");
  const [current, setCurrent] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const box = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<number>>(new Set());

  const load = useCallback(
    async (more = false) => {
      setLoading(true);
      try {
        const r = await api.feed(category, 24);
        setCats(r.categories);
        setCards((old) => {
          const base = more ? old : [];
          const ids = new Set(base.map((c) => c.id));
          return [...base, ...r.cards.filter((c) => !ids.has(c.id))];
        });
        if (!more) {
          setCurrent(0);
          box.current?.scrollTo({ top: 0 });
        }
      } catch (e) {
        notify((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [category, notify],
  );
  useEffect(() => {
    localStorage.setItem("niche.feed.cat", category);
    load(false);
  }, [category, load]);

  // Vidéo active = celle au centre de l'écran. Marquée « vue » après 1,5 s.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollTop / el.clientHeight);
      if (i !== current) setCurrent(i);
      if (i >= cards.length - 3 && !loading) load(true);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [cards.length, current, loading, load]);
  useEffect(() => {
    const c = cards[current];
    if (!c || seenRef.current.has(c.id)) return;
    const t = setTimeout(() => {
      seenRef.current.add(c.id);
      api.feedSeen([c.id]).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [current, cards]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowDown" || e.key === "j") go(1);
      if (e.key === "ArrowUp" || e.key === "k") go(-1);
      if (e.key === "m") setMuted((m) => !m);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length]);
  const go = (d: number) => {
    const el = box.current;
    if (!el) return;
    const i = Math.max(0, Math.min(cards.length - 1, Math.round(el.scrollTop / el.clientHeight) + d));
    el.scrollTo({ top: i * el.clientHeight, behavior: "smooth" });
  };
  useEffect(() => {
    localStorage.setItem("niche.feed.muted", muted ? "1" : "0");
  }, [muted]);

  const patch = (id: number, p: Partial<VideoCard>) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const save = async (c: VideoCard) => {
    const r = await api.favorite(c.id);
    patch(c.id, { favorite: r.favorite });
    notify(r.favorite ? "Enregistrée pour plus tard (onglet 💾 Enregistrées)." : "Retirée des enregistrées.");
    onChanged();
  };
  const follow = async (c: VideoCard) => {
    try {
      await api.addAccount(c.account.handle);
      setCards((cs) => cs.map((x) => (x.account.handle === c.account.handle ? { ...x, account: { ...x.account, followed: true } } : x)));
      notify(`@${c.account.handle} est maintenant suivi : ses vidéos arrivent à chaque découverte.`);
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const Btn: React.FC<{ onClick: () => void; label: string; icon: string; active?: boolean; title?: string }> = ({ onClick, label, icon, active, title }) => (
    <button onClick={onClick} title={title ?? label} className="flex flex-col items-center gap-0.5 text-[11px] text-zinc-200 drop-shadow">
      <span className={`grid h-11 w-11 place-items-center rounded-full text-xl ${active ? "bg-green-500 text-black" : "bg-black/60 hover:bg-black/80"}`}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="my-3">
      <div className="scrollbar-thin mb-2 flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-xs">
        {[{ key: "", n: 0, unseen: 0 }, ...cats].map((c) => (
          <button key={c.key} onClick={() => setCategory(c.key)} className={`rounded-full border px-3 py-1 ${category === c.key ? "border-green-500 bg-green-500/15 text-green-300" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
            {c.key === "" ? "Tout" : c.key === "niche" ? "Ma niche" : c.key}
            {c.key ? <span className="ml-1 text-zinc-500">{c.unseen ? `${c.unseen} à voir` : c.n}</span> : null}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-zinc-700" />
        <button onClick={() => setMuted(!muted)} className="rounded-full border border-zinc-700 px-3 py-1 hover:bg-zinc-800">{muted ? "🔇 Son coupé (M)" : "🔊 Son (M)"}</button>
        <button onClick={() => load(false)} className="rounded-full border border-zinc-700 px-3 py-1 hover:bg-zinc-800">↻ Mélanger</button>
        <button onClick={() => api.feedReset().then(() => { seenRef.current.clear(); load(false); })} className="rounded-full border border-zinc-700 px-3 py-1 hover:bg-zinc-800" title="Tout remettre en « pas encore vu »">Revoir tout</button>
        <span className="text-zinc-500">↑ ↓ pour passer d'une vidéo à l'autre</span>
      </div>
      {!cards.length && !loading ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center text-zinc-400">
          <p className="text-lg font-semibold text-zinc-200">Le fil est vide pour l'instant</p>
          <p className="mt-2 text-sm">Les vidéos variées arrivent à la prochaine découverte (page Explorer de TikTok : danse, comédie, beauté, sport…). Lance « Actualiser » en haut, puis reviens ici.</p>
        </div>
      ) : null}
      <div ref={box} className="scrollbar-thin mx-auto max-w-[480px] snap-y snap-mandatory overflow-y-auto rounded-2xl bg-black" style={{ height: "calc(100vh - 230px)", minHeight: 520 }}>
        {cards.map((c, i) => {
          const active = i === current;
          const near = Math.abs(i - current) <= 1;
          return (
            <section key={c.id} className="relative flex h-full w-full snap-start items-center justify-center bg-black">
              {near && !failed[c.id] ? (
                <video
                  src={`/api/videos/${c.id}/media`}
                  poster={c.cover ?? undefined}
                  loop
                  playsInline
                  muted={muted}
                  autoPlay={active}
                  ref={(el) => {
                    if (!el) return;
                    if (active) el.play().catch(() => {});
                    else el.pause();
                  }}
                  onError={() => setFailed((f) => ({ ...f, [c.id]: true }))}
                  onClick={(e) => { const v = e.currentTarget; if (v.paused) v.play().catch(() => {}); else v.pause(); }}
                  className="h-full w-full object-contain"
                />
              ) : (
                <img src={c.cover ?? ""} alt="" className="h-full w-full object-contain opacity-80" />
              )}
              {failed[c.id] ? <div className="absolute inset-x-0 top-3 text-center text-xs text-amber-300">Vidéo indisponible ici : « Ouvrir sur TikTok »</div> : null}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pr-20 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  {c.account.avatar ? <img src={c.account.avatar} alt="" className="h-7 w-7 rounded-full" /> : null}
                  @{c.account.handle}
                  {c.account.followed ? <span className="text-green-400">●</span> : null}
                  {c.category ? <span className="rounded bg-white/15 px-1.5 text-[10px] font-normal">{c.category}</span> : null}
                  {c.metrics.viral ? <span className="rounded bg-violet-500/80 px-1.5 text-[10px] font-normal">Viral</span> : null}
                </div>
                <p className="mt-1 line-clamp-3 text-zinc-200">{c.caption || <span className="italic text-zinc-400">sans légende</span>}</p>
                <div className="mt-1 text-xs text-zinc-400">👁 {fmtNum(c.metrics.views)} · ⏱ {fmtNum(c.metrics.viewsPerHour)}/h{c.music ? ` · 🎵 ${c.music}` : ""}</div>
              </div>
              <div className="absolute bottom-20 right-2 flex flex-col gap-3">
                <Btn onClick={() => save(c)} icon={c.favorite ? "💾" : "🔖"} label={c.favorite ? "Enregistrée" : "Enregistrer"} active={c.favorite} title="Garder pour plus tard" />
                <Btn onClick={() => follow(c)} icon={c.account.followed ? "✓" : "➕"} label={c.account.followed ? "Suivi" : "Suivre"} active={c.account.followed} title={`Suivre @${c.account.handle}`} />
                <Btn onClick={() => onRecreate(c)} icon="↻" label="Recréer" />
                <Btn onClick={() => { sendToMontage({ source: { kind: "video", id: String(c.id) }, name: `@${c.account.handle} : ${c.caption.slice(0, 60)}`, url: `/api/videos/${c.id}/media`, durationS: c.durationS }); notify("Envoyée au montage."); }} icon="✂️" label="Montage" />
                <Btn onClick={() => onOpen(c)} icon="📄" label="Fiche" />
                <Btn onClick={() => window.open(c.url, "_blank")} icon="↗" label="TikTok" />
              </div>
            </section>
          );
        })}
        {loading ? <div className="p-6 text-center text-sm text-zinc-500">Chargement…</div> : null}
      </div>
    </div>
  );
};
