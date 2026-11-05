import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDuration, type ClipSource, type MontageJob, type MontageSources } from "../api";
import { Field, inputCls } from "./Modal";

type TClip = {
  uid: string;
  source: ClipSource;
  name: string;
  url: string;
  durationS: number;
  inS: number;
  outS: number;
  mute: boolean;
  volume: number;
  speed: number;
};

const PRESETS = [
  { label: "1080x1920 (9:16)", w: 1080, h: 1920 },
  { label: "1080x1080", w: 1080, h: 1080 },
  { label: "1920x1080 (16:9)", w: 1920, h: 1080 },
  { label: "720x1280", w: 720, h: 1280 },
];

const uid = () => Math.random().toString(36).slice(2, 9);
const clipLen = (c: TClip) => (c.outS - c.inS) / c.speed;
const fmtS = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 10);
    v.onerror = () => resolve(10);
    v.src = url;
  });
}

export const MontagePanel: React.FC<{ notify: (m: string) => void }> = ({ notify }) => {
  const [sources, setSources] = useState<MontageSources | null>(null);
  const [libTab, setLibTab] = useState<"videos" | "captures" | "renders">("videos");
  const [q, setQ] = useState("");
  const [clips, setClips] = useState<TClip[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [head, setHead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [out, setOut] = useState({ w: 1080, h: 1920 });
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [music, setMusic] = useState<string[]>([]);
  const [musicSel, setMusicSel] = useState("");
  const [musicVol, setMusicVol] = useState(0.15);
  const [fade, setFade] = useState(0.3);
  const [name, setName] = useState("");
  const [exports, setExports] = useState<MontageJob[]>([]);
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const headRef = useRef(head);
  headRef.current = head;

  const loadSources = useCallback(() => api.montageSources().then(setSources).catch(() => {}), []);
  useEffect(() => {
    loadSources();
    api.music().then(setMusic).catch(() => {});
    api.montages().then(setExports).catch(() => {});
  }, [loadSources]);

  useEffect(() => {
    if (!exports.some((e) => e.status === "running")) return;
    const t = setInterval(() => api.montages().then(setExports).catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [exports]);

  const total = clips.reduce((a, c) => a + clipLen(c), 0);

  /** Clip et position locale pour une position globale. */
  const locate = (t: number, list = clipsRef.current) => {
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      const len = clipLen(list[i]);
      if (t < acc + len || i === list.length - 1) return { index: i, local: list[i].inS + Math.max(0, Math.min(len, t - acc)) * list[i].speed, start: acc };
      acc += len;
    }
    return null;
  };

  // Aperçu : charge le bon clip et se cale sur le curseur.
  const loadedFor = useRef<string | null>(null);
  const seekTo = useCallback((t: number, play: boolean) => {
    const v = videoRef.current;
    const loc = locate(t);
    if (!v || !loc) return;
    const c = clipsRef.current[loc.index];
    if (loadedFor.current !== c.uid) {
      loadedFor.current = c.uid;
      v.src = c.url;
    }
    v.muted = c.mute;
    v.volume = Math.min(1, c.volume);
    v.playbackRate = c.speed;
    const apply = () => {
      v.currentTime = loc.local;
      if (play) v.play().catch(() => {});
    };
    if (v.readyState >= 1) apply();
    else v.onloadedmetadata = apply;
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (!playing) return;
      const list = clipsRef.current;
      const loc = locate(headRef.current, list);
      if (!loc) return;
      const c = list[loc.index];
      const global = loc.start + (v.currentTime - c.inS) / c.speed;
      if (v.currentTime >= c.outS - 0.03) {
        const nextStart = loc.start + clipLen(c);
        if (loc.index + 1 < list.length) {
          setHead(nextStart + 0.001);
          seekTo(nextStart + 0.001, true);
        } else {
          v.pause();
          setPlaying(false);
          setHead(0);
        }
        return;
      }
      setHead(Math.max(loc.start, global));
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [playing, seekTo]);

  const togglePlay = () => {
    if (!clips.length) return;
    if (playing) {
      videoRef.current?.pause();
      setPlaying(false);
    } else {
      setPlaying(true);
      seekTo(head, true);
    }
  };

  const goTo = (t: number) => {
    const tt = Math.max(0, Math.min(total, t));
    setHead(tt);
    seekTo(tt, playing);
  };

  const add = async (src: ClipSource, label: string, url: string, known?: number | null) => {
    const d = known && known > 0 ? known : await probeDuration(url);
    const c: TClip = { uid: uid(), source: src, name: label, url, durationS: d, inS: 0, outS: d, mute: false, volume: 1, speed: 1 };
    setClips((cs) => [...cs, c]);
    setSel(c.uid);
  };

  const update = (id: string, patch: Partial<TClip>) => setClips((cs) => cs.map((c) => (c.uid === id ? { ...c, ...patch } : c)));
  const selected = clips.find((c) => c.uid === sel) ?? null;
  const selLoc = selected ? (() => { let acc = 0; for (const c of clips) { if (c.uid === selected.uid) return acc; acc += clipLen(c); } return 0; })() : 0;

  const splitAtHead = () => {
    const loc = locate(head);
    if (!loc) return;
    const c = clips[loc.index];
    if (loc.local <= c.inS + 0.05 || loc.local >= c.outS - 0.05) return notify("Place le curseur à l'intérieur du clip");
    const a: TClip = { ...c, uid: uid(), outS: loc.local };
    const b: TClip = { ...c, uid: uid(), inS: loc.local };
    setClips((cs) => [...cs.slice(0, loc.index), a, b, ...cs.slice(loc.index + 1)]);
    setSel(b.uid);
  };
  const setInHere = () => {
    const loc = locate(head);
    if (!loc) return;
    const c = clips[loc.index];
    if (loc.local < c.outS - 0.05) update(c.uid, { inS: Math.max(0, loc.local) });
  };
  const setOutHere = () => {
    const loc = locate(head);
    if (!loc) return;
    const c = clips[loc.index];
    if (loc.local > c.inS + 0.05) update(c.uid, { outS: Math.min(c.durationS, loc.local) });
  };
  const move = (dir: -1 | 1) => {
    if (!selected) return;
    const i = clips.findIndex((c) => c.uid === selected.uid);
    const j = i + dir;
    if (j < 0 || j >= clips.length) return;
    const next = clips.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setClips(next);
  };
  const remove = () => {
    if (!selected) return;
    setClips((cs) => cs.filter((c) => c.uid !== selected.uid));
    setSel(null);
  };
  const duplicate = () => {
    if (!selected) return;
    const i = clips.findIndex((c) => c.uid === selected.uid);
    const copy = { ...selected, uid: uid() };
    setClips((cs) => [...cs.slice(0, i + 1), copy, ...cs.slice(i + 1)]);
  };

  const exportNow = async () => {
    if (!clips.length) return notify("Ajoute au moins un clip");
    try {
      const job = await api.startMontage({
        name: name || undefined,
        clips: clips.map((c) => ({ source: c.source, inS: c.inS, outS: c.outS, mute: c.mute, volume: c.volume, speed: c.speed })),
        width: out.w,
        height: out.h,
        fit,
        music: musicSel || null,
        musicVolume: musicVol,
        fadeS: fade,
      });
      setExports((e) => [job, ...e]);
      notify("Export lancé");
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const c = await api.saveCapture(file, file.name.replace(/\.[^.]+$/, ""));
      notify(`Fichier importé (${fmtDuration(c.durationS)})`);
      await loadSources();
      setLibTab("captures");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  type LibItem = { id: string; name: string; durationS: number | null; cover: string | null; url: string };
  const lib: LibItem[] = !sources
    ? []
    : libTab === "videos"
      ? sources.videos.filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()))
      : libTab === "captures"
        ? sources.captures.map((c) => ({ ...c, cover: null }))
        : sources.renders.map((r) => ({ ...r, durationS: null, cover: null }));

  return (
    <div className="my-4 grid gap-4 xl:grid-cols-[300px_1fr_280px]">
      {/* Chutier */}
      <div className="space-y-2 rounded-xl border border-zinc-800 p-3">
        <div className="flex gap-1 text-xs">
          {(["videos", "captures", "renders"] as const).map((t) => (
            <button key={t} onClick={() => setLibTab(t)} className={`rounded-lg px-2 py-1 ${libTab === t ? "bg-zinc-100 text-black" : "border border-zinc-700 hover:bg-zinc-800"}`}>
              {t === "videos" ? "Vidéos relevées" : t === "captures" ? "Enregistrements et imports" : "Recréations"}
            </button>
          ))}
        </div>
        {libTab === "videos" ? <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer" className={inputCls} /> : null}
        <label className="block cursor-pointer rounded-lg border border-dashed border-zinc-700 p-2 text-center text-xs text-zinc-400 hover:bg-zinc-800">
          {uploading ? "Import en cours…" : "+ Importer un fichier vidéo de mon PC"}
          <input type="file" accept="video/*" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <ul className="scrollbar-thin max-h-[520px] space-y-1 overflow-y-auto text-sm">
          {lib.map((s) => {
            const src: ClipSource = { kind: libTab === "videos" ? "video" : libTab === "captures" ? "capture" : "render", id: s.id };
            const cover = s.cover;
            const dur = s.durationS;
            return (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 p-1.5">
                {cover ? <img src={cover} alt="" className="h-12 w-8 rounded object-cover" /> : <span className="grid h-12 w-8 place-items-center rounded bg-zinc-800 text-xs">🎞</span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate" title={s.name}>{s.name}</div>
                  {dur ? <div className="text-xs text-zinc-500">{fmtDuration(dur)}</div> : null}
                </div>
                <button onClick={() => add(src, s.name, s.url, dur)} className="rounded-lg bg-green-500 px-2 py-1 text-xs font-semibold text-black hover:bg-green-400">
                  + Ajouter
                </button>
              </li>
            );
          })}
          {!lib.length ? <li className="p-3 text-center text-xs text-zinc-500">Rien ici pour l'instant.</li> : null}
        </ul>
      </div>

      {/* Aperçu + timeline */}
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-800 bg-black p-2">
          <video ref={videoRef} playsInline className="mx-auto max-h-[420px] rounded" style={{ aspectRatio: `${out.w} / ${out.h}`, objectFit: fit }} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={togglePlay} className="rounded-lg bg-zinc-100 px-3 py-1.5 font-semibold text-black hover:bg-white">
            {playing ? "❚❚ Pause" : "▶ Lire"}
          </button>
          <span className="font-mono text-xs text-zinc-400">
            {fmtS(head)} / {fmtS(total)}
          </span>
          <span className="mx-2 h-5 w-px bg-zinc-700" />
          <button onClick={splitAtHead} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">✂ Couper au curseur</button>
          <button onClick={setInHere} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">[ Début ici</button>
          <button onClick={setOutHere} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">Fin ici ]</button>
          <button onClick={() => goTo(head - 1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">-1 s</button>
          <button onClick={() => goTo(head - 0.1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">-0,1</button>
          <button onClick={() => goTo(head + 0.1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">+0,1</button>
          <button onClick={() => goTo(head + 1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">+1 s</button>
        </div>
        <div
          className="relative h-20 w-full cursor-pointer select-none overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            goTo(((e.clientX - r.left) / r.width) * total);
          }}
        >
          {!clips.length ? <div className="grid h-full place-items-center text-xs text-zinc-500">Ajoute des clips depuis le chutier à gauche.</div> : null}
          <div className="flex h-full">
            {clips.map((c, i) => (
              <div
                key={c.uid}
                onClick={(e) => {
                  e.stopPropagation();
                  setSel(c.uid);
                  let acc = 0;
                  for (let k = 0; k < i; k++) acc += clipLen(clips[k]);
                  goTo(acc + 0.001);
                }}
                style={{ width: `${(clipLen(c) / Math.max(0.01, total)) * 100}%`, background: `hsl(${(i * 67) % 360} 45% ${sel === c.uid ? 38 : 24}%)` }}
                className={`relative h-full overflow-hidden border-r border-black/50 px-2 py-1 text-xs ${sel === c.uid ? "ring-2 ring-inset ring-green-400" : ""}`}
                title={`${c.name} : ${fmtS(c.inS)} à ${fmtS(c.outS)}`}
              >
                <div className="truncate font-medium">{c.name}</div>
                <div className="text-[10px] opacity-80">
                  {fmtS(c.inS)} → {fmtS(c.outS)} {c.speed !== 1 ? `· x${c.speed}` : ""} {c.mute ? "· 🔇" : ""}
                </div>
              </div>
            ))}
          </div>
          {total > 0 ? <div className="pointer-events-none absolute top-0 h-full w-0.5 bg-red-500" style={{ left: `${(head / total) * 100}%` }} /> : null}
        </div>
        {selected ? (
          <div className="grid gap-2 rounded-xl border border-zinc-800 p-3 text-sm sm:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-2 truncate font-medium">{selected.name}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Début (s)">
                  <input type="number" step="0.1" min={0} max={selected.outS} value={selected.inS.toFixed(2)} onChange={(e) => update(selected.uid, { inS: Math.max(0, Math.min(selected.outS - 0.05, Number(e.target.value))) })} className={inputCls} />
                </Field>
                <Field label="Fin (s)">
                  <input type="number" step="0.1" min={0} max={selected.durationS} value={selected.outS.toFixed(2)} onChange={(e) => update(selected.uid, { outS: Math.min(selected.durationS, Math.max(selected.inS + 0.05, Number(e.target.value))) })} className={inputCls} />
                </Field>
                <Field label="Vitesse">
                  <select value={selected.speed} onChange={(e) => update(selected.uid, { speed: Number(e.target.value) })} className={inputCls}>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                      <option key={s} value={s}>x{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Volume">
                  <input type="range" min={0} max={2} step={0.05} value={selected.volume} onChange={(e) => update(selected.uid, { volume: Number(e.target.value) })} className="w-full accent-green-500" />
                </Field>
              </div>
              <div className="mt-1 text-xs text-zinc-500">Dans le montage : de {fmtS(selLoc)} à {fmtS(selLoc + clipLen(selected))}.</div>
            </div>
            <div className="flex flex-wrap items-start gap-1">
              <button onClick={() => update(selected.uid, { mute: !selected.mute })} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">{selected.mute ? "🔇 Muet" : "🔊 Son"}</button>
              <button onClick={() => move(-1)} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">◀ Avant</button>
              <button onClick={() => move(1)} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Après ▶</button>
              <button onClick={duplicate} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Dupliquer</button>
              <button onClick={remove} className="rounded-lg border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950">Supprimer</button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Export */}
      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="mb-2 text-sm font-medium">Export</div>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => setOut({ w: p.w, h: p.h })} className={`rounded-lg border px-2 py-1 text-xs ${out.w === p.w && out.h === p.h ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Largeur"><input type="number" value={out.w} onChange={(e) => setOut({ ...out, w: Number(e.target.value) })} className={inputCls} /></Field>
            <Field label="Hauteur"><input type="number" value={out.h} onChange={(e) => setOut({ ...out, h: Number(e.target.value) })} className={inputCls} /></Field>
          </div>
          <Field label="Cadrage">
            <select value={fit} onChange={(e) => setFit(e.target.value as "cover" | "contain")} className={inputCls}>
              <option value="cover">Remplir (recadre)</option>
              <option value="contain">Tout voir (bandes noires)</option>
            </select>
          </Field>
          <Field label="Musique" hint="Fichiers dans data/public/music/">
            <select value={musicSel} onChange={(e) => setMusicSel(e.target.value)} className={inputCls}>
              <option value="">Aucune</option>
              {music.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          {musicSel ? (
            <Field label={`Volume musique (${Math.round(musicVol * 100)} %)`}>
              <input type="range" min={0} max={1} step={0.05} value={musicVol} onChange={(e) => setMusicVol(Number(e.target.value))} className="w-full accent-green-500" />
            </Field>
          ) : null}
          <Field label="Fondu début et fin (s)">
            <input type="number" step="0.1" min={0} max={5} value={fade} onChange={(e) => setFade(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Nom du fichier">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mon-montage" className={inputCls} />
          </Field>
          <button onClick={exportNow} disabled={!clips.length} className="mt-2 w-full rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50">
            Exporter en MP4 ({clips.length} clip{clips.length > 1 ? "s" : ""}, {fmtS(total)})
          </button>
        </div>
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="mb-2 text-sm font-medium">Exports ({exports.length})</div>
          <ul className="space-y-2 text-sm">
            {exports.map((e) => (
              <li key={e.id} className="rounded-lg border border-zinc-800 p-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${e.status === "done" ? "bg-green-500" : e.status === "error" ? "bg-red-500" : "animate-pulse bg-amber-400"}`} />
                  <span className="truncate font-medium">{e.name}</span>
                  <span className="ml-auto text-xs text-zinc-500">{e.status === "running" ? `${Math.round(e.progress * 100)} %` : fmtDuration(e.durationS)}</span>
                </div>
                {e.status === "running" ? <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-green-500" style={{ width: `${e.progress * 100}%` }} /></div> : null}
                {e.status === "error" ? <div className="mt-1 text-xs text-red-300">{e.error}</div> : null}
                {e.url ? (
                  <div className="mt-2 flex gap-2">
                    <video src={e.url} controls className="h-28 rounded bg-black" />
                    <a href={e.url} download className="self-end rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-green-400">Télécharger</a>
                  </div>
                ) : null}
              </li>
            ))}
            {!exports.length ? <li className="text-xs text-zinc-500">Aucun export pour l'instant.</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
};
