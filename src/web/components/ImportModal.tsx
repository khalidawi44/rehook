import React, { useState } from "react";
import { api } from "../api";
import { Field, Modal, inputCls } from "./Modal";

export const ImportModal: React.FC<{ onClose: () => void; onImported: (n: number) => void }> = ({ onClose, onImported }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const go = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const r = await api.import(text);
      if (r.errors.length) setErrors(r.errors);
      if (r.ok) onImported(r.ok);
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Importer des vidéos TikTok" onClose={onClose}>
      <Field label="Liens TikTok (un par ligne)" hint="Les stats sont lues sur la page publique, puis mises à jour à chaque relevé.">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="https://www.tiktok.com/@compte/video/123…" className={inputCls} />
      </Field>
      {errors.length ? (
        <ul className="mt-3 space-y-1 rounded-lg bg-red-500/10 p-3 text-xs text-red-300">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
          Annuler
        </button>
        <button onClick={go} disabled={busy || !text.trim()} className="rounded-xl bg-green-500 px-5 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50">
          {busy ? "Lecture des pages…" : "Importer"}
        </button>
      </div>
    </Modal>
  );
};
