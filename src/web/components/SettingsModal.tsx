import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, type Pack, type Settings, type Stats } from "../api";
import { Field, Modal, inputCls } from "./Modal";

export const SettingsModal: React.FC<{ stats: Stats | null; onClose: () => void; notify: (m: string) => void }> = ({ stats, onClose, notify }) => {
  const [s, setS] = useState<Settings | null>(null);
  const [hashtags, setHashtags] = useState("");
  const [keywords, setKeywords] = useState("");
  const [packs, setPacks] = useState<Pack[]>([]);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<Record<string, string>>({});
  const phoneUrls = (stats?.lanUrls ?? []).map((u) => (stats?.devPort ? u.replace(/:\d+$/, ":" + stats.devPort) : u));
  useEffect(() => {
    phoneUrls.forEach((u) => QRCode.toDataURL(u, { margin: 1, width: 160, color: { dark: "#ffffff", light: "#00000000" } }).then((d) => setQr((q) => ({ ...q, [u]: d }))).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneUrls.join("|")]);
  useEffect(() => {
    api.settings().then((x) => {
      setS(x);
      setHashtags(x.hashtags.join(", "));
      setKeywords(x.keywords.join(", "));
    });
    api.packs().then(setPacks).catch(() => {});
  }, []);
  const loadPack = async (name: string) => {
    setBusy(true);
    try {
      const r = await api.loadPack(name);
      notify(`Pack chargé : ${r.accounts} compte(s) suivi(s), ${r.videos} vidéo(s) importée(s). Découverte lancée.`);
      onClose();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
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
          <Field label="Vidéos par source">
            <input type="number" value={s.videosPerSource} onChange={num("videosPerSource")} className={inputCls} />
          </Field>
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-zinc-800 p-3 text-sm">
          <input type="checkbox" checked={s.feedEnabled} onChange={(e) => setS({ ...s, feedEnabled: e.target.checked })} className="mt-1 accent-green-500" />
          <span>
            <span className="font-medium text-zinc-200">Fil varié (onglet 📺 Fil)</span>
            <span className="block text-xs text-zinc-500">À chaque découverte, lit la page Explorer de TikTok et ses catégories (danse, comédie, beauté, sport, animaux…) pour avoir de tout, comme sur TikTok. Depuis le fil, un clic pour suivre un compte ou enregistrer une vidéo pour plus tard.</span>
          </span>
        </label>
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="mb-2 text-sm font-medium text-zinc-200">Veille en continu</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Découverte (minutes)" hint="Nouvelles vidéos des comptes suivis et hashtags. 0 = jamais">
              <input type="number" value={s.discoveryMinutes} onChange={num("discoveryMinutes")} className={inputCls} />
            </Field>
            <Field label="Relevé des compteurs (minutes)" hint="Vues relues toutes les N minutes. 0 = jamais">
              <input type="number" value={s.watchMinutes} onChange={num("watchMinutes")} className={inputCls} />
            </Field>
            <Field label="Fenêtre (heures)" hint="Vidéos publiées depuis moins de N heures">
              <input type="number" value={s.watchHours} onChange={num("watchHours")} className={inputCls} />
            </Field>
            <Field label="Alerte : vues minimum">
              <input type="number" value={s.alertMinViews} onChange={num("alertMinViews")} className={inputCls} />
            </Field>
            <Field label="Alerte : vues/h minimum" hint="Sur le dernier intervalle">
              <input type="number" value={s.alertMinViewsPerHour} onChange={num("alertMinViewsPerHour")} className={inputCls} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Alertes dans l'onglet 🚨 Alertes et en notification du navigateur{stats?.providers.telegram ? ", et sur Telegram" : " (Telegram : NICHE_TELEGRAM_BOT_TOKEN et NICHE_TELEGRAM_CHAT_ID dans .env)"}.
          </p>
        </div>
        {packs.length ? (
          <div className="rounded-xl border border-zinc-800 p-3">
            <div className="mb-2 text-sm font-medium text-zinc-200">Packs de niche</div>
            <p className="mb-2 text-xs text-zinc-500">Charger un pack ajoute ses comptes, hashtags et recherches à ceux déjà en place (rien n'est retiré).</p>
            {packs.map((p) => (
              <div key={p.name} className="flex flex-wrap items-center gap-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{p.title}{s.packLoaded.split(",").includes(p.name) ? <span className="ml-2 text-xs text-green-400">chargé</span> : null}</div>
                  <div className="text-xs text-zinc-500">{p.description} {p.accounts} comptes, {p.videos} vidéos, hashtags {p.hashtags.map((h) => "#" + h).join(" ")}.</div>
                </div>
                <button onClick={() => loadPack(p.name)} disabled={busy} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-green-400 disabled:opacity-50">
                  {busy ? "Chargement…" : s.packLoaded.split(",").includes(p.name) ? "Recharger" : "Charger"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="mb-1 text-sm font-medium text-zinc-200">📱 Sur le téléphone (même Wi-Fi)</div>
          {phoneUrls.length ? (
            <div className="flex flex-wrap gap-4">
              {phoneUrls.map((u) => (
                <div key={u} className="text-center text-xs">
                  {qr[u] ? <img src={qr[u]} alt="" className="mx-auto h-40 w-40" /> : null}
                  <a href={u} className="text-green-400 hover:underline">{u}</a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Aucune adresse réseau trouvée.</p>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            Scanne le code avec l'appareil photo du téléphone, puis « Ajouter à l'écran d'accueil » (bouton Partager sur iPhone, menu ⋮ sur Android) : Niche s'ouvre en plein écran avec son icône. Le PC doit rester allumé avec Niche lancé. Si rien ne s'affiche, autorise Node.js dans le pare-feu Windows (réseau privé).
          </p>
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
