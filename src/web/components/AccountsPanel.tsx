import React, { useCallback, useEffect, useState } from "react";
import { api, fmtNum, type Account } from "../api";
import { inputCls } from "./Modal";

export const AccountsPanel: React.FC<{ notify: (m: string) => void; onChanged: () => void }> = ({ notify, onChanged }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const toggleSel = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const bulk = async (action: "delete" | "keep" | "unfollow") => {
    const ids = [...sel];
    if (!ids.length) return notify("Coche d'abord des comptes.");
    const names = accounts.filter((a) => sel.has(a.id)).map((a) => "@" + a.handle).join(", ");
    const msg =
      action === "delete"
        ? `Supprimer ${ids.length} compte(s) et leurs vidéos : ${names} ?`
        : action === "keep"
          ? `Ne garder QUE ${names} et supprimer tous les autres comptes (${accounts.length - ids.length}) avec leurs vidéos ?`
          : `Ne plus suivre ${names} (les vidéos déjà relevées restent) ?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const r = await api.bulkAccounts(action, ids);
      notify(`${r.changes} compte(s) ${action === "unfollow" ? "plus suivi(s)" : "supprimé(s)"}.`);
      setSel(new Set());
      load();
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const load = useCallback(() => api.accounts().then(setAccounts).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!handle.trim()) return;
    setBusy(true);
    try {
      await api.addAccount(handle);
      setHandle("");
      notify("Compte ajouté et suivi. Lancez un relevé pour récupérer ses vidéos.");
      load();
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (a: Account) => {
    await api.setFollowed(a.id, !a.followed);
    load();
    onChanged();
  };
  const remove = async (a: Account) => {
    if (!confirm(`Supprimer @${a.handle} et ses ${a.videos} vidéo(s) ?`)) return;
    await api.deleteAccount(a.id);
    load();
    onChanged();
  };

  return (
    <div className="my-4 space-y-4">
      <div className="flex gap-2">
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="@pseudo TikTok à suivre"
          className={inputCls + " max-w-sm"}
        />
        <button onClick={add} disabled={busy} className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50">
          Suivre
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">{sel.size ? `${sel.size} coché(s) :` : "Coche des comptes pour agir en masse :"}</span>
        <button onClick={() => setSel(new Set(accounts.map((a) => a.id)))} className="rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800">Tout cocher</button>
        <button onClick={() => setSel(new Set())} className="rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800">Rien</button>
        <button onClick={() => bulk("keep")} disabled={busy || !sel.size} className="rounded-lg border border-green-500 px-2 py-1 text-green-300 hover:bg-zinc-800 disabled:opacity-40">Garder seulement les cochés</button>
        <button onClick={() => bulk("unfollow")} disabled={busy || !sel.size} className="rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40">Ne plus suivre les cochés</button>
        <button onClick={() => bulk("delete")} disabled={busy || !sel.size} className="rounded-lg border border-red-500/60 px-2 py-1 text-red-300 hover:bg-zinc-800 disabled:opacity-40">Supprimer les cochés</button>
      </div>
      <p className="text-xs text-zinc-500">
        Les comptes suivis sont relevés à chaque actualisation. Le point vert sur les cartes signale un compte suivi. Une vidéo qui fait plusieurs fois la médiane de son compte est marquée virale.
      </p>
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="p-3"></th>
              <th className="p-3">Compte</th>
              <th className="p-3">Abonnés</th>
              <th className="p-3">Vidéos relevées</th>
              <th className="p-3">Vues moy.</th>
              <th className="p-3">Record</th>
              <th className="p-3">Suivi</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className={`border-t border-zinc-800 ${sel.has(a.id) ? "bg-zinc-800/50" : ""}`}>
                <td className="p-3">
                  <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggleSel(a.id)} className="accent-green-500" />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {a.avatar_url ? <img src={a.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-700 text-xs">{a.handle[0]?.toUpperCase()}</span>}
                    <div>
                      <a href={`https://www.tiktok.com/@${a.handle}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                        @{a.handle}
                      </a>
                      {a.nickname ? <div className="text-xs text-zinc-500">{a.nickname}</div> : null}
                    </div>
                  </div>
                </td>
                <td className="p-3">{fmtNum(a.followers)}</td>
                <td className="p-3">
                  <button onClick={() => window.dispatchEvent(new CustomEvent("niche:goto-followed", { detail: a.id }))} className="rounded-lg border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800" title="Voir toutes ses vidéos">
                    {a.videos} ▸
                  </button>
                </td>
                <td className="p-3">{fmtNum(a.avg_views)}</td>
                <td className="p-3">{fmtNum(a.max_views)}</td>
                <td className="p-3">
                  <button onClick={() => toggle(a)} className={`rounded-full px-3 py-1 text-xs font-semibold ${a.followed ? "bg-green-500 text-black" : "border border-zinc-700 text-zinc-300"}`}>
                    {a.followed ? "Suivi" : "Suivre"}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => remove(a)} className="text-xs text-red-300 hover:underline">
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {!accounts.length ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-zinc-500">
                  Aucun compte pour l'instant.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};
