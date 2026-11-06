import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  fmtDuration,
  fmtNum,
  type ClipEffect,
  type ClipSource,
  type Cue,
  type MontageJob,
  type MontageRequest,
  type MontageSources,
  type MusicTrack,
  type Project,
  type PublishSource,
  type SubtitleStyle,
  type TextItem,
} from "../api";
import { Field, inputCls } from "./Modal";
import { PublishPanel } from "./PublishPanel";
import { takePending } from "../montageQueue";

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
  smartCrop?: boolean;
};

const PRESETS = [
  { label: "1080x1920 (9:16)", w: 1080, h: 1920 },
  { label: "1080x1080", w: 1080, h: 1080 },
  { label: "1920x1080 (16:9)", w: 1920, h: 1080 },
  { label: "720x1280", w: 720, h: 1280 },
];

const EFFECT_GROUPS: { title: string; items: { key: ClipEffect; label: string }[] }[] = [
  {
    title: "Filtres",
    items: [
      { key: "punch", label: "Punchy" },
      { key: "cinematic", label: "Cinéma" },
      { key: "vintage", label: "Vintage" },
      { key: "sepia", label: "Sépia" },
      { key: "bw", label: "Noir et blanc" },
      { key: "warm", label: "Chaud" },
      { key: "cold", label: "Froid" },
      { key: "dream", label: "Rêve" },
      { key: "glow", label: "Halo" },
      { key: "contrast-hard", label: "Contraste dur" },
      { key: "invert", label: "Négatif" },
      { key: "vignette", label: "Vignette" },
      { key: "sharpen", label: "Netteté" },
      { key: "blur", label: "Flou" },
      { key: "pixelate", label: "Pixels" },
    ],
  },
  {
    title: "Mouvement et cadre",
    items: [
      { key: "zoom-in", label: "Zoom avant" },
      { key: "zoom-out", label: "Zoom arrière" },
      { key: "shake", label: "Tremblement" },
      { key: "mirror", label: "Miroir" },
      { key: "letterbox", label: "Bandes cinéma" },
      { key: "blur-bg", label: "Fond flou (vidéo horizontale)" },
    ],
  },
  {
    title: "Entrée et sortie",
    items: [
      { key: "fade-in", label: "Fondu entrée" },
      { key: "flash", label: "Flash blanc" },
      { key: "fade-out", label: "Fondu sortie" },
    ],
  },
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

const DEFAULT_STYLE: SubtitleStyle = { mode: "karaoke", position: "bottom", size: 84, font: "Anton", color: "#ffffff", highlight: "#facc15", outline: "#000000", box: false, uppercase: true, maxWords: 4, animation: "pop", emojis: false };
const FONTS = ["Anton", "Permanent Marker", "Rubik Spray Paint", "Lobster"];

type Template = {
  key: string;
  label: string;
  desc: string;
  style: Partial<SubtitleStyle>;
  transition: { type: string; durationS: number };
  fadeS: number;
  texts: (total: number) => Omit<TextItem, "id">[];
  effects?: ClipEffect[];
  musicVolume?: number;
};
const TEMPLATES: Template[] = [
  {
    key: "storytime",
    label: "Storytime",
    desc: "Accroche POV en haut, karaoké jaune, fondu entre les scènes.",
    style: { mode: "karaoke", animation: "pop", position: "bottom", highlight: "#facc15", font: "Anton", emojis: true },
    transition: { type: "fade", durationS: 0.3 },
    fadeS: 0.3,
    texts: (t) => [{ text: "POV : …", start: 0, end: Math.min(3, t), x: 0.5, y: 0.18, size: 84, color: "#ffffff", font: "Anton", animation: "pop" }],
    effects: ["punch"],
  },
  {
    key: "avant-apres",
    label: "Avant / Après",
    desc: "Deux parties, titres AVANT et APRÈS, volet entre les deux.",
    style: { mode: "block", position: "bottom", font: "Anton" },
    transition: { type: "wipeleft", durationS: 0.4 },
    fadeS: 0.2,
    texts: (t) => [
      { text: "AVANT", start: 0, end: t / 2, x: 0.5, y: 0.15, size: 110, color: "#f87171", font: "Anton", animation: "pop" },
      { text: "APRÈS", start: t / 2, end: t, x: 0.5, y: 0.15, size: 110, color: "#4ade80", font: "Anton", animation: "pop" },
    ],
  },
  {
    key: "top3",
    label: "Top 3",
    desc: "Numéros 3, 2, 1 sur trois tiers, glissement entre les clips.",
    style: { mode: "karaoke", animation: "box", position: "bottom", highlight: "#38bdf8", font: "Anton" },
    transition: { type: "slideleft", durationS: 0.35 },
    fadeS: 0.2,
    texts: (t) => ["3", "2", "1"].map((n, i) => ({ text: `N°${n}`, start: (i * t) / 3, end: ((i + 1) * t) / 3, x: 0.5, y: 0.14, size: 120, color: "#ffffff", font: "Anton", animation: "pop" as const })),
  },
  {
    key: "reaction",
    label: "Réaction",
    desc: "Bandes cinéma, zoom lent, sous-titres au centre, gros emojis.",
    style: { mode: "karaoke", animation: "bounce", position: "center", highlight: "#fb7185", font: "Permanent Marker", emojis: true, size: 92 },
    transition: { type: "fadeblack", durationS: 0.25 },
    fadeS: 0.2,
    texts: () => [],
    effects: ["letterbox", "zoom-in"],
  },
  {
    key: "teaser",
    label: "Teaser",
    desc: "Flash blanc au début, contraste dur, titre choc puis « la suite en commentaire ».",
    style: { mode: "block", position: "center", font: "Anton", size: 96, box: true },
    transition: { type: "zoomin", durationS: 0.3 },
    fadeS: 0.4,
    texts: (t) => [
      { text: "TU VAS PAS LE CROIRE", start: 0, end: Math.min(2.5, t), x: 0.5, y: 0.5, size: 100, color: "#ffffff", font: "Anton", animation: "pop" },
      { text: "La suite en commentaire 👇", start: Math.max(0, t - 2.5), end: t, x: 0.5, y: 0.8, size: 64, color: "#facc15", font: "Anton", animation: "fade" },
    ],
    effects: ["contrast-hard", "flash"],
  },
  {
    key: "astuce",
    label: "Astuce / Tuto",
    desc: "Étapes numérotées, karaoké sobre, cinéma doux.",
    style: { mode: "karaoke", animation: "none", position: "bottom", highlight: "#4ade80", font: "Anton", size: 76 },
    transition: { type: "smoothleft", durationS: 0.3 },
    fadeS: 0.3,
    texts: (t) => [{ text: "Étape 1", start: 0, end: Math.min(3, t), x: 0.5, y: 0.16, size: 80, color: "#4ade80", font: "Anton", animation: "pop" }],
    effects: ["cinematic"],
  },
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
  const [libTab, setLibTab] = useState<"videos" | "captures" | "renders" | "music">("videos");
  const [q, setQ] = useState("");
  const [libSort, setLibSort] = useState<"recent" | "views" | "duration" | "name">("recent");
  const [libFollowed, setLibFollowed] = useState(false);
  const [libFav, setLibFav] = useState(false);
  const [libBig, setLibBig] = useState(false);
  const [bigPreview, setBigPreview] = useState(false);
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
  const [publish, setPublish] = useState<{ source: PublishSource; title: string } | null>(null);
  const [cover, setCover] = useState<{ on: boolean; atS: number; title: string }>({ on: false, atS: 1, title: "" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Mon montage");
  const [showThumbs, setShowThumbs] = useState(true);
  const [silBusy, setSilBusy] = useState(false);
  const [transBusy, setTransBusy] = useState(false);
  const [trendsOpen] = useState(false);
  void trendsOpen;
  const historyRef = useRef<{ past: string[]; future: string[]; last: string }>({ past: [], future: [], last: "" });
  const restoringRef = useRef(false);
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
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: "scrub" } | { kind: "trim"; uid: string; edge: "in" | "out"; startX: number; inS: number; outS: number } | null>(null);
  const timelineLen = total + td * Math.max(0, clips.length - 1);
  const xToTime = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || !r.width) return 0;
    return ((clientX - r.left) / r.width) * total;
  };
  const onTrackDown = (e: React.PointerEvent) => {
    if (!clips.length) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { kind: "scrub" };
    goTo(xToTime(e.clientX));
  };
  const onTrackMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "scrub") return goTo(xToTime(e.clientX));
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const dt = ((e.clientX - d.startX) / r.width) * Math.max(0.01, timelineLen);
    const c = clipsRef.current.find((x) => x.uid === d.uid);
    if (!c) return;
    if (d.edge === "in") update(d.uid, { inS: Math.max(0, Math.min(d.outS - 0.1, d.inS + dt * c.speed)) });
    else update(d.uid, { outS: Math.min(c.durationS, Math.max(d.inS + 0.1, d.outS + dt * c.speed)) });
  };
  const onTrackUp = () => (dragRef.current = null);
  const startTrim = (e: React.PointerEvent, c: TClip, edge: "in" | "out") => {
    e.stopPropagation();
    (trackRef.current as HTMLElement | null)?.setPointerCapture(e.pointerId);
    dragRef.current = { kind: "trim", uid: c.uid, edge, startX: e.clientX, inS: c.inS, outS: c.outS };
    setSel(c.uid);
    setTool("clip");
  };

  // Raccourcis : espace lecture, flèches ±0,1 s (Maj : ±1 s), S couper, I/O début/fin, Suppr.
  const actionsRef = useRef<{ togglePlay: () => void; split: () => void; setIn: () => void; setOut: () => void; remove: () => void }>({ togglePlay: () => {}, split: () => {}, setIn: () => {}, setOut: () => {}, remove: () => {} });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const a = actionsRef.current;
      if (e.code === "Space") { e.preventDefault(); a.togglePlay(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goToRef.current(headRef.current - (e.shiftKey ? 1 : 0.1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goToRef.current(headRef.current + (e.shiftKey ? 1 : 0.1)); }
      else if (e.key === "s" || e.key === "S") a.split();
      else if (e.key === "i" || e.key === "I") a.setIn();
      else if (e.key === "o" || e.key === "O") a.setOut();
      else if (e.key === "Delete" || e.key === "Backspace") a.remove();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const consumePending = async () => {
    for (const p of takePending()) await add(p.source, p.name, p.url, p.durationS);
  };
  useEffect(() => {
    const h = () => consumePending();
    window.addEventListener("niche:goto-montage", h);
    return () => window.removeEventListener("niche:goto-montage", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  actionsRef.current = { togglePlay, split: splitAtHead, setIn: setInHere, setOut: setOutHere, remove };

  const toggleEffect = (e: ClipEffect) => {
    if (!selected) return;
    const has = selected.effects.includes(e);
    update(selected.uid, { effects: has ? selected.effects.filter((x) => x !== e) : [...selected.effects, e] });
  };

  // ---- Annuler / rétablir et sauvegarde automatique ----------------------------
  const snapshot = () => JSON.stringify({ clips, cues, texts, style, out, fit, transition, fade, musicSel, musicOpts, name, cover });
  const restore = (json: string) => {
    restoringRef.current = true;
    try {
      const st = JSON.parse(json) as { clips: TClip[]; cues: Cue[]; texts: TextItem[]; style: SubtitleStyle; out: { w: number; h: number }; fit: "cover" | "contain"; transition: { type: string; durationS: number }; fade: number; musicSel: string; musicOpts: typeof musicOpts; name: string; cover: typeof cover };
      setClips(st.clips ?? []);
      setCues(st.cues ?? []);
      setTexts(st.texts ?? []);
      setStyle({ ...DEFAULT_STYLE, ...(st.style ?? {}) });
      if (st.out) setOut(st.out);
      if (st.fit) setFit(st.fit);
      if (st.transition) setTransition(st.transition);
      if (typeof st.fade === "number") setFade(st.fade);
      setMusicSel(st.musicSel ?? "");
      if (st.musicOpts) setMusicOpts(st.musicOpts);
      setName(st.name ?? "");
      if (st.cover) setCover(st.cover);
    } finally {
      setTimeout(() => (restoringRef.current = false), 50);
    }
  };
  useEffect(() => {
    const h = historyRef.current;
    const cur = snapshot();
    if (restoringRef.current || cur === h.last) return;
    const t = setTimeout(() => {
      if (h.last) h.past.push(h.last);
      if (h.past.length > 60) h.past.shift();
      h.future = [];
      h.last = cur;
      try {
        localStorage.setItem("niche.montage.autosave", cur);
      } catch {
        // stockage indisponible
      }
      if (projectId) api.saveProject({ id: projectId, name: projectName, state: JSON.parse(cur) }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, cues, texts, style, out, fit, transition, fade, musicSel, musicOpts, name, cover]);
  const undo = () => {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(h.last);
    h.last = prev;
    restore(prev);
  };
  const redo = () => {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(h.last);
    h.last = next;
    restore(next);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Reprise automatique du dernier montage au chargement.
  useEffect(() => {
    api.projects().then(setProjects).catch(() => {});
    try {
      const saved = localStorage.getItem("niche.montage.autosave");
      if (saved && JSON.parse(saved).clips?.length) {
        restore(saved);
        historyRef.current.last = saved;
        notify("Dernier montage repris automatiquement");
      }
    } catch {
      // rien à reprendre
    }
    // Les clips « envoyés au montage » depuis un autre écran s'ajoutent après la reprise.
    consumePending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveAsProject = async () => {
    const n = prompt("Nom du projet", projectName) ?? "";
    if (!n.trim()) return;
    const p = await api.saveProject({ id: projectId ?? undefined, name: n.trim(), state: JSON.parse(snapshot()) });
    setProjectId(p.id);
    setProjectName(p.name);
    setProjects(await api.projects());
    notify("Projet enregistré");
  };
  const openProject = async (id: string) => {
    const p = await api.project(id);
    restore(JSON.stringify(p.state));
    setProjectId(p.id);
    setProjectName(p.name);
    notify(`Projet « ${p.name} » ouvert`);
  };
  const newProject = () => {
    if (clips.length && !confirm("Vider la timeline pour un nouveau montage ?")) return;
    setClips([]); setCues([]); setTexts([]); setStyle(DEFAULT_STYLE); setMusicSel(""); setName(""); setProjectId(null); setProjectName("Mon montage"); setCover({ on: false, atS: 1, title: "" });
    setSel(null); setHead(0);
  };

  // ---- Modèles -----------------------------------------------------------------
  const applyTemplate = (t: Template) => {
    setStyle({ ...DEFAULT_STYLE, ...t.style });
    setTransition(t.transition);
    setFade(t.fadeS);
    setTexts(t.texts(Math.max(3, total)).map((x) => ({ ...x, id: uid() })));
    if (t.effects?.length) setClips((cs) => cs.map((c) => ({ ...c, effects: [...new Set([...c.effects, ...t.effects!])] })));
    if (typeof t.musicVolume === "number") setMusicOpts((m) => ({ ...m, volume: t.musicVolume! }));
    setTool("subs");
    notify(`Modèle « ${t.label} » appliqué`);
  };

  // ---- Silences, recadrage, tempo, traduction ------------------------------------
  const cutSilences = async () => {
    if (!selected) return;
    setSilBusy(true);
    try {
      const r = await api.silences(selected.source, selected.inS, selected.outS);
      if (r.segments.length <= 1) return notify("Pas de silence net dans ce clip");
      const parts: TClip[] = r.segments.map((sg) => ({ ...selected, uid: uid(), inS: sg.start, outS: sg.end }));
      setClips((cs) => {
        const i = cs.findIndex((c) => c.uid === selected.uid);
        return [...cs.slice(0, i), ...parts, ...cs.slice(i + 1)];
      });
      notify(`${r.segments.length} morceaux parlés gardés, silences retirés`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSilBusy(false);
    }
  };
  const snapToBeat = () => {
    const track = music.find((m) => m.file === musicSel);
    if (!track?.bpm) return notify("Choisis d'abord une musique dont le tempo est connu");
    const beat = 60 / track.bpm;
    let acc = 0;
    setClips((cs) =>
      cs.map((c) => {
        const len = clipLen(c);
        const target = Math.max(beat, Math.round(len / beat) * beat);
        acc += target;
        const outS = Math.min(c.durationS, c.inS + target * c.speed);
        return { ...c, outS };
      }),
    );
    notify(`Coupes calées sur ${track.bpm} bpm (un temps = ${beat.toFixed(2)} s)`);
  };
  const translateSubs = async (to: string) => {
    if (!cues.length) return notify("Pas de sous-titres à traduire");
    setTransBusy(true);
    try {
      const r = await api.translateCues(cues, to);
      setCues(r.cues);
      notify("Sous-titres traduits");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setTransBusy(false);
    }
  };

  const request = (): MontageRequest => ({
    name: name || undefined,
    clips: clips.map((c) => ({ source: c.source, inS: c.inS, outS: c.outS, mute: c.mute, volume: c.volume, speed: c.speed, effects: c.effects, smartCrop: c.smartCrop })),
    width: out.w,
    height: out.h,
    fit,
    music: musicSel ? { file: musicSel, ...musicOpts } : null,
    fadeS: fade,
    transition: transition.type === "none" ? null : transition,
    subtitles: cues.length ? { cues, style } : null,
    texts,
    cover: cover.on ? { atS: cover.atS, title: cover.title } : null,
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

  // Aperçu en direct des effets du clip courant (approximation CSS de ce que fera l'export).
  const live = (() => {
    const loc = locate(head);
    const c = loc ? clips[loc.index] : null;
    if (!c) return { filter: "", transform: "", opacity: 1, vignette: false, letterbox: false, pixelate: false };
    const span = Math.max(0.05, c.outS - c.inS);
    const p = Math.max(0, Math.min(1, (loc!.local - c.inS) / span));
    const local = loc!.local - c.inS;
    const remaining = c.outS - loc!.local;
    const f: string[] = [];
    let transform = "";
    let opacity = 1;
    for (const e of c.effects) {
      if (e === "bw") f.push("grayscale(1)");
      if (e === "sepia") f.push("sepia(1)");
      if (e === "vintage") f.push("sepia(.45) contrast(1.1) saturate(.85) brightness(.95)");
      if (e === "cinematic") f.push("contrast(1.12) saturate(1.05) hue-rotate(-6deg)");
      if (e === "warm") f.push("sepia(.25) saturate(1.2)");
      if (e === "cold") f.push("hue-rotate(18deg) saturate(.9)");
      if (e === "punch") f.push("contrast(1.18) saturate(1.25)");
      if (e === "contrast-hard") f.push("contrast(1.4) brightness(.97) saturate(.9)");
      if (e === "invert") f.push("invert(1)");
      if (e === "blur") f.push("blur(5px)");
      if (e === "glow") f.push("brightness(1.12) contrast(1.05) saturate(1.1)");
      if (e === "dream") f.push("saturate(1.15) brightness(1.08) blur(0.6px)");
      if (e === "sharpen") f.push("contrast(1.06)");
      if (e === "mirror") transform += " scaleX(-1)";
      if (e === "zoom-in") transform += ` scale(${(1 + 0.25 * p).toFixed(3)})`;
      if (e === "zoom-out") transform += ` scale(${(1.25 - 0.25 * p).toFixed(3)})`;
      if (e === "shake") transform += ` translate(${(Math.sin(head * 37) * 1.2).toFixed(2)}%, ${(Math.cos(head * 29) * 1.2).toFixed(2)}%) scale(1.06)`;
      if (e === "fade-in" && local < 0.35) opacity = Math.min(opacity, local / 0.35);
      if (e === "fade-out" && remaining < 0.35) opacity = Math.min(opacity, Math.max(0, remaining / 0.35));
    }
    const flash = c.effects.includes("flash") && local < 0.25 ? 1 - local / 0.25 : 0;
    return { filter: f.join(" "), transform: transform.trim(), opacity, flash, vignette: c.effects.includes("vignette"), letterbox: c.effects.includes("letterbox"), pixelate: c.effects.includes("pixelate") };
  })();

  type LibItem = { id: string; name: string; durationS: number | null; cover: string | null; url: string; views?: number; postedAt?: number | null };
  const lib: LibItem[] = !sources
    ? []
    : libTab === "videos"
      ? sources.videos
          .filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()))
          .filter((v) => !libFollowed || v.followed)
          .filter((v) => !libFav || v.favorite)
          .sort((a, b) =>
            libSort === "views" ? b.views - a.views : libSort === "duration" ? (b.durationS ?? 0) - (a.durationS ?? 0) : libSort === "name" ? a.handle.localeCompare(b.handle) : (b.postedAt ?? 0) - (a.postedAt ?? 0),
          )
      : libTab === "captures"
        ? sources.captures.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).map((c) => ({ ...c, cover: null }))
        : libTab === "renders"
          ? sources.renders.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())).map((r) => ({ ...r, durationS: null, cover: null }))
          : [];
  const removeFromLib = async (src: ClipSource, label: string) => {
    if (!confirm(`Supprimer « ${label} » de Niche ?`)) return;
    try {
      if (src.kind === "video") await api.deleteVideo(Number(src.id));
      else if (src.kind === "capture") await api.deleteCapture(src.id);
      else await api.deleteJob(Number(src.id));
      await loadSources();
      notify("Supprimé");
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const toolBtn = (k: typeof tool, label: string) => (
    <button key={k} onClick={() => setTool(k)} className={`rounded-lg px-3 py-1.5 text-xs ${tool === k ? "bg-zinc-100 text-black" : "border border-zinc-700 hover:bg-zinc-800"}`}>
      {label}
    </button>
  );

  return (
    <div className="my-4 grid gap-4 xl:grid-cols-[300px_1fr]">
      {publish ? <PublishPanel source={publish.source} title={publish.title} onClose={() => setPublish(null)} notify={notify} /> : null}
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
            <div className="flex flex-wrap items-center gap-1">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer" className={inputCls + " min-w-24 flex-1"} />
              {libTab === "videos" ? (
                <select value={libSort} onChange={(e) => setLibSort(e.target.value as typeof libSort)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs" title="Trier">
                  <option value="recent">Récentes</option>
                  <option value="views">Plus vues</option>
                  <option value="duration">Plus longues</option>
                  <option value="name">Par compte</option>
                </select>
              ) : null}
              <button onClick={() => setLibBig(!libBig)} className={`rounded-lg border px-2 py-2 text-xs ${libBig ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`} title="Grandes vignettes">🔍</button>
            </div>
            {libTab === "videos" ? (
              <div className="flex gap-2 text-xs text-zinc-400">
                <label className="flex items-center gap-1"><input type="checkbox" checked={libFollowed} onChange={(e) => setLibFollowed(e.target.checked)} className="accent-green-500" /> Comptes suivis</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={libFav} onChange={(e) => setLibFav(e.target.checked)} className="accent-green-500" /> ⭐ Favoris</label>
                <span className="ml-auto">{lib.length}</span>
              </div>
            ) : null}
            <label className="block cursor-pointer rounded-lg border border-dashed border-zinc-700 p-2 text-center text-xs text-zinc-400 hover:bg-zinc-800">
              {uploading ? "Import en cours…" : "+ Importer une vidéo (PC ou téléphone)"}
              <input type="file" accept="video/*" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} />
            </label>
            <ul className={`scrollbar-thin max-h-[60vh] overflow-y-auto text-sm ${libBig ? "grid grid-cols-2 gap-2" : "space-y-1"}`}>
              {lib.map((s) => {
                const src: ClipSource = { kind: libTab === "videos" ? "video" : libTab === "captures" ? "capture" : "render", id: s.id };
                const thumb = s.cover ?? (src.kind !== "video" ? api.thumbsUrl(src) : null);
                return (
                  <li
                    key={s.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/niche-clip", JSON.stringify({ src, name: s.name, url: s.url, durationS: s.durationS }))}
                    onDoubleClick={() => add(src, s.name, s.url, s.durationS)}
                    className={`cursor-grab rounded-lg border border-zinc-800 p-1.5 hover:border-zinc-600 ${libBig ? "" : "flex items-center gap-2"}`}
                    title="Double-clic ou glisser vers la timeline"
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className={libBig ? "mb-1 h-40 w-full rounded object-cover" : "h-16 w-11 rounded object-cover"} loading="lazy" />
                    ) : (
                      <span className={`grid place-items-center rounded bg-zinc-800 text-xs ${libBig ? "mb-1 h-40 w-full" : "h-16 w-11"}`}>🎞</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate" title={s.name}>{s.name}</div>
                      <div className="text-xs text-zinc-500">
                        {s.durationS ? fmtDuration(s.durationS) : ""}
                        {typeof s.views === "number" && s.views > 0 ? ` · ${fmtNum(s.views)} vues` : ""}
                      </div>
                      <div className="mt-1 flex gap-1">
                        <button onClick={() => add(src, s.name, s.url, s.durationS)} className="rounded-lg bg-green-500 px-2 py-0.5 text-xs font-semibold text-black hover:bg-green-400">+ Ajouter</button>
                        <button onClick={() => removeFromLib(src, s.name)} className="rounded-lg border border-red-900 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950" title="Supprimer de Niche">🗑</button>
                      </div>
                    </div>
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
        <div className={`grid gap-3 ${bigPreview ? "" : "lg:grid-cols-[auto_1fr]"}`}>
          <div className="relative mx-auto max-w-full rounded-xl border border-zinc-800 bg-black" style={{ height: bigPreview ? "78vh" : 420, maxHeight: bigPreview ? "78vh" : "60vh", aspectRatio: `${out.w} / ${out.h}` }} onDoubleClick={() => setBigPreview(!bigPreview)} title="Double-clic : agrandir ou réduire">
            <video
              ref={videoRef}
              playsInline
              className="h-full w-full rounded-xl"
              style={{ objectFit: fit, filter: live.filter || undefined, transform: live.transform || undefined, opacity: live.opacity, imageRendering: live.pixelate ? "pixelated" : undefined }}
            />
            {live.vignette ? <div className="pointer-events-none absolute inset-0 rounded-xl" style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.75) 100%)" }} /> : null}
            {live.letterbox ? (
              <>
                <div className="pointer-events-none absolute left-0 top-0 h-[10%] w-full bg-black" />
                <div className="pointer-events-none absolute bottom-0 left-0 h-[10%] w-full bg-black" />
              </>
            ) : null}
            {live.flash ? <div className="pointer-events-none absolute inset-0 rounded-xl bg-white" style={{ opacity: live.flash }} /> : null}
            <audio ref={musicRef} src={musicSel ? music.find((m) => m.file === musicSel)?.url : undefined} loop />
            {activeCue ? (
              <div
                className="pointer-events-none absolute left-2 right-2 flex flex-wrap justify-center gap-x-1 text-center font-bold uppercase leading-tight"
                style={{
                  fontFamily: `"${style.font}", Anton, Impact, sans-serif`,
                  fontSize: style.size * previewScale * (out.h / 1920) * (1920 / out.h),
                  bottom: style.y === undefined && style.position === "bottom" ? 420 * previewScale : undefined,
                  top: style.y !== undefined ? `${style.y * 100}%` : style.position === "top" ? 260 * previewScale : style.position === "center" ? "45%" : undefined,
                  transform: style.y !== undefined ? "translateY(-50%)" : undefined,
                  textShadow: "0 0 6px #000, 0 2px 0 #000",
                  background: style.box ? "rgba(0,0,0,0.5)" : undefined,
                }}
              >
                {(activeCue.words.length ? activeCue.words : activeCue.text.split(/\s+/).map((t) => ({ text: t, start: activeCue.start, end: activeCue.end }))).map((w, i) => (
                  (() => {
                    const active = style.mode === "karaoke" && head >= w.start && head <= w.end + 0.05;
                    const box = active && style.animation === "box";
                    return (
                      <span
                        key={i}
                        style={{
                          color: box ? "#101010" : active ? style.highlight : style.color,
                          background: box ? style.highlight : undefined,
                          borderRadius: box ? 6 : undefined,
                          padding: box ? "0 4px" : undefined,
                          display: "inline-block",
                          transform: active && (style.animation === "pop" || style.animation === "bounce") ? "scale(1.18)" : undefined,
                          transition: "transform 80ms",
                        }}
                      >
                        {style.uppercase ? w.text.toUpperCase() : w.text}
                      </span>
                    );
                  })()
                ))}
                {style.emojis ? <span>{activeCue.text.match(/(argent|amour|rire|feu|peur|choc|police|maman|papa|chat|chien|secret|regarde)/i) ? "✨" : ""}</span> : null}
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
            <div className="flex flex-wrap items-center gap-1">
              <select onChange={(e) => { const t = TEMPLATES.find((x) => x.key === e.target.value); if (t) applyTemplate(t); e.target.value = ""; }} defaultValue="" className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs" title="Modèle de montage">
                <option value="">🧩 Modèle…</option>
                {TEMPLATES.map((t) => <option key={t.key} value={t.key} title={t.desc}>{t.label}</option>)}
              </select>
              <button onClick={undo} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800" title="Annuler (Ctrl+Z)">↶</button>
              <button onClick={redo} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800" title="Rétablir (Ctrl+Y)">↷</button>
              <select onChange={(e) => { if (e.target.value === "__new") newProject(); else if (e.target.value) openProject(e.target.value); e.target.value = ""; }} defaultValue="" className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs" title="Projets">
                <option value="">📁 {projectId ? projectName : "Projets…"}</option>
                <option value="__new">Nouveau montage</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={saveAsProject} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800" title="Enregistrer comme projet">💾</button>
              <span className="mx-1 h-5 w-px bg-zinc-700" />
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
                      <button onClick={cutSilences} disabled={silBusy} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">{silBusy ? "Analyse…" : "✂️ Couper les silences"}</button>
                      <button onClick={() => update(selected.uid, { smartCrop: !selected.smartCrop })} className={`rounded-lg border px-2 py-1 text-xs ${selected.smartCrop ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`} title="Recadrage vertical centré sur les personnes détectées (à l'export)">🙂 Recadrer sur les personnes</button>
                      <button onClick={() => move(-1)} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">◀ Avant</button>
                      <button onClick={() => move(1)} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Après ▶</button>
                      <button onClick={duplicate} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Dupliquer</button>
                      <button onClick={remove} className="rounded-lg border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950">Supprimer</button>
                    </div>
                    <div className="space-y-2">
                      {EFFECT_GROUPS.map((g) => (
                        <div key={g.title}>
                          <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{g.title} (visibles à l'export)</div>
                          <div className="flex flex-wrap gap-1">
                            {g.items.map((e) => (
                              <button key={e.key} onClick={() => toggleEffect(e.key)} className={`rounded-lg border px-2 py-1 text-xs ${selected.effects.includes(e.key) ? "border-green-500 bg-green-500/10 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>
                                {e.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
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
                      {music.map((m) => <option key={m.file} value={m.file}>{m.name}{m.durationS ? ` (${fmtDuration(m.durationS)}` : ""}{m.bpm ? `, ${m.bpm} bpm)` : m.durationS ? ")" : ""}</option>)}
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
                      <button onClick={snapToBeat} className="col-span-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800">🥁 Caler les coupes sur le rythme ({music.find((m) => m.file === musicSel)?.bpm ?? "?"} bpm)</button>
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
                    {cues.length ? (
                      <select onChange={(e) => { if (e.target.value) translateSubs(e.target.value); e.target.value = ""; }} defaultValue="" disabled={transBusy} className={inputCls + " max-w-44"}>
                        <option value="">{transBusy ? "Traduction…" : "🌍 Traduire en…"}</option>
                        {[["en", "Anglais"], ["es", "Espagnol"], ["de", "Allemand"], ["it", "Italien"], ["pt", "Portugais"], ["fr", "Français"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    ) : null}
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
                    <Field label="Animation du mot">
                      <select value={style.animation} onChange={(e) => setStyle({ ...style, animation: e.target.value as SubtitleStyle["animation"] })} className={inputCls}>
                        <option value="pop">Grossit</option>
                        <option value="box">Surlignage coloré</option>
                        <option value="bounce">Rebond</option>
                        <option value="none">Couleur seule</option>
                      </select>
                    </Field>
                    <Field label="Police">
                      <select value={style.font} onChange={(e) => setStyle({ ...style, font: e.target.value })} className={inputCls}>
                        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </Field>
                    <Field label={`Hauteur ${style.y !== undefined ? Math.round(style.y * 100) + " %" : "auto"}`}>
                      <input type="range" min={0.1} max={0.95} step={0.01} value={style.y ?? (style.position === "top" ? 0.15 : style.position === "center" ? 0.5 : 0.78)} onChange={(e) => setStyle({ ...style, y: Number(e.target.value) })} className="w-full accent-green-500" />
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
                      <label className="flex items-center gap-2"><input type="checkbox" checked={style.emojis} onChange={(e) => setStyle({ ...style, emojis: e.target.checked })} className="accent-green-500" /> Emojis auto</label>
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
                    <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-4"><input type="checkbox" checked={cover.on} onChange={(e) => setCover({ ...cover, on: e.target.checked })} className="accent-green-500" /> Image de couverture (image à l'instant choisi + titre)</label>
                    {cover.on ? (
                      <>
                        <Field label="Instant (s)"><input type="number" step="0.5" min={0} value={cover.atS} onChange={(e) => setCover({ ...cover, atS: Number(e.target.value) })} className={inputCls} /></Field>
                        <button onClick={() => setCover({ ...cover, atS: Math.round(head * 10) / 10 })} className="mt-5 rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Prendre le curseur</button>
                        <div className="col-span-2"><Field label="Titre sur la couverture"><input value={cover.title} onChange={(e) => setCover({ ...cover, title: e.target.value })} className={inputCls} placeholder="Gros titre" /></Field></div>
                      </>
                    ) : null}
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
                            {e.coverUrl ? <img src={e.coverUrl} alt="" className="h-36 rounded" /> : null}
                            <div className="flex flex-col justify-end gap-1">
                              <button onClick={() => setPublish({ source: { kind: "montage", id: e.id }, title: e.name })} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-green-400">📣 Publier partout</button>
                              {e.coverUrl ? <a href={e.coverUrl} download className="rounded-lg border border-zinc-700 px-3 py-1.5 text-center text-xs hover:bg-zinc-800">Couverture</a> : null}
                              <a href={e.url} download className="rounded-lg border border-zinc-700 px-3 py-1.5 text-center text-xs hover:bg-zinc-800">Télécharger</a>
                            </div>
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
          <button onClick={() => setBigPreview(!bigPreview)} className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-800" title="Agrandir l'aperçu">{bigPreview ? "⤡ Réduire" : "⤢ Agrandir"}</button>
          <span className="font-mono text-xs text-zinc-400">{fmtS(head)} / {fmtS(total)}</span>
          <span className="mx-2 h-5 w-px bg-zinc-700" />
          <button onClick={splitAtHead} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">✂ Couper au curseur</button>
          <button onClick={setInHere} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">[ Début ici</button>
          <button onClick={setOutHere} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">Fin ici ]</button>
          <button onClick={() => goTo(head - 1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">-1 s</button>
          <button onClick={() => goTo(head - 0.1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">-0,1</button>
          <button onClick={() => goTo(head + 0.1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">+0,1</button>
          <button onClick={() => goTo(head + 1)} className="rounded-lg border border-zinc-700 px-2 py-1.5 hover:bg-zinc-800">+1 s</button>
          <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="checkbox" checked={showThumbs} onChange={(e) => setShowThumbs(e.target.checked)} className="accent-green-500" /> Miniatures et onde</label>
          <span className="ml-auto text-xs text-zinc-500">Glisse sur la barre, tire les bords d'un clip. Clavier : espace, ← →, S, I, O, Suppr, Ctrl+Z / Ctrl+Y.</span>
        </div>
        <div
          ref={trackRef}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("application/niche-clip")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData("application/niche-clip");
            if (!raw) return;
            e.preventDefault();
            const d = JSON.parse(raw) as { src: ClipSource; name: string; url: string; durationS: number | null };
            add(d.src, d.name, d.url, d.durationS);
          }}
          className="relative h-24 w-full cursor-col-resize select-none overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 touch-none"
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
          onPointerCancel={onTrackUp}
        >
          {!clips.length ? <div className="grid h-full place-items-center text-xs text-zinc-500">Glisse ici des vidéos du chutier (ou double-clic dessus, ou « + Ajouter »).</div> : null}
          <div className="flex h-14">
            {clips.map((c, i) => (
              <div
                key={c.uid}
                onPointerDown={() => {
                  setSel(c.uid);
                  setTool("clip");
                }}
                style={{ width: `${(clipLen(c) / Math.max(0.01, timelineLen)) * 100}%`, background: `hsl(${(i * 67) % 360} 45% ${sel === c.uid ? 38 : 24}%)` }}
                className={`relative h-full overflow-hidden border-r border-black/50 px-3 py-1 text-xs ${sel === c.uid ? "ring-2 ring-inset ring-green-400" : ""}`}
                title={`${c.name} : ${fmtS(c.inS)} à ${fmtS(c.outS)}`}
              >
                {showThumbs ? (
                  <div
                    className="pointer-events-none absolute inset-0 opacity-70"
                    style={{
                      backgroundImage: `url(${api.thumbsUrl(c.source)})`,
                      backgroundSize: `${(c.durationS / Math.max(0.1, c.outS - c.inS)) * 100}% 100%`,
                      backgroundPosition: `${(c.inS / Math.max(0.1, c.durationS - (c.outS - c.inS))) * 100}% 0`,
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                ) : null}
                {showThumbs && !c.mute ? (
                  <div
                    className="pointer-events-none absolute bottom-0 left-0 h-1/3 w-full opacity-80"
                    style={{
                      backgroundImage: `url(${api.waveUrl(c.source)})`,
                      backgroundSize: `${(c.durationS / Math.max(0.1, c.outS - c.inS)) * 100}% 100%`,
                      backgroundPosition: `${(c.inS / Math.max(0.1, c.durationS - (c.outS - c.inS))) * 100}% 0`,
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                ) : null}
                <div className="relative truncate font-medium drop-shadow">{c.name}</div>
                <div className="relative truncate text-[10px] opacity-90 drop-shadow">{fmtS(c.inS)} → {fmtS(c.outS)} {c.speed !== 1 ? `· x${c.speed}` : ""} {c.mute ? "· 🔇" : ""} {c.effects.length ? `· ${c.effects.length} effet(s)` : ""}</div>
                <div onPointerDown={(e) => startTrim(e, c, "in")} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/20 hover:bg-green-400/70" title="Tirer pour couper le début" />
                <div onPointerDown={(e) => startTrim(e, c, "out")} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/20 hover:bg-green-400/70" title="Tirer pour couper la fin" />
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
