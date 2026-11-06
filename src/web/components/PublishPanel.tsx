import React, { useEffect, useState } from "react";
import { api, type Channel, type Publication, type PublishSource, type Texts } from "../api";
import { Field, Modal, inputCls } from "./Modal";

const LANGS = [["fr", "Français"], ["en", "Anglais"], ["es", "Espagnol"], ["de", "Allemand"], ["it", "Italien"], ["pt", "Portugais"]];

const NETWORK_LINKS: { key: string; label: string; url: string; note: string }[] = [
  { key: "tiktok", label: "TikTok", url: "https://www.tiktok.com/upload", note: "Dépose le MP4, colle la légende." },
  { key: "instagram", label: "Instagram", url: "https://www.instagram.com/", note: "Créer → Reel, colle la légende." },
  { key: "youtube", label: "YouTube Shorts", url: "https://studio.youtube.com/", note: "Créer → Importer, titre et description." },
  { key: "snapchat", label: "Snapchat Spotlight", url: "https://my.snapchat.com/", note: "Ou partage depuis le téléphone." },
  { key: "x", label: "X", url: "https://x.com/compose/post", note: "" },
  { key: "facebook", label: "Facebook Reels", url: "https://www.facebook.com/reels/create", note: "" },
];

export const PublishPanel: React.FC<{ source: PublishSource; title: string; onClose: () => void; notify: (m: string) => void }> = ({ source, title, onClose, notify }) => {
  const [pub, setPub] = useState<Publication | null>(null);
  const [hint, setHint] = useState("");
  const [extra, setExtra] = useState("");
  const [language, setLanguage] = useState("fr");
  const [busy, setBusy] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [postizOn, setPostizOn] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [when, setWhen] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.publication(source).then((p) => {
      setPub(p);
      if (p.language) setLanguage(p.language);
      if (p.hint) setHint(p.hint);
    }).catch((e: Error) => notify(e.message));
    api.publishChannels().then((r) => {
      setPostizOn(r.enabled);
      setChannels(r.channels);
      setSelected(r.channels.filter((c) => !c.disabled).map((c) => c.id));
    }).catch(() => {});
  }, [source.kind, source.id]);

  const generate = async () => {
    setBusy(true);
    try {
      const p = await api.publishTexts(source, { hint, extra, language });
      setPub(p);
      notify("Textes générés pour tous les réseaux");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setTexts = (patch: (t: Texts) => Texts) => setPub((p) => (p?.texts ? { ...p, texts: patch(p.texts) } : p));
  const save = async () => {
    if (!pub?.texts) return;
    setSaving(true);
    try {
      await api.savePublication(pub.key, pub.texts);
      notify("Textes enregistrés");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => notify("Copié dans le presse-papiers"));
  const tags = (h: string[]) => h.map((x) => "#" + x).join(" ");

  const shareFromPhone = async (text: string) => {
    if (!pub) return;
    try {
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      const blob = await fetch(pub.url).then((r) => r.blob());
      const file = new File([blob], `${title.replace(/[^\w.-]+/g, "-").slice(0, 40) || "video"}.mp4`, { type: "video/mp4" });
      await navigator.clipboard.writeText(text).catch(() => {});
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else if (navigator.share) {
        await navigator.share({ text, url: location.origin + pub.url });
      } else {
        notify("Ce navigateur ne propose pas le partage : utilise le téléphone, ou télécharge le MP4.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") notify((e as Error).message);
    }
  };

  const send = async () => {
    if (!pub?.texts) return notify("Génère d'abord les textes");
    if (!selected.length) return notify("Choisis au moins un réseau");
    setSending(true);
    try {
      const r = await api.publishSend(pub.key, selected, when ? new Date(when).toISOString() : null);
      const ok = r.filter((x) => x.status === "ok").length;
      notify(`${ok}/${r.length} réseau(x) programmé(s)`);
      setPub((p) => (p ? { ...p, sent: [...p.sent, ...r] } : p));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const t = pub?.texts ?? null;
  const Count: React.FC<{ n: number; max: number }> = ({ n, max }) => <span className={`text-xs ${n > max ? "text-red-400" : "text-zinc-500"}`}>{n}/{max}</span>;

  return (
    <Modal title={`📣 Publier : ${title}`} onClose={onClose} wide>
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-3">
          {pub ? <video src={pub.url} controls playsInline className="w-full rounded-xl bg-black" /> : null}
          {pub ? (
            <a href={pub.url} download className="block rounded-lg border border-zinc-700 px-3 py-2 text-center text-sm hover:bg-zinc-800">
              Télécharger le MP4
            </a>
          ) : null}
          <div className="rounded-xl border border-zinc-800 p-3 text-sm">
            <div className="mb-2 font-medium">Textes</div>
            <Field label="Langue">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
                {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="De quoi parle la vidéo (facultatif)">
              <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} className={inputCls} placeholder="Ex. : ma mère qui veut me caser avec mon pote" />
            </Field>
            <Field label="Consigne (facultatif)">
              <input value={hint} onChange={(e) => setHint(e.target.value)} className={inputCls} placeholder="Ex. : ton plus trash, finir par une question" />
            </Field>
            <button onClick={generate} disabled={busy} className="mt-2 w-full rounded-xl bg-green-500 px-3 py-2 font-semibold text-black hover:bg-green-400 disabled:opacity-50">
              {busy ? "Rédaction…" : t ? "✨ Regénérer les textes" : "✨ Générer les textes pour tous les réseaux"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {!t ? (
            <p className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">
              Clique sur « Générer » : description, accroche et hashtags adaptés à chaque réseau, modifiables ensuite.
            </p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <Block title="TikTok" count={<Count n={t.tiktok.caption.length + tags(t.tiktok.hashtags).length + 2} max={2200} />} onCopy={() => copy(`${t.tiktok.caption}\n\n${tags(t.tiktok.hashtags)}`)} onShare={() => shareFromPhone(`${t.tiktok.caption}\n\n${tags(t.tiktok.hashtags)}`)}>
                  <textarea value={t.tiktok.caption} onChange={(e) => setTexts((x) => ({ ...x, tiktok: { ...x.tiktok, caption: e.target.value } }))} rows={3} className={inputCls} />
                  <input value={tags(t.tiktok.hashtags)} onChange={(e) => setTexts((x) => ({ ...x, tiktok: { ...x.tiktok, hashtags: e.target.value.split(/\s+/).map((h) => h.replace(/^#/, "")).filter(Boolean) } }))} className={inputCls + " mt-1"} />
                </Block>
                <Block title="Instagram Reels" count={<Count n={t.instagram.caption.length + tags(t.instagram.hashtags).length + 2} max={2200} />} onCopy={() => copy(`${t.instagram.caption}\n\n${tags(t.instagram.hashtags)}`)} onShare={() => shareFromPhone(`${t.instagram.caption}\n\n${tags(t.instagram.hashtags)}`)}>
                  <textarea value={t.instagram.caption} onChange={(e) => setTexts((x) => ({ ...x, instagram: { ...x.instagram, caption: e.target.value } }))} rows={3} className={inputCls} />
                  <input value={tags(t.instagram.hashtags)} onChange={(e) => setTexts((x) => ({ ...x, instagram: { ...x.instagram, hashtags: e.target.value.split(/\s+/).map((h) => h.replace(/^#/, "")).filter(Boolean) } }))} className={inputCls + " mt-1"} />
                </Block>
                <Block title="YouTube Shorts" count={<Count n={t.youtube.title.length} max={100} />} onCopy={() => copy(`${t.youtube.title}\n\n${t.youtube.description}\n\n${t.youtube.tags.join(", ")}`)} onShare={() => shareFromPhone(`${t.youtube.title}\n\n${t.youtube.description}`)}>
                  <input value={t.youtube.title} onChange={(e) => setTexts((x) => ({ ...x, youtube: { ...x.youtube, title: e.target.value } }))} className={inputCls} placeholder="Titre" />
                  <textarea value={t.youtube.description} onChange={(e) => setTexts((x) => ({ ...x, youtube: { ...x.youtube, description: e.target.value } }))} rows={3} className={inputCls + " mt-1"} />
                  <input value={t.youtube.tags.join(", ")} onChange={(e) => setTexts((x) => ({ ...x, youtube: { ...x.youtube, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } }))} className={inputCls + " mt-1"} placeholder="Mots-clés" />
                </Block>
                <Block title="Snapchat Spotlight" count={<Count n={t.snapchat.caption.length} max={160} />} onCopy={() => copy(t.snapchat.caption)} onShare={() => shareFromPhone(t.snapchat.caption)}>
                  <textarea value={t.snapchat.caption} onChange={(e) => setTexts((x) => ({ ...x, snapchat: { caption: e.target.value } }))} rows={2} className={inputCls} />
                </Block>
                <Block title="X" count={<Count n={t.x.text.length} max={280} />} onCopy={() => copy(t.x.text)} onShare={() => shareFromPhone(t.x.text)}>
                  <textarea value={t.x.text} onChange={(e) => setTexts((x) => ({ ...x, x: { text: e.target.value } }))} rows={3} className={inputCls} />
                </Block>
                <Block title="Facebook Reels" count={<Count n={t.facebook.text.length} max={2200} />} onCopy={() => copy(t.facebook.text)} onShare={() => shareFromPhone(t.facebook.text)}>
                  <textarea value={t.facebook.text} onChange={(e) => setTexts((x) => ({ ...x, facebook: { text: e.target.value } }))} rows={3} className={inputCls} />
                </Block>
                <Block title="Threads" count={<Count n={t.threads.text.length} max={500} />} onCopy={() => copy(t.threads.text)} onShare={() => shareFromPhone(t.threads.text)}>
                  <textarea value={t.threads.text} onChange={(e) => setTexts((x) => ({ ...x, threads: { text: e.target.value } }))} rows={3} className={inputCls} />
                </Block>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={save} disabled={saving} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50">
                  {saving ? "Enregistrement…" : "Enregistrer mes modifications"}
                </button>
                <span className="text-xs text-zinc-500">📲 Sur le téléphone, « Partager » ouvre la feuille de partage avec la vidéo ; le texte est copié, colle-le dans l'appli.</span>
              </div>

              <div className="rounded-xl border border-zinc-800 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="font-medium">🚀 Publier en un clic</div>
                  {postizOn ? <span className="rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-300">Postiz connecté</span> : <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">Postiz non configuré</span>}
                </div>
                {postizOn ? (
                  <>
                    {channels.length ? (
                      <div className="flex flex-wrap gap-2">
                        {channels.map((c) => (
                          <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 text-sm ${selected.includes(c.id) ? "border-green-500" : "border-zinc-700"} ${c.disabled ? "opacity-50" : ""}`}>
                            <input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} className="accent-green-500" />
                            {c.picture ? <img src={c.picture} alt="" className="h-5 w-5 rounded-full" /> : null}
                            {c.name} <span className="text-xs text-zinc-500">{c.identifier}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500">Aucun réseau connecté dans Postiz : ajoute tes comptes (TikTok, Instagram, YouTube, X, Facebook, Threads…) dans Postiz, ils apparaîtront ici.</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button onClick={send} disabled={sending || !channels.length} className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50">
                        {sending ? "Envoi…" : when ? "Programmer sur les réseaux cochés" : "Publier maintenant sur les réseaux cochés"}
                      </button>
                      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls + " max-w-56"} />
                      {when ? <button onClick={() => setWhen("")} className="text-xs text-zinc-400 hover:underline">tout de suite</button> : null}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-zinc-400">
                    Pour publier en un clic sur TikTok, Instagram, YouTube, X, Facebook et Threads, Niche passe par Postiz (postiz.com, ou auto-hébergé). Crée un compte, connecte tes réseaux, puis mets <code>POSTIZ_API_KEY</code> dans le fichier .env. Snapchat n'a pas d'API : partage depuis le téléphone.
                  </p>
                )}
                {pub?.sent.length ? (
                  <ul className="mt-3 space-y-1 text-xs">
                    {pub.sent.slice(-10).reverse().map((s, i) => (
                      <li key={i} className={s.status === "ok" ? "text-green-300" : "text-red-300"}>
                        {new Date(s.at * 1000).toLocaleString("fr-FR")} · {s.channel} : {s.status === "ok" ? "programmé" : s.detail}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="rounded-xl border border-zinc-800 p-3">
                <div className="mb-2 text-sm font-medium">Ou à la main, texte déjà copié</div>
                <div className="flex flex-wrap gap-2">
                  {NETWORK_LINKS.map((n) => (
                    <a
                      key={n.key}
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      title={n.note}
                      onClick={() => {
                        const txt =
                          n.key === "tiktok" ? `${t.tiktok.caption}\n\n${tags(t.tiktok.hashtags)}`
                          : n.key === "instagram" ? `${t.instagram.caption}\n\n${tags(t.instagram.hashtags)}`
                          : n.key === "youtube" ? `${t.youtube.title}\n\n${t.youtube.description}`
                          : n.key === "snapchat" ? t.snapchat.caption
                          : n.key === "x" ? t.x.text
                          : t.facebook.text;
                        navigator.clipboard.writeText(txt).catch(() => {});
                      }}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                    >
                      {n.label} ↗
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

const Block: React.FC<{ title: string; count: React.ReactNode; onCopy: () => void; onShare: () => void; children: React.ReactNode }> = ({ title, count, onCopy, onShare, children }) => (
  <div className="rounded-xl border border-zinc-800 p-3">
    <div className="mb-1 flex items-center gap-2">
      <span className="text-sm font-medium">{title}</span>
      {count}
      <button onClick={onCopy} className="ml-auto rounded-lg border border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-800">Copier</button>
      <button onClick={onShare} className="rounded-lg border border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-800">📲 Partager</button>
    </div>
    {children}
  </div>
);
