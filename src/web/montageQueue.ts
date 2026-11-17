// File d'attente « Envoyer au montage » : n'importe quel écran y dépose un clip,
// l'onglet Montage l'ajoute à la timeline en s'ouvrant.
import type { ClipSource } from "./api";

export type PendingClip = { source: ClipSource; name: string; url: string; durationS: number | null };
const KEY = "rehook.montage.pending";

export function sendToMontage(item: PendingClip, go = true) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as PendingClip[];
    list.push(item);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // stockage indisponible
  }
  if (go) window.dispatchEvent(new CustomEvent("rehook:goto-montage"));
}

export function takePending(): PendingClip[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as PendingClip[];
    localStorage.removeItem(KEY);
    return list;
  } catch {
    return [];
  }
}
