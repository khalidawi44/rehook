// Props de la composition « Rehook » (partagées entre le serveur et Remotion).
export type Word = { text: string; start: number; end: number };

export type SceneProps = {
  onScreen: string;
  narration: string;
  image: string | null; // chemin relatif au dossier public (staticFile)
  video: string | null; // clip libre de droits (muet), prioritaire sur l'image
  videoDurationS: number | null; // durée lisible à partir de videoStartS
  videoStartS?: number; // décalage de départ dans le clip, en secondes
  audio: string | null;
  durationS: number;
  words: Word[];
};

export type RehookProps = {
  title: string;
  hook: string;
  language: string;
  scenes: SceneProps[];
  cta: string;
  handle: string;
  palette: string[]; // [fond, accent 1, accent 2]
  music: string | null;
  musicVolume: number;
  captionStyle: "karaoke" | "block";
  showHookCard: boolean;
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const HOOK_SECONDS = 1.6;
export const OUTRO_SECONDS = 2.5;

export function totalFrames(p: RehookProps): number {
  const scenes = p.scenes.reduce((a, s) => a + s.durationS, 0);
  const total = (p.showHookCard ? HOOK_SECONDS : 0) + scenes + OUTRO_SECONDS;
  return Math.max(FPS * 3, Math.round(total * FPS));
}
