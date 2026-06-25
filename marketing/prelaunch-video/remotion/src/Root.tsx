import React from "react";
import { Composition } from "remotion";
import { BezierPrelaunch } from "./BezierPrelaunch";
import { FPS, WIDTH, HEIGHT, TOTAL_FRAMES } from "./content";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="BezierPrelaunch"
      component={BezierPrelaunch}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
