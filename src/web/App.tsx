import React, { useCallback, useEffect, useState } from "react";
import { api, fmtClock, fmtNum, timeAgo, type Alert, type Job, type Stats, type VideoCard as Card } from "./api";
import { AlertsPanel } from "./components/AlertsPanel";
import { RecorderPanel } from "./components/RecorderPanel";
import { MontagePanel } from "./components/MontagePanel";
import { TrendsPanel } from "./components/TrendsPanel";
import { PlanningPanel } from "./components/PlanningPanel";
import { VideoCard } from "./components/VideoCard";
import { VideoModal } from "./components/VideoModal";
import { RecreateModal } from "./components/RecreateModal";
import { JobsPanel } from "./components/JobsPanel";
import { AccountsPanel } from "./components/AccountsPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ImportModal } from "./components/ImportModal";

type Tab = "viral" | "all" | "accounts" | "jobs" | "alerts" | "recorder" | "montage" | "planning";

const PERIODS = [
  { k: "24h", l: "24 h" },
  { k: "3d", l: "3 jours" },
  { k: "7d", l: "7 jours" },
  { k: "all", l: "Tout" },
];

export const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>("viral");
  const [period, setPeriod] = useState("7d");
  const [duration, setDuration] = useState("all");
  const [sort, setSort] = useState("views");
  const [unfollowed, setUnfollowed] = useState(true);
  const [favOnly, setFavOnly] = useState(false);
  const [q, setQ] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Card | null>(null);
  const [recreate, setRecreate] = useState<Card | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifPermission, setNotifPermission] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [toast, setToast] = useState<string | null>(null);
  const [updating, setUpdating] = useState<{ log: string[]; phase: string; error: string | null } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const startUpdate = async () => {
    try {
      await api.updateApply();
      setUpdating({ log: [], phase: "updating", error: null });
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const checkUpdateNow = async () => {
    setCheckingUpdate(true);
    try {
      const r = await api.updateCheck();
      if (r.error) notify("Vérification impossible : " + r.error);
      else notify(r.available ? `Mise à jour disponible (${r.changes.length} changement(s))` : "Niche est à jour");
      loadStats();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setCheckingUpdate(false);
    }
  };
  // Pendant une mise à jour : suivre le journal, puis attendre le retour du serveur et recharger.
  useEffect(() => {
    if (!updating) return;
    let gone = false;
    const t = setInterval(async () => {
      try {
        const st = await api.updateState();
        if (gone) {
          clearInterval(t);
          location.reload();
          return;
        }
        setUpdating({ log: st.log, phase: st.phase, error: st.error });
        if (st.phase === "error") clearInterval(t);
      } catch {
        gone = true; // serveur en train de redémarrer
      }
    }, 1500);
    return () => clearInterval(t);
  }, [updating]);

  const notify = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const h = () => setTab("montage");
    window.addEventListener("niche:goto-montage", h);
    return () => window.removeEventListener("niche:goto-montage", h);
  }, []);

  const loadStats = useCallback(() => api.stats().then(setStats).catch((e: Error) => setError(e.message)), []);
  const loadJobs = useCallback(() => api.jobs().then(setJobs).catch(() => {}), []);
  const lastAlertId = React.useRef<number | null>(null);
  const loadAlerts = useCallback(
    () =>
      api
        .alerts()
        .then((list) => {
          setAlerts(list);
          const newest = list[0]?.id ?? null;
          if (lastAlertId.current !== null && newest !== null && newest > lastAlertId.current) {
            const fresh = list.filter((a) => a.id > (lastAlertId.current ?? 0) && !a.seen);
            for (const a of fresh.slice(0, 3)) {
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                const n = new Notification("Niche : ça explose", { body: a.message, tag: `niche-${a.id}` });
                n.onclick = () => window.open(a.video.url, "_blank");
              }
            }
            if (fresh.length) {
              notify(fresh[0].message);
              beep();
            }
          }
          lastAlertId.current = newest;
        })
        .catch(() => {}),
    [notify],
  );
  const askNotif = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setNotifPermission);
  };

  const loadVideos = useCallback(() => {
    if (tab !== "viral" && tab !== "all") return;
    setLoading(true);
    api
      .videos({ view: favOnly ? "favorites" : tab, period, duration, sort, unfollowed: unfollowed ? "1" : "0", q })
      .then((v) => {
        setCards(tab === "viral" && favOnly ? v.filter((c) => c.metrics.viral) : v);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, period, duration, sort, unfollowed, favOnly, q]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    loadStats();
    loadJobs();
    loadAlerts();
    const t = setInterval(() => {
      loadStats();
      loadJobs();
      loadAlerts();
    }, 5000);
    return () => clearInterval(t);
  }, [loadStats, loadJobs, loadAlerts]);

  // Quand un relevé se termine, on recharge la grille.
  const wasRunning = React.useRef(false);
  useEffect(() => {
    const running = !!stats?.run.running;
    if (wasRunning.current && !running) {
      loadVideos();
      notify("Relevé terminé : " + (stats?.lastRun?.summary ?? ""));
    }
    wasRunning.current = running;
  }, [stats, loadVideos, notify]);

  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "running").length;

  const refresh = async () => {
    try {
      const r = await api.refresh();
      notify(r.started ? "Relevé lancé" : "Un relevé est déjà en cours");
      loadStats();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const toggleFav = async (c: Card) => {
    const r = await api.favorite(c.id);
    setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, favorite: r.favorite } : x)));
    if (detail?.id === c.id) setDetail({ ...detail, favorite: r.favorite });
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-green-500 text-lg font-black text-black">N</span>
            <span className="text-xl font-bold tracking-tight">Niche</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Stat value={stats?.viralToday} label="virales aujourd'hui" accent />
            <Stat value={stats?.total} label="vidéos relevées" />
            <Stat value={stats?.followed} label="comptes suivis" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowImport(true)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">
              <span className="sm:hidden">+ URL</span>
              <span className="hidden sm:inline">+ Importer une URL</span>
            </button>
            <button onClick={() => setShowSettings(true)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800" aria-label="Réglages">
              <span className="sm:hidden">⚙️</span>
              <span className="hidden sm:inline">Réglages</span>
            </button>
            <button
              onClick={refresh}
              disabled={stats?.run.running}
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold text-black hover:bg-white disabled:opacity-50"
            >
              {stats?.run.running ? "Relevé en cours…" : "Actualiser"}
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 pb-2 text-xs text-zinc-400 sm:px-4">
          <span className={`h-2 w-2 rounded-full ${stats?.run.running ? "animate-pulse bg-amber-400" : "bg-green-500"}`} />
          {stats?.run.running ? (
            <span>Relevé en cours : {stats.run.step || "démarrage"}</span>
          ) : stats?.lastRun?.finished_at ? (
            <span>
              Actualisé {timeAgo(stats.lastRun.finished_at, stats.now)}.
              {stats.nextRefresh ? ` Prochaine actualisation vers ${fmtClock(stats.nextRefresh)}.` : " Actualisation automatique désactivée."}
            </span>
          ) : (
            <span>Aucun relevé pour l'instant. Cliquez sur Actualiser.</span>
          )}
          {stats ? (
            <span className="ml-2 text-zinc-500">
              {stats.run.watch.running
                ? "Veille : relevé en cours…"
                : stats.settings.watchMinutes > 0
                  ? `Veille toutes les ${stats.settings.watchMinutes} min${stats.run.watch.lastAt ? `, dernier relevé ${timeAgo(stats.run.watch.lastAt, stats.now)} (${stats.run.watch.lastCount} vidéos)` : ""}.`
                  : "Veille désactivée."}
            </span>
          ) : null}
          {stats?.providers.autoExit ? <span className="text-zinc-500">Fermer cet onglet arrête Niche.</span> : null}
          {stats?.providers.updatable ? (
            stats.update.available ? (
              <button onClick={startUpdate} className="rounded bg-green-500 px-2 py-0.5 text-xs font-semibold text-black hover:bg-green-400" title={stats.update.changes.join("\n")}>
                ⬆️ Mise à jour disponible : installer sans fermer
              </button>
            ) : (
              <button onClick={checkUpdateNow} disabled={checkingUpdate} className="text-zinc-500 hover:text-zinc-300" title={`Version ${stats.update.current}`}>
                {checkingUpdate ? "Vérification…" : `v. ${stats.update.current || "?"} · vérifier les mises à jour`}
              </button>
            )
          ) : null}
          {stats && !stats.providers.anthropic ? (
            <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-amber-300">ANTHROPIC_API_KEY manquante : la recréation ne marchera pas</span>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 pt-3 sm:px-4 sm:pt-4">
        <nav className="scrollbar-thin -mx-3 flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-zinc-800 px-3 text-sm sm:mx-0 sm:flex-wrap sm:px-0">
          <TabBtn active={tab === "viral"} onClick={() => setTab("viral")}>
            🔥 Viral <Count n={stats?.viralAll} />
          </TabBtn>
          <TabBtn active={tab === "all"} onClick={() => setTab("all")}>
            Toutes les vidéos <Count n={stats?.total} />
          </TabBtn>
          <TabBtn active={tab === "accounts"} onClick={() => setTab("accounts")}>
            Comptes <Count n={stats?.accounts} />
          </TabBtn>
          <TabBtn active={tab === "alerts"} onClick={() => { setTab("alerts"); api.alertsSeen().then(loadStats).catch(() => {}); }}>
            🚨 Alertes {stats?.unseenAlerts ? <span className="ml-1 rounded-full bg-red-500 px-2 text-xs font-bold text-white">{stats.unseenAlerts}</span> : <Count n={alerts.length} />}
          </TabBtn>
          <TabBtn active={tab === "recorder"} onClick={() => setTab("recorder")}>
            🎥 Enregistreur
          </TabBtn>
          <TabBtn active={tab === "montage"} onClick={() => setTab("montage")}>
            ✂️ Montage
          </TabBtn>
          <TabBtn active={tab === "planning"} onClick={() => setTab("planning")}>
            📅 Planning
          </TabBtn>
          <TabBtn active={tab === "jobs"} onClick={() => setTab("jobs")}>
            🎬 Recréations {activeJobs ? <span className="ml-1 rounded-full bg-green-500 px-2 text-xs font-bold text-black">{activeJobs}</span> : <Count n={jobs.length} />}
          </TabBtn>
        </nav>

        {tab === "viral" || tab === "all" ? (
          <>
            {tab === "viral" ? <TrendsPanel /> : null}
            <div className="my-4 flex flex-wrap items-center gap-2 text-sm">
              <div className="flex overflow-hidden rounded-lg border border-zinc-700">
                {PERIODS.map((p) => (
                  <button
                    key={p.k}
                    onClick={() => setPeriod(p.k)}
                    className={`px-3 py-1.5 ${period === p.k ? "bg-zinc-100 text-black" : "hover:bg-zinc-800"}`}
                  >
                    {p.l}
                  </button>
                ))}
              </div>
              <select value={duration} onChange={(e) => setDuration(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5">
                <option value="all">Toutes durées</option>
                <option value="short">Moins de 15 s</option>
                <option value="medium">15 s à 1 min</option>
                <option value="long">1 à 3 min</option>
                <option value="xlong">Plus de 3 min</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5">
                <option value="views">Les plus vues</option>
                <option value="vph">Vues par heure</option>
                <option value="growth">Croissance</option>
                <option value="engagement">Engagement</option>
                <option value="score">Score viral</option>
                <option value="recent">Les plus récentes</option>
              </select>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5">
                <input type="checkbox" checked={unfollowed} onChange={(e) => setUnfollowed(e.target.checked)} className="accent-green-500" />
                Comptes non suivis
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5">
                <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} className="accent-green-500" />
                ⭐ Favoris
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (légende, compte, hashtag)"
                className="min-w-60 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5"
              />
            </div>

            {error ? <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
            {loading && !cards.length ? <p className="text-zinc-400">Chargement…</p> : null}
            {!loading && !cards.length ? (
              <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center text-zinc-400">
                <p className="text-lg font-semibold text-zinc-200">Rien à afficher avec ces filtres</p>
                <p className="mt-2 text-sm">
                  {tab === "viral"
                    ? "Une vidéo est « virale » si elle a moins de 7 jours et dépasse les seuils des réglages. Les nouvelles vidéos des comptes suivis arrivent à chaque découverte."
                    : "Élargissez la période, ajoutez des hashtags ou des comptes dans les réglages, importez une URL TikTok, ou lancez un relevé."}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
                  {period !== "all" ? (
                    <button onClick={() => setPeriod("all")} className="rounded-lg border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800">
                      Voir toute la période
                    </button>
                  ) : null}
                  {tab === "viral" ? (
                    <button onClick={() => setTab("all")} className="rounded-lg border border-zinc-600 px-3 py-1.5 hover:bg-zinc-800">
                      Toutes les vidéos relevées
                    </button>
                  ) : null}
                  <button onClick={refresh} className="rounded-lg bg-green-500 px-3 py-1.5 font-semibold text-black hover:bg-green-400">
                    Lancer une découverte
                  </button>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((c) => (
                <VideoCard
                  key={c.id}
                  card={c}
                  now={stats?.now}
                  onOpen={() => setDetail(c)}
                  onRecreate={() => setRecreate(c)}
                  onFavorite={() => toggleFav(c)}
                />
              ))}
            </div>
          </>
        ) : null}

        {tab === "accounts" ? <AccountsPanel notify={notify} onChanged={loadStats} /> : null}
        {tab === "jobs" ? <JobsPanel jobs={jobs} reload={loadJobs} notify={notify} /> : null}
        {tab === "recorder" ? <RecorderPanel notify={notify} /> : null}
        {tab === "montage" ? <MontagePanel notify={notify} /> : null}
        {tab === "planning" ? <PlanningPanel notify={notify} /> : null}
        {tab === "alerts" ? (
          <AlertsPanel
            alerts={alerts}
            reload={() => {
              loadAlerts();
              loadStats();
            }}
            onOpenVideo={(id) => api.video(id).then((v) => setDetail(v)).catch((e: Error) => notify(e.message))}
            notifPermission={notifPermission}
            askNotif={askNotif}
          />
        ) : null}
      </main>

      {detail ? (
        <VideoModal
          card={detail}
          onClose={() => setDetail(null)}
          onRecreate={() => {
            setRecreate(detail);
            setDetail(null);
          }}
          onFavorite={() => toggleFav(detail)}
          onDeleted={() => {
            setDetail(null);
            loadVideos();
            loadStats();
          }}
        />
      ) : null}
      {recreate ? (
        <RecreateModal
          card={recreate}
          onClose={() => setRecreate(null)}
          onQueued={() => {
            setRecreate(null);
            setTab("jobs");
            loadJobs();
            notify("Recréation lancée");
          }}
        />
      ) : null}
      {showSettings ? (
        <SettingsModal
          stats={stats}
          onClose={() => {
            setShowSettings(false);
            loadStats();
            loadVideos();
          }}
          notify={notify}
        />
      ) : null}
      {showImport ? (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={(n) => {
            setShowImport(false);
            notify(`${n} vidéo(s) importée(s)`);
            loadVideos();
            loadStats();
          }}
        />
      ) : null}
      {updating ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-5">
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold">
              {updating.phase === "error" ? "❌ Mise à jour échouée" : "⬆️ Mise à jour en cours"}
              {updating.phase !== "error" ? <span className="h-3 w-3 animate-pulse rounded-full bg-green-500" /> : null}
            </div>
            <p className="text-sm text-zinc-400">{updating.phase === "error" ? updating.error : "Téléchargement, construction de l'interface puis redémarrage : la page se recharge toute seule (une à trois minutes)."}</p>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-2 text-xs text-zinc-300">{updating.log.join("\n") || "…"}</pre>
            {updating.phase === "error" ? <button onClick={() => setUpdating(null)} className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">Fermer</button> : null}
          </div>
        </div>
      ) : null}
      {toast ? <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-black shadow-xl">{toast}</div> : null}
    </div>
  );
};

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
  } catch {
    // pas de son disponible
  }
}

const Stat: React.FC<{ value: number | undefined; label: string; accent?: boolean }> = ({ value, label, accent }) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5">
    <div className={`text-lg font-bold leading-tight ${accent ? "text-green-400" : ""}`}>{value === undefined ? "…" : fmtNum(value)}</div>
    <div className="text-[11px] text-zinc-400">{label}</div>
  </div>
);

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`-mb-px flex items-center gap-1 border-b-2 px-3 py-2 ${active ? "border-green-500 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}
  >
    {children}
  </button>
);

const Count: React.FC<{ n: number | undefined }> = ({ n }) => (n === undefined ? null : <span className="ml-1 text-xs text-zinc-500">{n}</span>);
