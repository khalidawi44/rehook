// Arrêt automatique (NICHE_AUTO_EXIT=1, posé par le lanceur) : chaque onglet
// envoie un battement toutes les 10 s ; sans aucun onglet pendant 2 min, et
// sans rendu en cours, le serveur s'arrête. Un rechargement de page ne compte pas.
import type express from "express";
import { db } from "./db.js";
import { listMontages } from "./montage.js";
import { runState } from "./collector.js";

const clients = new Map<string, number>();
let lastSeen = 0;
let everSeen = false;
const started = Date.now();
const GRACE_MS = 2 * 60_000;
const FIRST_CLIENT_MS = 5 * 60_000;

export function autoExitEnabled() {
  return process.env.NICHE_AUTO_EXIT === "1";
}

function busy(): boolean {
  const running = (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'running'").get() as { n: number }).n;
  return running > 0 || listMontages().some((m) => m.status === "running") || runState.running;
}

export function installLifecycle(app: express.Express) {
  app.post("/api/heartbeat", (req, res) => {
    const id = String(req.body?.id ?? req.query.id ?? "anon").slice(0, 64);
    clients.set(id, Date.now());
    lastSeen = Date.now();
    everSeen = true;
    res.json({ ok: true, autoExit: autoExitEnabled(), clients: clients.size });
  });
  app.post("/api/bye", (req, res) => {
    const id = String(req.query.id ?? "").slice(0, 64);
    if (id) clients.delete(id);
    res.json({ ok: true });
  });
  app.get("/api/lifecycle", (_req, res) => res.json({ autoExit: autoExitEnabled(), clients: clients.size, busy: busy() }));

  if (!autoExitEnabled()) return;
  console.log("[rehook] arrêt automatique : le serveur s'arrête 2 min après la fermeture du dernier onglet");
  setInterval(() => {
    const now = Date.now();
    for (const [id, t] of clients) if (now - t > 35_000) clients.delete(id);
    if (clients.size > 0) return;
    if (!everSeen) {
      if (now - started > FIRST_CLIENT_MS) {
        console.log("[rehook] aucun onglet ouvert depuis 5 min : arrêt");
        process.exit(0);
      }
      return;
    }
    if (now - lastSeen < GRACE_MS) return;
    if (busy()) return;
    console.log("[rehook] plus aucun onglet depuis 2 min : arrêt");
    process.exit(0);
  }, 10_000).unref();
}
