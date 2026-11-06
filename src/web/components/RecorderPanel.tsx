import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDuration, timeAgo, type Capture } from "../api";
import { Field, inputCls } from "./Modal";
import { sendToMontage } from "../montageQueue";

type Rect = { x: number; y: number; w: number; h: number };
type Aspect = "9:16" | "1:1" | "16:9" | "free";

const PRESETS: { label: string; w: number; h: number; aspect: Aspect }[] = [
  { label: "TikTok / Reels 1080x1920", w: 1080, h: 1920, aspect: "9:16" },
  { label: "Carré 1080x1080", w: 1080, h: 1080, aspect: "1:1" },
  { label: "YouTube 1920x1080", w: 1920, h: 1080, aspect: "16:9" },
  { label: "HD vertical 720x1280", w: 720, h: 1280, aspect: "9:16" },
];

const ratioOf = (a: Aspect) => (a === "9:16" ? 9 / 16 : a === "1:1" ? 1 : a === "16:9" ? 16 / 9 : null);

export const RecorderPanel: React.FC<{ notify: (m: string) => void }> = ({ notify }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [src, setSrc] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const selRef = useRef(sel);
  selRef.current = sel;
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [out, setOut] = useState({ w: 1080, h: 1920 });
  const [mic, setMic] = useState(false);
  const [fps, setFps] = useState(30);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ phase: "envoi" | "conversion"; p: number } | null>(null);
  const [name, setName] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ mode: "move" | "resize" | "new"; start: { x: number; y: number }; orig: Rect } | null>(null);

  const loadCaptures = useCallback(() => api.captures().then(setCaptures).catch(() => {}), []);
  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  const stopStream = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setSrc({ w: 0, h: 0 });
  }, [stream]);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  const fitSelection = useCallback(
    (w: number, h: number, a: Aspect): Rect => {
      const r = ratioOf(a);
      if (!r) return { x: 0, y: 0, w, h };
      let sw = w;
      let sh = sw / r;
      if (sh > h) {
        sh = h;
        sw = sh * r;
      }
      return { x: Math.round((w - sw) / 2), y: Math.round((h - sh) / 2), w: Math.round(sw), h: Math.round(sh) };
    },
    [],
  );

  const pickScreen = async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: true });
      setStream(s);
      s.getVideoTracks()[0].addEventListener("ended", () => {
        setStream(null);
        setSrc({ w: 0, h: 0 });
      });
      const v = videoRef.current!;
      v.srcObject = s;
      await v.play();
      const w = v.videoWidth;
      const h = v.videoHeight;
      setSrc({ w, h });
      setSel(fitSelection(w, h, aspect));
    } catch (e) {
      notify("Capture refusée : " + (e as Error).message);
    }
  };

  // Aperçu : image + zone sélectionnée.
  useEffect(() => {
    if (!stream || !src.w) return;
    const canvas = previewRef.current!;
    const video = videoRef.current!;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      const maxW = canvas.parentElement?.clientWidth ?? 640;
      const scale = Math.min(maxW / src.w, Math.max(320, window.innerHeight * 0.62) / src.h);
      canvas.width = Math.round(src.w * scale);
      canvas.height = Math.round(src.h * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const s = selRef.current;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, s.x, s.y, s.w, s.h, s.x * scale, s.y * scale, s.w * scale, s.h * scale);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x * scale, s.y * scale, s.w * scale, s.h * scale);
      ctx.fillStyle = "#22c55e";
      ctx.fillRect((s.x + s.w) * scale - 7, (s.y + s.h) * scale - 7, 14, 14);
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [stream, src]);

  const toSource = (e: React.MouseEvent) => {
    const canvas = previewRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / src.w;
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const onDown = (e: React.MouseEvent) => {
    if (!src.w) return;
    const p = toSource(e);
    const s = selRef.current;
    const nearHandle = Math.abs(p.x - (s.x + s.w)) < 24 / (previewRef.current!.width / src.w) && Math.abs(p.y - (s.y + s.h)) < 24 / (previewRef.current!.width / src.w);
    const inside = p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h;
    dragRef.current = { mode: nearHandle ? "resize" : inside ? "move" : "new", start: p, orig: nearHandle || inside ? s : { x: p.x, y: p.y, w: 0, h: 0 } };
  };

  const clamp = (r: Rect): Rect => {
    const w = Math.max(16, Math.min(r.w, src.w));
    const h = Math.max(16, Math.min(r.h, src.h));
    return { x: Math.round(Math.min(Math.max(0, r.x), src.w - w)), y: Math.round(Math.min(Math.max(0, r.y), src.h - h)), w: Math.round(w), h: Math.round(h) };
  };

  const onMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toSource(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const r = ratioOf(aspect);
    if (d.mode === "move") {
      setSel(clamp({ ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy }));
    } else {
      let w = d.mode === "resize" ? d.orig.w + dx : Math.abs(dx);
      let h = d.mode === "resize" ? d.orig.h + dy : Math.abs(dy);
      if (r) h = w / r;
      const x = d.mode === "resize" ? d.orig.x : Math.min(d.start.x, p.x);
      const y = d.mode === "resize" ? d.orig.y : r ? d.start.y : Math.min(d.start.y, p.y);
      setSel(clamp({ x, y, w, h }));
    }
  };
  const onUp = () => (dragRef.current = null);

  const applyAspect = (a: Aspect) => {
    setAspect(a);
    if (src.w) setSel(fitSelection(src.w, src.h, a));
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setOut({ w: p.w, h: p.h });
    applyAspect(p.aspect);
  };

  const start = async () => {
    if (!stream || !src.w) return;
    const outCanvas = outRef.current!;
    outCanvas.width = out.w - (out.w % 2);
    outCanvas.height = out.h - (out.h % 2);
    const ctx = outCanvas.getContext("2d")!;
    const video = videoRef.current!;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      const s = selRef.current;
      ctx.drawImage(video, s.x, s.y, s.w, s.h, 0, 0, outCanvas.width, outCanvas.height);
      setTimeout(draw, 1000 / fps);
    };
    draw();
    const outStream = outCanvas.captureStream(fps);
    // Audio : son du système (si l'écran partagé le fournit) + micro, mixés.
    const audioTracks: MediaStreamTrack[] = [];
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    let hasAudio = false;
    if (stream.getAudioTracks().length) {
      audioCtx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(dest);
      hasAudio = true;
    }
    if (mic) {
      try {
        const m = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioTracks.push(...m.getAudioTracks());
        audioCtx.createMediaStreamSource(m).connect(dest);
        hasAudio = true;
      } catch {
        notify("Micro indisponible");
      }
    }
    if (hasAudio) dest.stream.getAudioTracks().forEach((t) => outStream.addTrack(t));
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(outStream, { mimeType: mime || undefined, videoBitsPerSecond: 10_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      alive = false;
      audioTracks.forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
      const b = new Blob(chunks, { type: mime || "video/webm" });
      setBlob(b);
      setBlobUrl(URL.createObjectURL(b));
      setRecording(false);
    };
    recorderRef.current = rec;
    setBlob(null);
    setBlobUrl(null);
    setElapsed(0);
    rec.start(1000);
    setRecording(true);
  };

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const stop = () => recorderRef.current?.stop();

  const save = async () => {
    if (!blob) return;
    setSaving(true);
    setSaveProgress({ phase: "envoi", p: 0 });
    try {
      const label = name || `capture-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
      const { jobId } = await api.uploadCaptureAsync(blob, label, elapsed, (p) => setSaveProgress({ phase: "envoi", p }));
      setSaveProgress({ phase: "conversion", p: 0 });
      let job = await api.captureJob(jobId);
      while (job.status === "running") {
        await new Promise((r) => setTimeout(r, 700));
        job = await api.captureJob(jobId);
        setSaveProgress({ phase: "conversion", p: job.progress });
      }
      if (job.status === "error" || !job.capture) throw new Error(job.error ?? "Conversion échouée");
      notify(`Enregistrement converti en MP4 (${fmtDuration(job.capture.durationS)})`);
      setBlob(null);
      setBlobUrl(null);
      setName("");
      loadCaptures();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSaving(false);
      setSaveProgress(null);
    }
  };

  const remove = async (c: Capture) => {
    if (!confirm(`Supprimer « ${c.name} » ?`)) return;
    await api.deleteCapture(c.id);
    loadCaptures();
  };

  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  return (
    <div className="my-4 grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {!supported ? (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
            La capture d'écran du navigateur n'existe pas sur téléphone (ni sur Firefox). Sur iPhone et Android, utilise l'enregistreur d'écran du système, puis importe la vidéo dans l'onglet Montage (« Importer une vidéo »). Sur PC : Chrome ou Edge.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!stream ? (
            <button onClick={pickScreen} disabled={!supported} className="rounded-lg bg-green-500 px-4 py-2 font-semibold text-black hover:bg-green-400 disabled:opacity-50">
              🖥 Choisir l'écran, la fenêtre ou l'onglet
            </button>
          ) : (
            <>
              {!recording ? (
                <button onClick={start} className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-400">
                  ● Enregistrer
                </button>
              ) : (
                <button onClick={stop} className="rounded-lg bg-zinc-100 px-4 py-2 font-semibold text-black hover:bg-white">
                  ■ Arrêter ({fmtDuration(elapsed)})
                </button>
              )}
              <button onClick={stopStream} disabled={recording} className="rounded-lg border border-zinc-700 px-3 py-2 hover:bg-zinc-800 disabled:opacity-50">
                Changer de source
              </button>
              <span className="text-xs text-zinc-500">
                Source {src.w}x{src.h} · zone {sel.w}x{sel.h} · sortie {out.w}x{out.h}
              </span>
            </>
          )}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black p-2">
          <video ref={videoRef} muted playsInline className="hidden" />
          <canvas ref={outRef} className="hidden" />
          {stream ? (
            <canvas ref={previewRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} className="mx-auto block cursor-move rounded" />
          ) : (
            <div className="grid h-72 place-items-center text-center text-sm text-zinc-500">
              Choisis une source. Tu pourras ensuite déplacer la zone verte, la redimensionner par son coin, ou tracer une nouvelle zone.
            </div>
          )}
        </div>
        {blobUrl ? (
          <div className="rounded-xl border border-zinc-800 p-3">
            <div className="mb-2 text-sm font-medium">Enregistrement terminé ({fmtDuration(elapsed)})</div>
            <video src={blobUrl} controls className="max-h-[50vh] rounded-lg bg-black" />
            {saveProgress ? (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-zinc-400">
                  <span>{saveProgress.phase === "envoi" ? "1/2 Envoi au serveur" : "2/2 Conversion MP4"}</span>
                  <span>{Math.round(saveProgress.p * 100)} %</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-green-500 transition-all" style={{ width: `${saveProgress.p * 100}%` }} /></div>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de l'enregistrement" className={inputCls + " max-w-xs"} />
              <button onClick={save} disabled={saving} className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-50">
                {saving ? (saveProgress?.phase === "envoi" ? "Envoi…" : "Conversion…") : "Garder dans Niche (MP4)"}
              </button>
              <a href={blobUrl} download={`${name || "capture"}.webm`} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
                Télécharger le WebM
              </a>
            </div>
          </div>
        ) : null}
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="mb-2 text-sm font-medium">Taille de sortie</div>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p)} className={`rounded-lg border px-2 py-1 text-xs ${out.w === p.w && out.h === p.h ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Largeur">
              <input type="number" min={16} value={out.w} onChange={(e) => setOut({ ...out, w: Number(e.target.value) })} className={inputCls} />
            </Field>
            <Field label="Hauteur">
              <input type="number" min={16} value={out.h} onChange={(e) => setOut({ ...out, h: Number(e.target.value) })} className={inputCls} />
            </Field>
          </div>
          <Field label="Forme de la zone de capture">
            <select value={aspect} onChange={(e) => applyAspect(e.target.value as Aspect)} className={inputCls}>
              <option value="9:16">Verticale 9:16</option>
              <option value="1:1">Carrée</option>
              <option value="16:9">Horizontale 16:9</option>
              <option value="free">Libre</option>
            </select>
          </Field>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Images par seconde">
              <select value={fps} onChange={(e) => setFps(Number(e.target.value))} className={inputCls}>
                <option value={24}>24</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </Field>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} className="accent-green-500" /> Micro
            </label>
          </div>
          <p className="mt-2 text-xs text-zinc-500">La zone verte est recadrée et mise à l'échelle vers la taille de sortie. Le son du système est pris si le navigateur le propose (onglet ou écran entier sur Windows).</p>
        </div>
        <div className="rounded-xl border border-zinc-800 p-3">
          <div className="mb-2 text-sm font-medium">Mes enregistrements ({captures.length})</div>
          {!captures.length ? <p className="text-xs text-zinc-500">Aucun pour l'instant. Un enregistrement gardé peut servir de fond à une recréation (fenêtre « Recréer »).</p> : null}
          <ul className="space-y-2">
            {captures.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <video src={c.url} className="h-24 w-16 rounded bg-black object-cover" muted preload="metadata" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="text-xs text-zinc-500">
                    {fmtDuration(c.durationS)} · {c.width}x{c.height} · {timeAgo(c.createdAt)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button onClick={() => sendToMontage({ source: { kind: "capture", id: c.id }, name: c.name, url: c.url, durationS: c.durationS })} className="rounded-lg border border-green-700 px-2 py-0.5 text-xs text-green-300 hover:bg-green-950">✂️ Montage</button>
                    <a href={c.url} download className="rounded-lg border border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-800">MP4</a>
                    <button onClick={() => remove(c)} className="rounded-lg border border-red-900 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950">Supprimer</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
