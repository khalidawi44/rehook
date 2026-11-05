import React, { useEffect, useState } from "react";
import { api, type Settings, type Stats } from "../api";
import { Field, Modal, inputCls } from "./Modal";

export const SettingsModal: React.FC<{ stats: Stats | null; onClose: () => void; notify: (m: string) => void }> = ({ stats, onClose, notify }) => {
  const [s, setS] = useState<Settings | null>(null);
  const [hashtags, setHashtags] = useState("");
  const [keywords, setKeywords] = useState("");
  useEffect(() => {
    api.settings().then((x) => {
      setS(x);
      setHashtags(x.hashtags.join(", "));
      setKeywords(x.keywords.join(", "));
    });
  }, []);
  if (!s) return null;
  const save = async () => {
    try {
      await api.saveSettings({
        ...s,
        hashtags: hashtags.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
        keywords: keywords.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
      });
      notify("Réglages enregistrés");
      onClose();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  return (
    <Modal title="Réglages" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Hashtags surveillés" hint="Séparés par des virgules, sans le #. Chaque relevé lit les vidéos récentes de ces hashtags.">
          <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Mots-clés de recherche" hint="Séparés par des virgules. Recherche TikTok à chaque relevé.">
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Viral : vues minimum">
            <input type="number" value={s.viralMinViews} onChange={num("viralMinViews")} className={inputCls} />
          </Field>
          <Field label="Viral : vues/h minimum">
            <input type="number" value={s.viralMinViewsPerHour} onChange={num("viralMinViewsPerHour")} className={inputCls} />
          </Field>
          <Field label="Viral : x médiane du compte">
            <input type="number" step="0.5" value={s.viralOutlierFactor} onChange={num("viralOutlierFactor")} className={inputCls} />
          </Field>
          <Field label="Relevé auto (minutes)" hint="0 = jamais">
            <input type="number" value={s.refreshMinutes} onChange={num("refreshMinutes")} className={inputCls} />
          </Field>
          <Field label="Vidéos par source">
            <input type="number" value={s.videosPerSource} onChange={num("videosPerSource")} className={inputCls} />
          </Field>
        </div>
        <div className="rounded-xl border border-zinc-800 p-3 text-xs text-zinc-400">
          <div className="mb-1 font-medium text-zinc-300">Fournisseurs (fichier .env)</div>
          <div>Découverte : {stats?.providers.discovery} · Images : {stats?.providers.images} · Voix : {stats?.providers.voice} · Script : {stats?.providers.anthropic ? "clé Anthropic présente" : "clé Anthropic absente"}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button onClick={() => api.demo(true).then((r) => notify(`${r.removed} vidéo(s) de démo retirée(s)`))} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">
            Retirer les données de démo
          </button>
          <button onClick={() => api.demo(false).then((r) => notify(`${r.added} vidéo(s) de démo ajoutée(s)`))} className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800">
            Remettre les données de démo
          </button>
        </div>
        {stats?.run.log.length ? (
          <details className="rounded-xl border border-zinc-800 p-3">
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">Journal du dernier relevé</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">{stats.run.log.join("\n")}</pre>
          </details>
        ) : null}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
            Fermer
          </button>
          <button onClick={save} className="rounded-xl bg-green-500 px-5 py-2 text-sm font-semibold text-black hover:bg-green-400">
            Enregistrer
          </button>
        </div>
      </div>
    </Modal>
  );
};
