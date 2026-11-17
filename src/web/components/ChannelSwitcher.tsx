import React, { useEffect, useState } from "react";
import { api, type Channel, type Pack } from "../api";
import { inputCls } from "./Modal";

/** Chaînes (espaces de travail) : chaque chaîne a ses comptes suivis, ses hashtags, ses recherches, son pack. */
export const ChannelSwitcher: React.FC<{ notify: (m: string) => void }> = ({ notify }) => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pack, setPack] = useState("");
  const [packs, setPacks] = useState<Pack[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => api.channels().then((r) => { setChannels(r.channels); setActive(r.active); }).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (open) api.packs().then(setPacks).catch(() => {});
  }, [open]);
  const current = channels.find((c) => c.id === active);

  const switchTo = async (id: string) => {
    if (id === "__new") return setOpen(true);
    if (id === active) return;
    await api.activateChannel(id);
    location.reload();
  };
  const create = async () => {
    if (!name.trim()) return notify("Donne un nom à la chaîne.");
    setBusy(true);
    try {
      await api.createChannel(name.trim(), pack || undefined);
      location.reload();
    } catch (e) {
      notify((e as Error).message);
      setBusy(false);
    }
  };
  const rename = async () => {
    if (!current) return;
    const n = prompt("Nouveau nom de la chaîne :", current.name);
    if (!n?.trim()) return;
    await api.renameChannel(current.id, n.trim());
    load();
  };
  const remove = async () => {
    if (!current || channels.length < 2) return notify("Il faut garder au moins une chaîne.");
    if (!confirm(`Supprimer la chaîne « ${current.name} » ? Ses vidéos propres et ses suivis disparaissent, le fil partagé reste.`)) return;
    try {
      await api.deleteChannel(current.id);
      location.reload();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <div className="relative flex items-center gap-1">
      <select value={active} onChange={(e) => switchTo(e.target.value)} className="max-w-[180px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm" title="Chaîne active : ses comptes, hashtags, recherches">
        {channels.map((c) => (
          <option key={c.id} value={c.id}>📺 {c.name}</option>
        ))}
        <option value="__new">＋ Nouvelle chaîne…</option>
      </select>
      <button onClick={() => setOpen(!open)} className="rounded-lg border border-zinc-700 px-2 py-2 text-sm hover:bg-zinc-800" title="Gérer les chaînes">⋯</button>
      {open ? (
        <div className="absolute right-0 top-11 z-30 w-80 space-y-2 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm shadow-xl">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Nouvelle chaîne</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (ex. GTA 6, Humour, Beauté)" className={inputCls} />
          <select value={pack} onChange={(e) => setPack(e.target.value)} className={inputCls}>
            <option value="">Sans pack (je règle moi-même)</option>
            {packs.map((p) => (
              <option key={p.name} value={p.name}>Pack {p.title}</option>
            ))}
          </select>
          <button onClick={create} disabled={busy} className="w-full rounded-lg bg-green-500 px-3 py-1.5 font-semibold text-black hover:bg-green-400 disabled:opacity-50">{busy ? "Création…" : "Créer et basculer"}</button>
          {current ? (
            <>
              <div className="pt-1 text-xs uppercase tracking-wide text-zinc-500">Chaîne actuelle : {current.name}</div>
              <div className="flex gap-2">
                <button onClick={rename} className="flex-1 rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Renommer</button>
                <button onClick={remove} className="flex-1 rounded-lg border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950">Supprimer</button>
              </div>
            </>
          ) : null}
          <p className="text-[11px] text-zinc-500">Chaque chaîne a ses comptes suivis, ses hashtags, ses recherches et ses vidéos. Le fil Explorer est partagé.</p>
          <button onClick={() => setOpen(false)} className="w-full rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Fermer</button>
        </div>
      ) : null}
    </div>
  );
};
