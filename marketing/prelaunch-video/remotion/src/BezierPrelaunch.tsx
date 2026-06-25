import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { C } from "./theme";
import { DUR } from "./content";
import { S0, S1, S2, S3, S4, S5 } from "./scenes";

// 72s master。Series で隙間なく連結（各シーンは local frame を受ける）。
export const BezierPrelaunch: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Series>
        <Series.Sequence durationInFrames={DUR.s0}>
          <S0 dur={DUR.s0} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={DUR.s1}>
          <S1 dur={DUR.s1} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={DUR.s2}>
          <S2 dur={DUR.s2} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={DUR.s3}>
          <S3 dur={DUR.s3} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={DUR.s4}>
          <S4 dur={DUR.s4} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={DUR.s5}>
          <S5 dur={DUR.s5} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
