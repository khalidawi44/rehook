import React, { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FPS, HOOK_SECONDS, OUTRO_SECONDS, type NicheProps, type SceneProps, type Word } from "./types";

const FONT = "NicheDisplay";

function useDisplayFont() {
  const [handle] = useState(() => delayRender("Police d'affichage"));
  useEffect(() => {
    const face = new FontFace(FONT, `url(${staticFile("fonts/Anton-Regular.ttf")})`);
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle]);
}

const Background: React.FC<{ palette: string[]; seed: number }> = ({ palette, seed }) => {
  const frame = useCurrentFrame();
  const [bg, a1, a2] = palette;
  const t = frame / FPS;
  const x1 = 30 + Math.sin(t * 0.35 + seed) * 18;
  const y1 = 25 + Math.cos(t * 0.28 + seed) * 14;
  const x2 = 70 + Math.cos(t * 0.31 + seed * 2) * 16;
  const y2 = 75 + Math.sin(t * 0.26 + seed * 2) * 12;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(60% 45% at ${x1}% ${y1}%, ${a1}66 0%, transparent 70%),
                     radial-gradient(55% 40% at ${x2}% ${y2}%, ${a2}55 0%, transparent 70%),
                     linear-gradient(180deg, ${bg} 0%, #05030a 100%)`,
      }}
    />
  );
};

const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%)",
    }}
  />
);

const HookCard: React.FC<{ hook: string; palette: string[] }> = ({ hook, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const scale = interpolate(s, [0, 1], [0.6, 1]);
  const bar = interpolate(frame, [6, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90 }}>
      <div
        style={{
          fontFamily: `${FONT}, Impact, sans-serif`,
          fontSize: 118,
          lineHeight: 1.02,
          textAlign: "center",
          color: "white",
          textTransform: "uppercase",
          transform: `scale(${scale})`,
          textShadow: "0 12px 40px rgba(0,0,0,0.6)",
          letterSpacing: 1,
        }}
      >
        {hook}
      </div>
      <div style={{ marginTop: 40, height: 14, width: 520 * bar, background: palette[1], borderRadius: 7 }} />
    </AbsoluteFill>
  );
};

/** Regroupe les mots en lignes courtes (sous-titres façon TikTok). */
function chunkWords(words: Word[], maxWords = 4, maxSeconds = 1.8): Word[][] {
  const chunks: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const tooLong = cur.length >= maxWords || (cur.length && w.end - cur[0].start > maxSeconds);
    const punct = cur.length && /[.!?…]$/.test(cur[cur.length - 1].text);
    if (tooLong || punct) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const Captions: React.FC<{ scene: SceneProps; palette: string[]; style: "karaoke" | "block" }> = ({ scene, palette, style }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const chunks = useMemo(() => chunkWords(scene.words, style === "block" ? 8 : 4), [scene.words, style]);
  const chunk = chunks.find((c) => t >= c[0].start - 0.12 && t < c[c.length - 1].end + 0.25) ?? (t < (chunks[0]?.[0].start ?? 0) ? chunks[0] : null);
  if (!chunk) return null;
  const chunkStart = chunk[0].start - 0.12;
  const pop = interpolate(t - chunkStart, [0, 0.12], [0.85, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        bottom: 420,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 28px",
        transform: `scale(${pop})`,
      }}
    >
      {chunk.map((w, i) => {
        const active = t >= w.start && t < w.end + 0.05;
        const done = t >= w.end;
        return (
          <span
            key={i}
            style={{
              fontFamily: `${FONT}, Impact, sans-serif`,
              fontSize: 84,
              lineHeight: 1.15,
              textTransform: "uppercase",
              color: active ? palette[2] : "white",
              opacity: style === "karaoke" && !active && !done ? 0.9 : 1,
              transform: active ? "scale(1.12)" : "scale(1)",
              textShadow: "0 0 18px rgba(0,0,0,0.9), 0 6px 0 rgba(0,0,0,0.75)",
              WebkitTextStroke: "2px rgba(0,0,0,0.55)",
              display: "inline-block",
              transformOrigin: "center",
              padding: "0 4px",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

const TypoBackdrop: React.FC<{ text: string; palette: string[]; index: number }> = ({ text, palette, index }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 300], [0, -140]);
  const word = text.split(/\s+/).slice(0, 2).join(" ");
  return (
    <AbsoluteFill style={{ overflow: "hidden", opacity: 0.16 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: 160 + i * 340 + drift * ((i % 2) + 1) * 0.5,
            left: i % 2 ? -200 : -40,
            fontFamily: `${FONT}, Impact, sans-serif`,
            fontSize: 260,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            color: i % 2 ? palette[1] : palette[2],
            transform: `rotate(${index % 2 ? -8 : 8}deg)`,
          }}
        >
          {word} {word}
        </div>
      ))}
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ scene: SceneProps; palette: string[]; index: number; captionStyle: "karaoke" | "block" }> = ({
  scene,
  palette,
  index,
  captionStyle,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const fade = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const kb = interpolate(frame, [0, durationInFrames], [1, 1.14]);
  const panX = interpolate(frame, [0, durationInFrames], [0, index % 2 ? -30 : 30]);
  const title = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {scene.video ? (
        <AbsoluteFill style={{ transform: `scale(${interpolate(frame, [0, durationInFrames], [1, 1.06])})` }}>
          <Loop durationInFrames={Math.max(fps, Math.round((scene.videoDurationS ?? 5) * fps))}>
            <OffthreadVideo src={staticFile(scene.video)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Loop>
        </AbsoluteFill>
      ) : scene.image ? (
        <AbsoluteFill style={{ transform: `scale(${kb}) translateX(${panX}px)` }}>
          <Img src={staticFile(scene.image)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      ) : (
        <TypoBackdrop text={scene.onScreen} palette={palette} index={index} />
      )}
      <Grain />
      <div
        style={{
          position: "absolute",
          top: 200,
          left: 70,
          right: 70,
          transform: `translateY(${interpolate(title, [0, 1], [-60, 0])}px)`,
          opacity: title,
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: palette[1],
            color: "white",
            fontFamily: `${FONT}, Impact, sans-serif`,
            fontSize: 62,
            lineHeight: 1.1,
            textTransform: "uppercase",
            padding: "18px 30px",
            borderRadius: 18,
            boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
            maxWidth: "100%",
          }}
        >
          {scene.onScreen}
        </div>
      </div>
      <Captions scene={scene} palette={palette} style={captionStyle} />
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ cta: string; handle: string; palette: string[] }> = ({ cta, handle, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 13 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 100, textAlign: "center" }}>
      <div
        style={{
          fontFamily: `${FONT}, Impact, sans-serif`,
          fontSize: 92,
          lineHeight: 1.05,
          color: "white",
          textTransform: "uppercase",
          transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`,
        }}
      >
        {cta}
      </div>
      {handle ? (
        <div
          style={{
            marginTop: 50,
            fontFamily: "Arial, Helvetica, sans-serif",
            fontWeight: 700,
            fontSize: 52,
            color: palette[2],
            opacity: interpolate(frame, [10, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          {handle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const Niche: React.FC<NicheProps> = (props) => {
  useDisplayFont();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const hookFrames = props.showHookCard ? Math.round(HOOK_SECONDS * FPS) : 0;
  let offset = hookFrames;
  const scenes = props.scenes.map((s) => {
    const from = offset;
    const dur = Math.max(FPS, Math.round(s.durationS * FPS));
    offset += dur;
    return { s, from, dur };
  });
  const outroFrames = Math.round(OUTRO_SECONDS * FPS);
  const palette = props.palette.length >= 3 ? props.palette : ["#0f0a1f", "#a855f7", "#f472b6"];

  return (
    <AbsoluteFill style={{ backgroundColor: palette[0] }}>
      <Background palette={palette} seed={props.title.length} />
      {props.showHookCard ? (
        <Sequence from={0} durationInFrames={hookFrames}>
          <HookCard hook={props.hook} palette={palette} />
        </Sequence>
      ) : null}
      {scenes.map(({ s, from, dur }, i) => (
        <Sequence key={i} from={from} durationInFrames={dur}>
          <Scene scene={s} palette={palette} index={i} captionStyle={props.captionStyle} />
        </Sequence>
      ))}
      <Sequence from={offset} durationInFrames={outroFrames}>
        <Outro cta={props.cta} handle={props.handle} palette={palette} />
      </Sequence>
      {props.music ? <Audio src={staticFile(props.music)} volume={props.musicVolume} loop /> : null}
      <div style={{ position: "absolute", top: 0, left: 0, height: 12, width: `${(frame / durationInFrames) * 100}%`, background: palette[2] }} />
    </AbsoluteFill>
  );
};
