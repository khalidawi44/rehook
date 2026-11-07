import React, { useState } from "react";
import type { ClipAdjust, ClipAudio, ClipChroma, ClipFreeze, ClipMask, ClipSource, ClipZoom } from "../api";
import { Field, inputCls } from "./Modal";

/** Champs d'un clip manipulés par les outils (sous-ensemble de TClip du montage). */
export type ClipToolsValue = {
  speed: number;
  reverse?: boolean;
  rotate?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  adjust?: ClipAdjust | null;
  zoom?: ClipZoom | null;
  freeze?: ClipFreeze | null;
  audio?: ClipAudio | null;
  chroma?: ClipChroma | null;
  mask?: ClipMask;
  mute: boolean;
};

export const MASKS: { key: ClipMask; label: string }[] = [
  { key: "none", label: "Aucun" },
  { key: "circle", label: "Cercle" },
  { key: "rounded", label: "Coins arrondis" },
  { key: "diamond", label: "Losange" },
  { key: "heart", label: "Cœur" },
  { key: "star", label: "Étoile" },
];

const Section: React.FC<{ title: string; hint?: string; active?: boolean; children: React.ReactNode; open: boolean; onToggle: () => void; onReset?: () => void }> = ({ title, hint, active, children, open, onToggle, onReset }) => (
  <div className="rounded-lg border border-zinc-800">
    <div className="flex items-center gap-2 px-2 py-1.5">
      <button onClick={onToggle} className="flex flex-1 items-center gap-2 text-left text-xs">
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
        <span className="font-medium">{title}</span>
        {active ? <span className="rounded-full bg-green-500/20 px-2 text-[10px] text-green-300">actif</span> : null}
        {hint ? <span className="hidden text-zinc-500 sm:inline">{hint}</span> : null}
      </button>
      {active && onReset ? (
        <button onClick={onReset} className="text-[11px] text-zinc-400 hover:text-white" title="Remettre à zéro">
          réinitialiser
        </button>
      ) : null}
    </div>
    {open ? <div className="space-y-2 border-t border-zinc-800 p-2">{children}</div> : null}
  </div>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; neutral: number; onChange: (v: number) => void; fmt?: (v: number) => string }> = ({ label, value, min, max, step, neutral, onChange, fmt }) => (
  <label className="block text-xs">
    <span className="flex justify-between text-zinc-400">
      <span>{label}</span>
      <span className={Math.abs(value - neutral) > 0.001 ? "text-green-300" : ""}>
        {fmt ? fmt(value) : value.toFixed(2)}
        {Math.abs(value - neutral) > 0.001 ? (
          <button onClick={() => onChange(neutral)} className="ml-1 text-zinc-500 hover:text-white" title="Neutre">
            ↺
          </button>
        ) : null}
      </span>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(neutral)} className="w-full accent-green-500" />
  </label>
);

export const ClipTools: React.FC<{
  clip: ClipToolsValue;
  update: (patch: Partial<ClipToolsValue>) => void;
  sources: { label: string; source: ClipSource }[];
}> = ({ clip, update, sources }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const a = clip.adjust ?? {};
  const setA = (patch: Partial<ClipAdjust>) => update({ adjust: { ...a, ...patch } });
  const adjustActive = Object.entries(a).some(([k, v]) => v !== undefined && Math.abs((v as number) - (k === "contrast" || k === "saturation" || k === "gamma" || k === "opacity" ? 1 : 0)) > 0.001);
  const z = clip.zoom ?? { start: 1, end: 1, x: 0.5, y: 0.5 };
  const zoomActive = !!clip.zoom && (Math.abs(z.start - 1) > 0.001 || Math.abs(z.end - 1) > 0.001);
  const au = clip.audio ?? {};
  const setAu = (patch: Partial<ClipAudio>) => update({ audio: { ...au, ...patch } });
  const audioActive = !!(au.fadeInS || au.fadeOutS || au.denoise || au.pitch || au.boost || au.bass || au.treble || au.echo);
  const transformActive = !!(clip.reverse || clip.rotate || clip.flipH || clip.flipV || (clip.mask && clip.mask !== "none") || (clip.freeze && clip.freeze.durationS > 0));
  const ch = clip.chroma;

  return (
    <div className="space-y-2">
      <Section title="🔄 Transformer" hint="rotation, miroir, inverser, forme, image figée" active={transformActive} open={!!open.t} onToggle={() => toggle("t")} onReset={() => update({ reverse: false, rotate: 0, flipH: false, flipV: false, mask: "none", freeze: null })}>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => update({ rotate: (((clip.rotate ?? 0) + 90) % 360) as 0 | 90 | 180 | 270 })} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">↻ Tourner 90° ({clip.rotate ?? 0}°)</button>
          <button onClick={() => update({ flipH: !clip.flipH })} className={`rounded-lg border px-2 py-1 text-xs ${clip.flipH ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>↔ Miroir horizontal</button>
          <button onClick={() => update({ flipV: !clip.flipV })} className={`rounded-lg border px-2 py-1 text-xs ${clip.flipV ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>↕ Miroir vertical</button>
          <button onClick={() => update({ reverse: !clip.reverse })} className={`rounded-lg border px-2 py-1 text-xs ${clip.reverse ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`} title="Lecture à l'envers (image et son)">⏪ Inverser la lecture</button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Vitesse">
            <select value={clip.speed} onChange={(e) => update({ speed: Number(e.target.value) })} className={inputCls}>
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((s) => (
                <option key={s} value={s}>x{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Forme (masque)">
            <select value={clip.mask ?? "none"} onChange={(e) => update({ mask: e.target.value as ClipMask })} className={inputCls}>
              {MASKS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Image figée">
            <select value={clip.freeze?.at ?? "none"} onChange={(e) => update({ freeze: e.target.value === "none" ? null : { at: e.target.value as "start" | "end", durationS: clip.freeze?.durationS || 1 } })} className={inputCls}>
              <option value="none">Non</option>
              <option value="start">Au début</option>
              <option value="end">À la fin</option>
            </select>
          </Field>
          <Field label="Durée figée (s)">
            <input type="number" step="0.5" min={0} max={10} value={clip.freeze?.durationS ?? 1} disabled={!clip.freeze} onChange={(e) => clip.freeze && update({ freeze: { ...clip.freeze, durationS: Number(e.target.value) } })} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title="🎚️ Ajuster" hint="lumière, contraste, saturation, température" active={adjustActive} open={!!open.a} onToggle={() => toggle("a")} onReset={() => update({ adjust: null })}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <Slider label="Luminosité" value={a.brightness ?? 0} min={-0.5} max={0.5} step={0.01} neutral={0} onChange={(v) => setA({ brightness: v })} fmt={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`} />
          <Slider label="Contraste" value={a.contrast ?? 1} min={0.3} max={2.5} step={0.01} neutral={1} onChange={(v) => setA({ contrast: v })} fmt={(v) => `${Math.round((v - 1) * 100)}`} />
          <Slider label="Saturation" value={a.saturation ?? 1} min={0} max={2.5} step={0.01} neutral={1} onChange={(v) => setA({ saturation: v })} fmt={(v) => `${Math.round((v - 1) * 100)}`} />
          <Slider label="Gamma" value={a.gamma ?? 1} min={0.4} max={2.5} step={0.01} neutral={1} onChange={(v) => setA({ gamma: v })} />
          <Slider label="Température" value={a.temperature ?? 0} min={-1} max={1} step={0.01} neutral={0} onChange={(v) => setA({ temperature: v })} fmt={(v) => (v < 0 ? `froid ${Math.round(-v * 100)}` : v > 0 ? `chaud ${Math.round(v * 100)}` : "0")} />
          <Slider label="Teinte" value={a.hue ?? 0} min={-180} max={180} step={1} neutral={0} onChange={(v) => setA({ hue: v })} fmt={(v) => `${v}°`} />
          <Slider label="Netteté" value={a.sharpen ?? 0} min={-1} max={3} step={0.05} neutral={0} onChange={(v) => setA({ sharpen: v })} />
          <Slider label="Opacité" value={a.opacity ?? 1} min={0} max={1} step={0.01} neutral={1} onChange={(v) => setA({ opacity: v })} fmt={(v) => `${Math.round(v * 100)} %`} />
        </div>
      </Section>

      <Section title="🔍 Zoom animé" hint="images clés : zoom au début et à la fin, point visé" active={zoomActive} open={!!open.z} onToggle={() => toggle("z")} onReset={() => update({ zoom: null })}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <Slider label="Zoom au début" value={z.start} min={1} max={3} step={0.01} neutral={1} onChange={(v) => update({ zoom: { ...z, start: v } })} fmt={(v) => `x${v.toFixed(2)}`} />
          <Slider label="Zoom à la fin" value={z.end} min={1} max={3} step={0.01} neutral={1} onChange={(v) => update({ zoom: { ...z, end: v } })} fmt={(v) => `x${v.toFixed(2)}`} />
          <Slider label="Point visé : horizontal" value={z.x} min={0} max={1} step={0.01} neutral={0.5} onChange={(v) => update({ zoom: { ...z, x: v } })} fmt={(v) => `${Math.round(v * 100)} %`} />
          <Slider label="Point visé : vertical" value={z.y} min={0} max={1} step={0.01} neutral={0.5} onChange={(v) => update({ zoom: { ...z, y: v } })} fmt={(v) => `${Math.round(v * 100)} %`} />
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          <button onClick={() => update({ zoom: { start: 1, end: 1.3, x: 0.5, y: 0.4 } })} className="rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800">Zoom lent avant</button>
          <button onClick={() => update({ zoom: { start: 1.3, end: 1, x: 0.5, y: 0.4 } })} className="rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800">Zoom lent arrière</button>
          <button onClick={() => update({ zoom: { start: 1, end: 2.2, x: 0.5, y: 0.35 } })} className="rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800">Gros plan visage</button>
          <button onClick={() => update({ zoom: { start: 1.6, end: 1.6, x: 0.5, y: 0.5 } })} className="rounded-lg border border-zinc-700 px-2 py-1 hover:bg-zinc-800">Recadrage fixe x1,6</button>
        </div>
      </Section>

      <Section title="🟩 Fond vert" hint="retire une couleur et pose le clip sur un fond" active={!!ch} open={!!open.c} onToggle={() => toggle("c")} onReset={() => update({ chroma: null })}>
        {!ch ? (
          <button onClick={() => update({ chroma: { color: "#00ff00", similarity: 0.3, blend: 0.1, bgColor: "#000000", background: null } })} className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-green-400">Activer le fond vert</button>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Couleur à retirer">
              <div className="flex gap-1">
                <input type="color" value={ch.color} onChange={(e) => update({ chroma: { ...ch, color: e.target.value } })} className="h-9 w-12" />
                <button onClick={() => update({ chroma: { ...ch, color: "#00ff00" } })} className="rounded-lg border border-zinc-700 px-2 text-xs">Vert</button>
                <button onClick={() => update({ chroma: { ...ch, color: "#0000ff" } })} className="rounded-lg border border-zinc-700 px-2 text-xs">Bleu</button>
              </div>
            </Field>
            <Slider label="Tolérance" value={ch.similarity} min={0.05} max={0.8} step={0.01} neutral={0.3} onChange={(v) => update({ chroma: { ...ch, similarity: v } })} />
            <Slider label="Adoucir les bords" value={ch.blend} min={0} max={0.5} step={0.01} neutral={0.1} onChange={(v) => update({ chroma: { ...ch, blend: v } })} />
            <Field label="Fond">
              <select value={ch.background ? `${ch.background.kind}:${ch.background.id}` : ""} onChange={(e) => { const v = e.target.value; const s = sources.find((x) => `${x.source.kind}:${x.source.id}` === v); update({ chroma: { ...ch, background: s ? s.source : null } }); }} className={inputCls}>
                <option value="">Couleur unie</option>
                {sources.map((s) => (
                  <option key={`${s.source.kind}:${s.source.id}`} value={`${s.source.kind}:${s.source.id}`}>{s.label}</option>
                ))}
              </select>
            </Field>
            {!ch.background ? (
              <Field label="Couleur du fond">
                <input type="color" value={ch.bgColor ?? "#000000"} onChange={(e) => update({ chroma: { ...ch, bgColor: e.target.value } })} className="h-9 w-full" />
              </Field>
            ) : null}
            <p className="col-span-2 text-[11px] text-zinc-500 sm:col-span-4">Visible à l'export (l'aperçu montre le clip tel quel). Le fond vidéo est lu en boucle derrière le clip.</p>
          </div>
        )}
      </Section>

      <Section title="🎧 Son du clip" hint="fondus, voix, grave, aigu, écho" active={audioActive} open={!!open.s} onToggle={() => toggle("s")} onReset={() => update({ audio: null })}>
        {clip.mute ? <p className="text-xs text-amber-300">Le son de ce clip est coupé.</p> : null}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <Slider label="Fondu d'entrée (s)" value={au.fadeInS ?? 0} min={0} max={5} step={0.1} neutral={0} onChange={(v) => setAu({ fadeInS: v })} fmt={(v) => v.toFixed(1)} />
          <Slider label="Fondu de sortie (s)" value={au.fadeOutS ?? 0} min={0} max={5} step={0.1} neutral={0} onChange={(v) => setAu({ fadeOutS: v })} fmt={(v) => v.toFixed(1)} />
          <Slider label="Hauteur de la voix" value={au.pitch ?? 0} min={-12} max={12} step={1} neutral={0} onChange={(v) => setAu({ pitch: v })} fmt={(v) => (v === 0 ? "normale" : v > 0 ? `+${v} (aiguë)` : `${v} (grave)`)} />
          <Slider label="Graves" value={au.bass ?? 0} min={-15} max={15} step={1} neutral={0} onChange={(v) => setAu({ bass: v })} fmt={(v) => `${v} dB`} />
          <Slider label="Aigus" value={au.treble ?? 0} min={-15} max={15} step={1} neutral={0} onChange={(v) => setAu({ treble: v })} fmt={(v) => `${v} dB`} />
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setAu({ denoise: !au.denoise })} className={`rounded-lg border px-2 py-1 text-xs ${au.denoise ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>🧹 Réduire le bruit</button>
          <button onClick={() => setAu({ boost: !au.boost })} className={`rounded-lg border px-2 py-1 text-xs ${au.boost ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>📢 Voix plus forte et régulière</button>
          <button onClick={() => setAu({ echo: !au.echo })} className={`rounded-lg border px-2 py-1 text-xs ${au.echo ? "border-green-500 text-green-300" : "border-zinc-700 hover:bg-zinc-800"}`}>🏔️ Écho</button>
          <button onClick={() => setAu({ pitch: -4 })} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Voix grave</button>
          <button onClick={() => setAu({ pitch: 5 })} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">Voix chipmunk</button>
        </div>
      </Section>
    </div>
  );
};
