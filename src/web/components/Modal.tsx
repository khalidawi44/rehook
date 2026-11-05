import React, { useEffect } from "react";

export const Modal: React.FC<{ title: React.ReactNode; onClose: () => void; wide?: boolean; children: React.ReactNode }> = ({ title, onClose, wide, children }) => {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-2 pt-4 sm:p-4 sm:pt-10" onClick={onClose}>
      <div
        className={`w-full ${wide ? "max-w-5xl" : "max-w-2xl"} rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="p-3 sm:p-5">{children}</div>
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block text-sm">
    <span className="mb-1 block font-medium text-zinc-300">{label}</span>
    {children}
    {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
  </label>
);

export const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-green-500";
