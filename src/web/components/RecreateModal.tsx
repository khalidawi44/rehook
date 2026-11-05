import React, { useEffect, useState } from "react";
import { api, type JobOptions, type VideoCard } from "../api";
import { Field, Modal, inputCls } from "./Modal";

const LANGS = [
  ["auto", "Comme la vidéo source"],
  ["fr", "Français"],
  ["en", "Anglais"],
  ["es", "Espagnol"],
  ["de", "Allemand"],
  ["it", "Italien"],
  ["pt", "Portugais"],
];

export const RecreateModal: React.FC<{ card: VideoCard; onClose: () => void; onQueued: () => void }> = ({ card, onClose, onQueued }) => {
  const [opts, setOpts] = useState<JobOptions>({
    language: "auto",
    targetSeconds: Math.min(90, Math.max(20, card.durationS ?? 45)),
    captionStyle: "karaoke",
    handle: localStorage.getItem("niche.handle") ?? "",
    twist: "",
    images: "",
    voice: "",
    music: null,
  });
  const [music, setMusic] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.music().then(setMusic).catch(() => {});
  }, []);
  const set = <K extends keyof JobOptions>(k: K, v: JobOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem("niche.handle", opts.handle ?? "");
      const clean: JobOptions = { ...opts };
      if (!clean.twist) delete clean.twist;
      if (!clean.images) delete clean.images;
      if (!clean.voice) delete clean.voice;
      if (!clean.handle) delete clean.handle;
      await api.recreate(card.id, clean);
      onQueued();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Recréer cette vidéo" onClose={onClose}>
      <div className="mb-4 flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm">
        {card.cover ? <img src={card.cover} alt="" className="h-20 w-14 rounded-lg object-cover" /> : null}
        <div>
          <div className="font-medium">@{card.account.handle}</div>
          <p className="line-clamp-2 text-zinc-400">{card.caption}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Même format, même niche, même rythme : l'histoire et les visuels changent pour que la vidéo soit originale.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Langue">
          <select value={opts.language} onChange={(e) => set("language", e.target.value)} className={inputCls}>
            {LANGS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Durée visée (secondes)">
          <input type="number" min={10} max={180} value={opts.targetSeconds} onChange={(e) => set("targetSeconds", Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Images des scènes" hint="Vide = réglage du .env (NICHE_IMAGES)">
          <select value={opts.images} onChange={(e) => set("images", e.target.value)} className={inputCls}>
            <option value="">Par défaut</option>
            <option value="pexels-video">Clips vidéo libres Pexels (recommandé)</option>
            <option value="pexels">Photos libres Pexels</option>
            <option value="none">Fonds typographiques (sans image)</option>
            <option value="openai">Images générées (OpenAI)</option>
          </select>
        </Field>
        <Field label="Voix off" hint="Vide = réglage du .env (NICHE_VOICE)">
          <select value={opts.voice} onChange={(e) => set("voice", e.target.value)} className={inputCls}>
            <option value="">Par défaut</option>
            <option value="edge">Edge (gratuit)</option>
            <option value="openai">OpenAI</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="piper">Piper (local)</option>
            <option value="none">Sans voix</option>
          </select>
        </Field>
        <Field label="Sous-titres">
          <select value={opts.captionStyle} onChange={(e) => set("captionStyle", e.target.value as "karaoke" | "block")} className={inputCls}>
            <option value="karaoke">Mot par mot (karaoké)</option>
            <option value="block">Par groupe de mots</option>
          </select>
        </Field>
        <Field label="Musique" hint="Fichiers déposés dans data/public/music/">
          <select value={opts.music ?? ""} onChange={(e) => set("music", e.target.value || null)} className={inputCls}>
            <option value="">Aucune</option>
            {music.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Votre pseudo (fin de vidéo)">
          <input value={opts.handle} onChange={(e) => set("handle", e.target.value)} placeholder="@moncompte" className={inputCls} />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Consigne libre (facultatif)" hint="Ex. : même histoire mais avec un chat, ton plus drôle, finir sur une question…">
          <textarea value={opts.twist} onChange={(e) => set("twist", e.target.value)} rows={3} className={inputCls} />
        </Field>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
          Annuler
        </button>
        <button onClick={go} disabled={busy} className="rounded-xl bg-green-500 px-5 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50">
          {busy ? "Lancement…" : "Lancer la recréation"}
        </button>
      </div>
    </Modal>
  );
};
