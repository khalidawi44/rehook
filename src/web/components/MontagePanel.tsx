import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  fmtDuration,
  type ClipEffect,
  type ClipSource,
  type Cue,
  type MontageJob,
  type MontageRequest,
  type MontageSources,
  type MusicTrack,
  type SubtitleStyle,
  type TextItem,
} from "../api";
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
  effects: ClipEffect[];
};

const PRESETS = [
  { label: "1080x1920 (9:16)", w: 1080, h: 1920 },
  { label: "1080x1080", w: 1080, h: 1080 },
  { label: "1920x1080 (16:9)", w: 1920, h: 1080 },
  { label: "720x1280", w: 720, h: 1280 },
];

const EFFECTS: { key: ClipEffect; label: string }[] = [
  { key: "zoom-in", label: "Zoom avant" },
  { key: "zoom-out", label: "Zoom arrière" },
  { key: "punch", label: "Punchy (contraste)" },
  { key: "bw", label: "Noir et blanc" },
  { key: "warm", label: "Chaud" },
  { key: "cold", label: "Froid" },
  { key: "vignette", label: "Vignette" },
  { key: "sharpen", label: "Netteté" },
  { key: "mirror", label: "Miroir" },
  { key: "blur-bg", label: "Fond flou (vidéo horizontale)" },
  { key: "fade-in", label: "Fondu entrée" },
  { key: "fade-out", label: "Fondu sortie" },
];

const TRANSITIONS = [
  ["none", "Coupe franche"],
  ["fade", "Fondu enchaîné"],
  ["fadeblack", "Fondu au noir"],
  ["slideleft", "Glissement gauche"],
  ["slideup", "Glissement haut"],
  ["wipeleft", "Volet gauche"],
  ["circleopen", "Cercle ouvert"],
  ["pixelize", "Pixels"],
  ["radial", "Radial"],
  ["smoothleft", "Balayage doux"],
  ["zoomin", "Zoom"],
];

const DEFAULT_STYLE: SubtitleStyle = { mode: "karaoke", position: "bottom", size: 84, font: "Anton", color: "#ffffff", highlight: "#facc15", outline: "#000000", box: false, uppercase: true, maxWords: 4 };

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
  const [libTab, setLibTab] = useState<"videos" | "captures" | "renders" | "music">("videos");
  const [q, setQ] = useState("");
  const [clips, setClips] = useState<TClip[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [head, setHead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [out, setOut] = useState({ w: 1080, h: 1920 });
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [transition, setTransition] = useState({ type: "none", durationS: 0.4 });
  const [fade, setFade] = useState(0.3);
  const [name, setName] = useState("");
  const [tool, setTool] = useState<"clip" | "music" | "subs" | "texts" | "export">("clip");
  // Musique
  const [music, setMusic] = useState<MusicTrack[]>([]);
  const [musicSel, setMusicSel] = useState("");
  const [musicOpts, setMusicOpts] = useState({ volume: 0.2, startS: 0, fadeInS: 1, fadeOutS: 2, duck: true });
  const [musicBusy, setMusicBusy] = useState(false);
  // Sous-titres
  const [cues, setCues] = useState<Cue[]>([]);
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);
  const [subsBusy, setSubsBusy] = useState(false);
  const [subsLang, setSubsLang] = useState("fr");
  // Textes
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [exports, setExports] = useState<MontageJob[]>([]);
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const headRef = useRef(head);
  headRef.current = head;

  const loadSources = useCallback(() => api.montageSources().then(setSources).catch(() => {}), []);
  const loadMusic = useCallback(() => api.music().then(setMusic).catch(() => {}), []);
  useEffect(() => {
    loadSources();
    loadMusic();
    api.montages().then(setExports).catch(() => {});
  }, [loadSources, loadMusic]);

  useEffect(() => {
    if (!exports.some((e) => e.status === "running")) return;
    const t = setInterval(() => api.montages().then(setExports).catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [exports]);

  const td = transition.type !== "none" && clips.length > 1 ? transition.durationS : 0;
  const total = Math.max(0, clips.reduce((a, c) => a + clipLen(c), 0) - td * Math.max(0, clips.length - 1));

  const locate = (t: number, list = clipsRef.current) => {
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      const len = clipLen(list[i]);
      if (t < acc + len || i === list.length - 1) return { index: i, local: list[i].inS + Math.max(0, Math.min(len, t - acc)) * list[i].speed, start: acc };
      acc += len;
    }
    return null;
  };

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
    const m = musicRef.current;
    if (m && m.src) {
      m.currentTime = (musicOpts.startS + t) % Math.max(1, m.duration || 1e9);
      m.volume = Math.min(1, musicOpts.volume);
      if (play) m.play().catch(() => {});
      else m.pause();
    }
  }, [musicOpts.startS, musicOpts.volume]);

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
          musicRef.current?.pause();
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
      musicRef.current?.pause();
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
    const c: TClip = { uid: uid(), source: src, name: label, url, durationS: d, inS: 0, outS: d, mute: false, volume: 1, speed: 1, effects: [] };
    setClips((cs) => [...cs, c]);
    setSel(c.uid);
    setTool("clip");
  };
  const update = (id: string, patch: Partial<TClip>) => setClips((cs) => cs.map((c) => (c.uid === id ? { ...c, ...patch } : c)));
  const selected = clips.find((c) => c.uid === sel) ?? null;
  const selStart = selected ? (() => { let acc = 0; for (const c of clips) { if (c.uid === selected.uid) return acc; acc += clipLen(c); } return 0; })() : 0;

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
    setClips((cs) => [...cs.slice(0, i + 1), { ...selected, uid: uid() }, ...cs.slice(i + 1)]);
  };
  const toggleEffect = (e: ClipEffect) => {
    if (!selected) return;
    const has = selected.effects.includes(e);
    update(selected.uid, { effects: has ? selected.effects.filter((x) => x !== e) : [...selected.effects, e] });
  };

  const request = (): MontageRequest => ({
    name: name || undefined,
    clips: clips.map((c) => ({ source: c.source, inS: c.inS, outS: c.outS, mute: c.mute, volume: c.volume, speed: c.speed, effects: c.effects })),
    width: out.w,
    height: out.h,
    fit,
    music: musicSel ? { file: musicSel, ...musicOpts } : null,
    fadeS: fade,
    transition: transition.type === "none" ? null : transition,
    subtitles: cues.length ? { cues, style } : null,
    texts,
  });

  const exportNow = async () => {
    if (!clips.length) return notify("Ajoute au moins un clip");
    try {
      const job = await api.startMontage(request());
      setExports((e) => [job, ...e]);
      setTool("export");
      notify("Export lancé");
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const uploadVideo = async (file: File) => {
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
  const uploadMusic = async (file: File) => {
    setMusicBusy(true);
    try {
      const r = await api.uploadMusic(file, file.name);
      await loadMusic();
      setMusicSel(r.file);
      notify("Musique ajoutée");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setMusicBusy(false);
    }
  };
  const extractAudio = async (c: TClip) => {
    setMusicBusy(true);
    try {
      const r = await api.extractMusic(c.source, `son de ${c.name.slice(0, 40)}`, c.inS, c.outS);
      await loadMusic();
      setMusicSel(r.file);
      setLibTab("music");
      notify("Son du clip enregistré dans la musique");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setMusicBusy(false);
    }
  };

  const generateSubs = async () => {
    if (!clips.length) return notify("Ajoute d'abord des clips");
    setSubsBusy(true);
    try {
      const r = await api.transcribeMontage(request(), subsLang);
      setCues(r.cues);
      notify(`${r.cues.length} sous-titre(s) (${r.provider === "openai" ? "OpenAI" : "Whisper local"})`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSubsBusy(false);
    }
  };
  const updateCue = (id: string, patch: Partial<Cue>) => setCues((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCue = () => setCues((cs) => [...cs, { id: uid(), start: head, end: Math.min(total || head + 2, head + 2), text: "Nouveau texte", words: [] }].sort((a, b) => a.start - b.start));
  const addText = () =>
    setTexts((ts) => [...ts, { id: uid(), text: "Titre", start: head, end: Math.min(total || head + 3, head + 3), x: 0.5, y: 0.25, size: 80, color: "#ffffff", font: "Anton", animation: "pop" }]);
  const updateText = (id: string, patch: Partial<TextItem>) => setTexts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // Aperçu des sous-titres et textes au temps courant.
  const activeCue = cues.find((c) => head >= c.start && head <= c.end);
  const activeTexts = texts.filter((t) => head >= t.start && head <= t.end);
  const previewScale = 420 / 1920;

  type LibItem = { id: string; name: string; durationS: number | null; cover: string | null; url: string };
  const lib: LibItem[] = !sources
    ? []
    : libTab === "videos"
      ? sources.videos.filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()))
      : libTab === "captures"
        ? sources.captures.map((c) => ({ ...c, cover: null }))
        : libTab === "renders"
          ? sources.renders.map((r) => ({ ...r, durationS: null, cover: null }))
          : [];

  const toolBtn = (k: typeof tool, label: string) => (
    <button key={k} onClick={() => setTool(k)} className={`rounded-lg px-3 py-1.5 text-xs ${tool === k ? "bg-zinc-100 text-black" : "border border-zinc-700 hover:bg-zinc-800"}`}>
      {label}
    </button>
  );

  return (
    <div className="my-4 grid gap-4 xl:grid-cols-[300px_1fr]">
      {/* Chutier */}
      <div className="min-w-0 space-y-2 rounded-xl border border-zinc-800 p-3">
        <div className="flex flex-wrap gap-1 text-xs">
          {(["videos", "captures", "renders", "music"] as const).map((t) => (
            <button key={t} onClick={() => setLibTab(t)} className={`rounded-lg px-2 py-1 ${libTab === t ? "bg-zinc-100 text-black" : "border border-zinc-700 hover:bg-zinc-800"}`}>
              {t === "videos" ? "Vidéos" : t === "captures" ? "Enregistrements" : t === "renders" ? "Recréations" : "🎵 Musiques"}
            </button>
          ))}
        </div>
        {libTab === "music" ? (
          <>
            <label className="block cursor-pointer rounded-lg border border-dashed border-zinc-700 p-2 text-center text-xs text-zinc-400 hover:bg-zinc-800">
              {musicBusy ? "Traitement…" : "+ Importer une musique (mp3, wav, m4a…)"}
              <input type="file" accept="audio/*,video/*" className="hidden" disabled={musicBusy} onChange={(e) => e.target.files?.[0] && uploadMusic(e.target.files[0])} />
            </label>
            <ul className="scrollbar-thin max-h-[520px] space-y-1 overflow-y-auto text-sm">
              {music.map((m) => (
                <li key={m.file} className={`flex items-center gap-2 rounded-lg border p-1.5 ${musicSel === m.file ? "border-green-500" : "border-zinc-800"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" title={m.name}>{m.name}</div>
                    <div className="text-xs text-zinc-500">{m.durationS ? fmtDuration(m.durationS) : ""}</div>
                  </div>
                  <audio src={m.url} controls className="h-7 w-28" preload="none" />
                  <button onClick={() => { setMusicSel(m.file); setTool("music"); }} className="rounded-lg bg-green-500 px-2 py-1 text-xs font-semibold text-black hover:bg-green-400">Utiliser</button>
                  <button onClick={() => confirm(`Supprimer « ${m.name} » ?`) && api.deleteMusic(m.file).then(loadMusic)} className="text-xs text-red-300 hover:underline">✕</button>
                </li>
              ))}
              {!music.length ? <li className="p-3 text-center text-xs text-zinc-500">Aucune musique. Importe un fichier, ou extrais le son d'un clip (outil Clip).</li> : null}
            </ul>
          </>
        ) : (
          <>
            {libTab === "videos" ? <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer" className={inputCls} /> : null}
            <label className="block cursor-pointer rounded-lg border border-dashed border-zinc-700 p-2 text-center text-xs text-zinc-400 hover:bg-zinc-800">
              {uploading ? "Import en cours…" : "+ Importer une vidéo (PC ou téléphone)"}
              <input type="file" accept="video/*" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} />
            </label>
            <ul className="scrollbar-thin max-h-[520px] space-y-1 overflow-y-auto text-sm">
              {lib.map((s) => {
                const src: ClipSource = { kind: libTab === "videos" ? "video" : libTab === "captures" ? "capture" : "render", id: s.id };
                return (
                  <li key={s.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 p-1.5">
                    {s.cover ? <img src={s.cover} alt="" className="h-12 w-8 rounded object-cover" /> : <span className="grid h-12 w-8 place-items-center rounded bg-zinc-800 text-xs">🎞</span>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate" title={s.name}>{s.name}</div>
                      {s.durationS ? <div className="text-xs text-zinc-500">{fmtDuration(s.durationS)}</div> : null}
                    </div>
                    <button onClick={() => add(src, s.name, s.url, s.durationS)} className="rounded-lg bg-green-500 px-2 py-1 text-xs font-semibold text-black hover:bg-green-400">+ Ajouter</button>
                  </li>
                );
              })}
              {!lib.length ? <li className="p-3 text-center text-xs text-zinc-500">Rien ici pour l'instant.</li> : null}
            </ul>
          </>
        )}
      </div>

      {/* Aperçu, timeline, outils */}
      <div className="min-w-0 space-y-3">
        <div className="grid gap-3 lg:grid-cols-[auto_1fr]">
          <div className="relative mx-auto max-w-full rounded-xl border border-zinc-800 bg-black" style={{ height: 420, maxHeight: "60vh", aspectRatio: `${out.w} / ${out.h}` }}>
            <video ref={videoRef} playsInline className="h-full w-full rounded-xl" style={{ objectFit: fit }} />
            <audio ref={musicRef} src={musicSel ? music.find((m) => m.file === musicSel)?.url : undefined} loop />
            {activeCue ? (
              <div
                className="pointer-events-none absolute left-2 right-2 flex flex-wrap justify-center gap-x-1 text-center font-bold uppercase leading-tight"
                style={{
                  fontFamily: "Anton, Impact, sans-serif",
                  fontSize: style.size * previewScale * (out.h / 1920) * (1920 / out.h),
                  bottom: style.position === "bottom" ? 420 * previewScale : undefined,
                  top: style.position === "top" ? 260 * previewScale : style.position === "center" ? "45%" : undefined,
                  textShadow: "0 0 6px #000, 0 2px 0 #000",
                  background: style.box ? "rgba(0,0,0,0.5)" : undefined,
                }}
              >
                {(activeCue.words.length ? activeCue.words : activeCue.text.split(/\s+/).map((t) => ({ text: t, start: activeCue.start, end: activeCue.end }))).map((w, i) => (
                  <span key={i} style={{ color: style.mode === "karaoke" && head >= w.start && head <= w.end + 0.05 ? style.highlight : style.color }}>
                    {style.uppercase ? w.text.toUpperCase() : w.text}
                  </span>
                ))}
              </div>
            ) : null}
            {activeTexts.map((t) => (
              <div
                key={t.id}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-pre text-center font-bold"
                style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, fontFamily: "Anton, Impact, sans-serif", fontSize: t.size * previewScale, color: t.color, textShadow: "0 0 6px #000, 0 2px 0 #000" }}
              >
                {t.text}
              </div>
            ))}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap gap-1">
              {toolBtn("clip", "🎬 Clip et effets")}
              {toolBtn("music", "🎵 Musique")}
              {toolBtn("subs", "💬 Sous-titres")}
              {toolBtn("texts", "🔤 Textes")}
              {toolBtn("export", "📤 Export")}
            </div>
            <div className="scrollbar-thin max-h-[380px] overflow-y-auto rounded-xl border border-zinc-800 p-3 text-sm">
              {tool === "clip" ? (
                selected ? (
                  <div className="space-y-3">
                    <div className="truncate font-medium">{selected.name}</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Field label="Début (s)">
                        <input type="number" step="0.1" min={0} value={selected.inS.toFixed(2)} onChange={(e) => update(selected.uid, { inS: Math.max(0, Math.min(selected.outS - 0.05, Number(e.target.value))) })} className={inputCls} />
                      </Field>
                      <Field label="Fin (s)">
                        <input type="number" step="0.1" min={0} value={selected.outS.toFixed(2)} onChange={(e) => update(selected.uid, { outS: Math.min(selected.durationS, Math.max(selected.inS + 0.05, Number(e.target.value))) })} className={inputCls} />
                      </Field>
                      <Field label="Vitesse">
                        <select value={selected.speed} onChange={(e) => update(selected.uid, { speed: Number(e.target.value) })} className={inputCls}>
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => <option key={s} value={s}>x{s}</option>)}
                        </select>
                      </Field>
                      <Field label={`Volume ${Math.round(selected.volume * 100)} %`}>
                        <input type="range" min={0} max={2} step={0.05} value={selected.volume} onChange={(e) => update(selected.uid, { volume: Number(e.target.value) })} className="w-full accent-green-500" />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => update(selected.uid, { mute: !selected.mute })} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">{selected.mute ? "🔇 Son coupé" : "🔊 Son du clip"}</button>
                      <button onClick={() => extractAudio(selected)} disabled={musicBusy} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">🎵 Extraire le son vers la musique</button>
                      <button onClick={() => move(-1)} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">◀ Avant</button>
                      <button onClick={() => move(1)} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Après ▶</button>
                      <button onClick={duplicate} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Dupliquer</button>
                      <button onClick={remove} className="rounded-lg border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950">Supprimer</button>
                    </div>
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Effets du clip (visibles à l'export)</div>
                      <div className="flex flex-wrap gap-1">
                        {EFFECTS.map((e) => (
                          <button key={e.key} onClick={() => toggleEffect(e.key)} className={`rounded-lg border px-2 py-1 text-xs ${selected.effects.includes(e.key) ? "border-green-500 bg-green-500/10 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>
                            {e.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500">Dans le montage : de {fmtS(selStart)} à {fmtS(selStart + clipLen(selected))}.</div>
                  </div>
                ) : (
                  <p className="text-zinc-500">Sélectionne un clip dans la timeline, ou ajoute-en un depuis le chutier.</p>
                )
              ) : null}

              {tool === "music" ? (
                <div className="space-y-3">
                  <Field label="Piste musicale">
                    <select value={musicSel} onChange={(e) => setMusicSel(e.target.value)} className={inputCls}>
                      <option value="">Aucune</option>
                      {music.map((m) => <option key={m.file} value={m.file}>{m.name}{m.durationS ? ` (${fmtDuration(m.durationS)})` : ""}</option>)}
                    </select>
                  </Field>
                  <p className="text-xs text-zinc-500">Importer ou extraire des musiques : onglet 🎵 Musiques du chutier. Pour remplacer le son d'un clip par la musique, coupe son son (outil Clip, « Son coupé »).</p>
                  {musicSel ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Field label={`Volume ${Math.round(musicOpts.volume * 100)} %`}>
                        <input type="range" min={0} max={1.5} step={0.05} value={musicOpts.volume} onChange={(e) => setMusicOpts({ ...musicOpts, volume: Number(e.target.value) })} className="w-full accent-green-500" />
                      </Field>
                      <Field label="Départ dans la musique (s)">
                        <input type="number" step="0.5" min={0} value={musicOpts.startS} onChange={(e) => setMusicOpts({ ...musicOpts, startS: Number(e.target.value) })} className={inputCls} />
                      </Field>
                      <Field label="Fondu entrée (s)">
                        <input type="number" step="0.5" min={0} value={musicOpts.fadeInS} onChange={(e) => setMusicOpts({ ...musicOpts, fadeInS: Number(e.target.value) })} className={inputCls} />
                      </Field>
                      <Field label="Fondu sortie (s)">
                        <input type="number" step="0.5" min={0} value={musicOpts.fadeOutS} onChange={(e) => setMusicOpts({ ...musicOpts, fadeOutS: Number(e.target.value) })} className={inputCls} />
                      </Field>
                      <label className="col-span-2 flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={musicOpts.duck} onChange={(e) => setMusicOpts({ ...musicOpts, duck: e.target.checked })} className="accent-green-500" />
                        Baisser la musique quand on parle
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tool === "subs" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={subsLang} onChange={(e) => setSubsLang(e.target.value)} className={inputCls + " max-w-40"}>
                      {[["fr", "Français"], ["en", "Anglais"], ["es", "Espagnol"], ["de", "Allemand"], ["it", "Italien"], ["pt", "Portugais"], ["auto", "Détecter"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <button onClick={generateSubs} disabled={subsBusy || !clips.length} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-green-400 disabled:opacity-50">
                      {subsBusy ? "Transcription en cours…" : "✨ Générer les sous-titres automatiquement"}
                    </button>
                    <button onClick={addCue} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800">+ Ajouter au curseur</button>
                    {cues.length ? <button onClick={() => setCues([])} className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950">Tout effacer</button> : null}
                  </div>
                  <p className="text-xs text-zinc-500">La première transcription locale télécharge le modèle (environ 80 Mo) ; avec OPENAI_API_KEY dans .env, c'est Whisper en ligne, plus rapide.</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Style">
                      <select value={style.mode} onChange={(e) => setStyle({ ...style, mode: e.target.value as "karaoke" | "block" })} className={inputCls}>
                        <option value="karaoke">Karaoké mot à mot</option>
                        <option value="block">Bloc classique</option>
                      </select>
                    </Field>
                    <Field label="Position">
                      <select value={style.position} onChange={(e) => setStyle({ ...style, position: e.target.value as SubtitleStyle["position"] })} className={inputCls}>
                        <option value="bottom">Bas</option>
                        <option value="center">Centre</option>
                        <option value="top">Haut</option>
                      </select>
                    </Field>
                    <Field label={`Taille ${style.size}`}>
                      <input type="range" min={40} max={160} step={2} value={style.size} onChange={(e) => setStyle({ ...style, size: Number(e.target.value) })} className="w-full accent-green-500" />
                    </Field>
                    <Field label="Mots par ligne">
                      <input type="number" min={1} max={10} value={style.maxWords} onChange={(e) => setStyle({ ...style, maxWords: Number(e.target.value) })} className={inputCls} />
                    </Field>
                    <Field label="Couleur"><input type="color" value={style.color} onChange={(e) => setStyle({ ...style, color: e.target.value })} className="h-9 w-full" /></Field>
                    <Field label="Mot en cours"><input type="color" value={style.highlight} onChange={(e) => setStyle({ ...style, highlight: e.target.value })} className="h-9 w-full" /></Field>
                    <Field label="Contour"><input type="color" value={style.outline} onChange={(e) => setStyle({ ...style, outline: e.target.value })} className="h-9 w-full" /></Field>
                    <div className="flex flex-col gap-1 pt-5 text-xs">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={style.uppercase} onChange={(e) => setStyle({ ...style, uppercase: e.target.checked })} className="accent-green-500" /> Majuscules</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={style.box} onChange={(e) => setStyle({ ...style, box: e.target.checked })} className="accent-green-500" /> Fond sombre</label>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {cues.map((c) => (
                      <li key={c.id} className={`flex items-center gap-1 rounded-lg border p-1 ${activeCue?.id === c.id ? "border-green-500" : "border-zinc-800"}`}>
                        <input type="number" step="0.1" value={c.start.toFixed(1)} onChange={(e) => updateCue(c.id, { start: Number(e.target.value) })} className={inputCls + " w-20"} />
                        <input type="number" step="0.1" value={c.end.toFixed(1)} onChange={(e) => updateCue(c.id, { end: Number(e.target.value) })} className={inputCls + " w-20"} />
                        <input value={c.text} onChange={(e) => updateCue(c.id, { text: e.target.value })} className={inputCls + " flex-1"} />
                        <button onClick={() => goTo(c.start)} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800" title="Aller à ce sous-titre">▶</button>
                        <button onClick={() => setCues((cs) => cs.filter((x) => x.id !== c.id))} className="px-1 text-xs text-red-300">✕</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {tool === "texts" ? (
                <div className="space-y-2">
                  <button onClick={addText} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-green-400">+ Texte au curseur</button>
                  {texts.map((t) => (
                    <div key={t.id} className="space-y-1 rounded-lg border border-zinc-800 p-2">
                      <div className="flex gap-1">
                        <input value={t.text} onChange={(e) => updateText(t.id, { text: e.target.value })} className={inputCls + " flex-1"} />
                        <button onClick={() => setTexts((ts) => ts.filter((x) => x.id !== t.id))} className="px-2 text-xs text-red-300">✕</button>
                      </div>
                      <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
                        <input type="number" step="0.1" title="Début" value={t.start.toFixed(1)} onChange={(e) => updateText(t.id, { start: Number(e.target.value) })} className={inputCls} />
                        <input type="number" step="0.1" title="Fin" value={t.end.toFixed(1)} onChange={(e) => updateText(t.id, { end: Number(e.target.value) })} className={inputCls} />
                        <input type="number" min={10} max={300} title="Taille" value={t.size} onChange={(e) => updateText(t.id, { size: Number(e.target.value) })} className={inputCls} />
                        <input type="color" title="Couleur" value={t.color} onChange={(e) => updateText(t.id, { color: e.target.value })} className="h-9 w-full" />
                        <select value={t.animation} onChange={(e) => updateText(t.id, { animation: e.target.value as TextItem["animation"] })} className={inputCls}>
                          <option value="pop">Pop</option>
                          <option value="fade">Fondu</option>
                          <option value="none">Fixe</option>
                        </select>
                        <select value={`${t.x},${t.y}`} onChange={(e) => { const [x, y] = e.target.value.split(",").map(Number); updateText(t.id, { x, y }); }} className={inputCls}>
                          <option value="0.5,0.15">Haut</option>
                          <option value="0.5,0.25">Haut centré</option>
                          <option value="0.5,0.5">Centre</option>
                          <option value="0.5,0.75">Bas</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  {!texts.length ? <p className="text-xs text-zinc-500">Titres, accroches, mentions : chaque texte a son moment, sa taille, sa couleur et une petite animation.</p> : null}
                </div>
              ) : null}

              {tool === "export" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {PRESETS.map((p) => (
                      <button key={p.label} onClick={() => setOut({ w: p.w, h: p.h })} className={`rounded-lg border px-2 py-1 text-xs ${out.w === p.w && out.h === p.h ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>{p.label}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Largeur"><input type="number" value={out.w} onChange={(e) => setOut({ ...out, w: Number(e.target.value) })} className={inputCls} /></Field>
                    <Field label="Hauteur"><input type="number" value={out.h} onChange={(e) => setOut({ ...out, h: Number(e.target.value) })} className={inputCls} /></Field>
                    <Field label="Cadrage">
                      <select value={fit} onChange={(e) => setFit(e.target.value as "cover" | "contain")} className={inputCls}>
                        <option value="cover">Remplir (recadre)</option>
                        <option value="contain">Tout voir (bandes noires)</option>
                      </select>
                    </Field>
                    <Field label="Fondu début et fin (s)"><input type="number" step="0.1" min={0} max={5} value={fade} onChange={(e) => setFade(Number(e.target.value))} className={inputCls} /></Field>
                    <Field label="Transition entre clips">
                      <select value={transition.type} onChange={(e) => setTransition({ ...transition, type: e.target.value })} className={inputCls}>
                        {TRANSITIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Durée transition (s)"><input type="number" step="0.1" min={0.1} max={1.5} value={transition.durationS} onChange={(e) => setTransition({ ...transition, durationS: Number(e.target.value) })} className={inputCls} /></Field>
                    <Field label="Nom du fichier"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="mon-montage" className={inputCls} /></Field>
                  </div>
                  <button onClick={exportNow} disabled={!clips.length} className="w-full rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50">
                    Exporter en MP4 ({clips.length} clip{clips.length > 1 ? "s" : ""}, {fmtS(total)}{cues.length ? `, ${cues.length} sous-titres` : ""}{texts.length ? `, ${texts.length} texte(s)` : ""})
                  </button>
                  <ul className="space-y-2">
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
                            <video src={e.url} controls className="h-36 rounded bg-black" />
                            <a href={e.url} download className="self-end rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-green-400">Télécharger</a>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={togglePlay} className="rounded-lg bg-zinc-100 px-3 py-1.5 font-semibold text-black hover:bg-white">{playing ? "❚❚ Pause" : "▶ Lire"}</button>
          <span className="font-mono text-xs text-zinc-400">{fmtS(head)} / {fmtS(total)}</span>
          <span className="mx-2 h-5 w-px bg-zinc-700" />
          <button onClick={splitAtHead} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">✂ Couper au curseur</button>
          <button onClick={setInHere} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">[ Début ici</button>
          <button onClick={setOutHere} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">Fin ici ]</button>
          <button onClick={() => goTo(head - 1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">-1 s</button>
          <button onClick={() => goTo(head - 0.1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">-0,1</button>
          <button onClick={() => goTo(head + 0.1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">+0,1</button>
          <button onClick={() => goTo(head + 1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">+1 s</button>
          <span className="ml-auto text-xs text-zinc-500">Effets, transitions et musique s'entendent et se voient à l'export ; l'aperçu montre coupes, sous-titres et textes.</span>
        </div>
        <div
          className="relative h-24 w-full cursor-pointer select-none overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            goTo(((e.clientX - r.left) / r.width) * total);
          }}
        >
          {!clips.length ? <div className="grid h-full place-items-center text-xs text-zinc-500">Ajoute des clips depuis le chutier à gauche.</div> : null}
          <div className="flex h-14">
            {clips.map((c, i) => (
              <div
                key={c.uid}
                onClick={(e) => {
                  e.stopPropagation();
                  setSel(c.uid);
                  setTool("clip");
                  let acc = 0;
                  for (let k = 0; k < i; k++) acc += clipLen(clips[k]);
                  goTo(acc + 0.001);
                }}
                style={{ width: `${(clipLen(c) / Math.max(0.01, total + td * Math.max(0, clips.length - 1))) * 100}%`, background: `hsl(${(i * 67) % 360} 45% ${sel === c.uid ? 38 : 24}%)` }}
                className={`relative h-full overflow-hidden border-r border-black/50 px-2 py-1 text-xs ${sel === c.uid ? "ring-2 ring-inset ring-green-400" : ""}`}
                title={`${c.name} : ${fmtS(c.inS)} à ${fmtS(c.outS)}`}
              >
                <div className="truncate font-medium">{c.name}</div>
                <div className="text-[10px] opacity-80">{fmtS(c.inS)} → {fmtS(c.outS)} {c.speed !== 1 ? `· x${c.speed}` : ""} {c.mute ? "· 🔇" : ""} {c.effects.length ? `· ${c.effects.length} effet(s)` : ""}</div>
              </div>
            ))}
          </div>
          <div className="relative h-5 border-t border-zinc-800">
            {cues.map((c) => (
              <div key={c.id} className="absolute top-1 h-3 rounded bg-yellow-400/70" style={{ left: `${(c.start / Math.max(0.01, total)) * 100}%`, width: `${Math.max(0.3, ((c.end - c.start) / Math.max(0.01, total)) * 100)}%` }} title={c.text} />
            ))}
          </div>
          <div className="relative h-5">
            {texts.map((t) => (
              <div key={t.id} className="absolute top-1 h-3 rounded bg-sky-400/70" style={{ left: `${(t.start / Math.max(0.01, total)) * 100}%`, width: `${Math.max(0.3, ((t.end - t.start) / Math.max(0.01, total)) * 100)}%` }} title={t.text} />
            ))}
            {musicSel ? <div className="absolute bottom-0 left-0 h-1 w-full bg-fuchsia-500/60" title="Musique" /> : null}
          </div>
          {total > 0 ? <div className="pointer-events-none absolute top-0 h-full w-0.5 bg-red-500" style={{ left: `${(head / total) * 100}%` }} /> : null}
        </div>
      </div>
    </div>
  );
};
