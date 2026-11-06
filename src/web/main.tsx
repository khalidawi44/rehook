import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// Battement de cœur : dit au serveur qu'un onglet est ouvert (arrêt automatique du lanceur).
const clientId = sessionStorage.getItem("niche.client") ?? Math.random().toString(36).slice(2, 12);
sessionStorage.setItem("niche.client", clientId);
const beat = () => fetch("/api/heartbeat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: clientId }), keepalive: true }).catch(() => {});
beat();
setInterval(beat, 10_000);
window.addEventListener("pagehide", () => {
  if (typeof navigator.sendBeacon === "function") navigator.sendBeacon(`/api/bye?id=${clientId}`);
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
