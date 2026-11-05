import React from "react";
import { Composition } from "remotion";
import { Niche } from "./Niche";
import { FPS, HEIGHT, WIDTH, totalFrames, type NicheProps } from "./types";

const DEMO_PROPS: NicheProps = {
  title: "Le facteur qui livrait des lettres au futur",
  hook: "Il a ouvert la lettre 40 ans trop tôt",
  language: "fr",
  scenes: [
    {
      onScreen: "Une lettre sans timbre",
      narration: "Chaque matin, le facteur trouvait une lettre sans timbre sur son vélo. Toujours la même écriture.",
      image: null,
      audio: null,
      durationS: 5,
      words: [],
    },
    {
      onScreen: "Elle venait de 2066",
      narration: "Un jour, il a lu la date. Elle venait de l'année deux mille soixante-six.",
      image: null,
      audio: null,
      durationS: 4.5,
      words: [],
    },
    {
      onScreen: "Signée de son nom",
      narration: "Et la lettre était signée de son propre nom. Il a compris qu'il devait répondre.",
      image: null,
      audio: null,
      durationS: 5,
      words: [],
    },
  ],
  cta: "Abonne-toi pour la suite",
  handle: "@moncompte",
  palette: ["#0f0a1f", "#a855f7", "#f472b6"],
  music: null,
  musicVolume: 0.12,
  captionStyle: "karaoke",
  showHookCard: true,
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="Niche"
      component={Niche}
      durationInFrames={totalFrames(DEMO_PROPS)}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={DEMO_PROPS}
      calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props) })}
    />
  );
};
