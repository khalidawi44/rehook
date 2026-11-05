import React, { useCallback, useEffect, useState } from "react";
import { api, fmtNum, type Account } from "../api";
import { inputCls } from "./Modal";

export const AccountsPanel: React.FC<{ notify: (m: string) => void; onChanged: () => void }> = ({ notify, onChanged }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
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
      <p className="text-xs text-zinc-500">
        Les comptes suivis sont relevés à chaque actualisation. Le point vert sur les cartes signale un compte suivi. Une vidéo qui fait plusieurs fois la médiane de son compte est marquée virale.
      </p>
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
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
              <tr key={a.id} className="border-t border-zinc-800">
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
                <td className="p-3">{a.videos}</td>
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
                <td colSpan={7} className="p-6 text-center text-zinc-500">
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
