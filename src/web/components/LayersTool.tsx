import React, { useEffect, useRef, useState } from "react";
import { api, type ClipSource, type Overlay, type Sticker } from "../api";
import { Field, inputCls } from "./Modal";

const uid = () => Math.random().toString(36).slice(2, 10);

/** Calques : stickers, logos, images et vidéos incrustées (PiP) posés sur le montage. */
export const LayersTool: React.FC<{
  overlays: Overlay[];
  setOverlays: (f: (o: Overlay[]) => Overlay[]) => void;
  head: number;
  total: number;
  videoSources: { label: string; source: ClipSource; durationS: number | null }[];
  notify: (m: string) => void;
}> = ({ overlays, setOverlays, head, total, videoSources, notify }) => {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api.stickers().then(setStickers).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await api.uploadSticker(f, f.name);
      notify(`${files.length} image(s) ajoutée(s).`);
      load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const addImage = (s: Sticker) =>
    setOverlays((o) => [...o, { id: uid(), kind: "image", file: s.file, x: 0.6, y: 0.08, w: 0.3, start: Math.round(head * 10) / 10, end: Math.min(total || 5, Math.round(head * 10) / 10 + 4), opacity: 1 }]);
  const addVideo = (v: { label: string; source: ClipSource; durationS: number | null }) =>
    setOverlays((o) => [...o, { id: uid(), kind: "video", source: v.source, x: 0.55, y: 0.05, w: 0.4, start: Math.round(head * 10) / 10, end: Math.min(total || 5, Math.round(head * 10) / 10 + Math.min(v.durationS ?? 5, 8)), opacity: 1, mute: true, shape: "rounded" }]);
  const update = (id: string, patch: Partial<Overlay>) => setOverlays((o) => o.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setOverlays((o) => o.filter((x) => x.id !== id));
  const removeSticker = async (s: Sticker) => {
    if (!confirm(`Supprimer l'image ${s.file} de la bibliothèque ?`)) return;
    await api.deleteSticker(s.file);
    load();
  };

  const POS: [string, number, number][] = [
    ["Haut gauche", 0.04, 0.04],
    ["Haut droite", 0.66, 0.04],
    ["Centre", 0.35, 0.4],
    ["Bas gauche", 0.04, 0.78],
    ["Bas droite", 0.66, 0.78],
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-800 p-2">
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="font-medium">Images et stickers</span>
          <span className="text-zinc-500">PNG transparent, logo, meme, GIF animé</span>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(e) => upload(e.target.files)} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="ml-auto rounded-lg bg-green-500 px-2 py-1 text-xs font-semibold text-black hover:bg-green-400 disabled:opacity-50">{busy ? "Envoi…" : "+ Importer"}</button>
        </div>
        {stickers.length ? (
          <div className="flex flex-wrap gap-1">
            {stickers.map((s) => (
              <div key={s.file} className="group relative">
                <button onClick={() => addImage(s)} title={`Poser ${s.file} au curseur`} className="h-14 w-14 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800/60 hover:border-green-500">
                  <img src={s.url} alt="" className="h-full w-full object-contain" />
                </button>
                <button onClick={() => removeSticker(s)} className="absolute -right-1 -top-1 hidden h-5 w-5 rounded-full bg-red-600 text-[10px] text-white group-hover:block" title="Supprimer de la bibliothèque">✕</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Aucune image pour l'instant. Importe un logo, un sticker PNG ou un GIF, puis clique dessus pour le poser sur la vidéo.</p>
        )}
      </div>
      <div className="rounded-lg border border-zinc-800 p-2">
        <div className="mb-1 text-xs font-medium">Vidéo incrustée (image dans l'image)</div>
        <div className="flex gap-1">
          <select id="pip-src" className={inputCls + " flex-1"} defaultValue="">
            <option value="">Choisir une vidéo du chutier…</option>
            {videoSources.map((v) => (
              <option key={`${v.source.kind}:${v.source.id}`} value={`${v.source.kind}:${v.source.id}`}>{v.label}</option>
            ))}
          </select>
          <button
            onClick={() => {
              const el = document.getElementById("pip-src") as HTMLSelectElement | null;
              const v = videoSources.find((x) => `${x.source.kind}:${x.source.id}` === el?.value);
              if (v) addVideo(v);
              else notify("Choisis une vidéo d'abord.");
            }}
            className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
          >
            + Poser au curseur
          </button>
        </div>
      </div>
      {overlays.map((o, i) => (
        <div key={o.id} className="space-y-1 rounded-lg border border-zinc-700 p-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">Calque {i + 1} · {o.kind === "image" ? o.file : "vidéo incrustée"}</span>
            <select value="" onChange={(e) => { const p = POS.find((x) => x[0] === e.target.value); if (p) update(o.id, { x: p[1], y: p[2] }); }} className="rounded-lg border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs">
              <option value="">Position…</option>
              {POS.map((p) => (
                <option key={p[0]} value={p[0]}>{p[0]}</option>
              ))}
            </select>
            <button onClick={() => update(o.id, { start: Math.round(head * 10) / 10 })} className="rounded-lg border border-zinc-700 px-1.5 py-0.5 hover:bg-zinc-800" title="Début au curseur">⇤ début</button>
            <button onClick={() => update(o.id, { end: Math.round(head * 10) / 10 })} className="rounded-lg border border-zinc-700 px-1.5 py-0.5 hover:bg-zinc-800" title="Fin au curseur">fin ⇥</button>
            <button onClick={() => remove(o.id)} className="ml-auto text-red-300">✕</button>
          </div>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
            <Field label="Début (s)"><input type="number" step="0.1" min={0} value={o.start} onChange={(e) => update(o.id, { start: Number(e.target.value) })} className={inputCls} /></Field>
            <Field label="Fin (s)"><input type="number" step="0.1" min={0} value={o.end} onChange={(e) => update(o.id, { end: Number(e.target.value) })} className={inputCls} /></Field>
            <Field label={`Largeur ${Math.round(o.w * 100)} %`}><input type="range" min={0.05} max={1} step={0.01} value={o.w} onChange={(e) => update(o.id, { w: Number(e.target.value) })} className="w-full accent-green-500" /></Field>
            <Field label={`Gauche ${Math.round(o.x * 100)} %`}><input type="range" min={0} max={1} step={0.01} value={o.x} onChange={(e) => update(o.id, { x: Number(e.target.value) })} className="w-full accent-green-500" /></Field>
            <Field label={`Haut ${Math.round(o.y * 100)} %`}><input type="range" min={0} max={1} step={0.01} value={o.y} onChange={(e) => update(o.id, { y: Number(e.target.value) })} className="w-full accent-green-500" /></Field>
            <Field label={`Opacité ${Math.round((o.opacity ?? 1) * 100)} %`}><input type="range" min={0} max={1} step={0.01} value={o.opacity ?? 1} onChange={(e) => update(o.id, { opacity: Number(e.target.value) })} className="w-full accent-green-500" /></Field>
            <Field label="Rotation (°)"><input type="number" step="5" min={-360} max={360} value={o.rotate ?? 0} onChange={(e) => update(o.id, { rotate: Number(e.target.value) })} className={inputCls} /></Field>
            <Field label="Forme">
              <select value={o.shape ?? "rect"} onChange={(e) => update(o.id, { shape: e.target.value as Overlay["shape"] })} className={inputCls}>
                <option value="rect">Rectangle</option>
                <option value="rounded">Coins arrondis</option>
                <option value="circle">Cercle</option>
              </select>
            </Field>
            {o.kind === "video" ? (
              <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={!o.mute} onChange={(e) => update(o.id, { mute: !e.target.checked })} className="accent-green-500" /> Garder le son de la vidéo incrustée</label>
            ) : null}
          </div>
        </div>
      ))}
      {!overlays.length ? <p className="text-xs text-zinc-500">Les calques se posent par-dessus tout le montage, avec un début et une fin. L'aperçu montre les images ; les vidéos incrustées apparaissent à l'export.</p> : null}
    </div>
  );
};
