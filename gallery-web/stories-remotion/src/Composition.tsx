/**
 * Composition wrapper. Computes the total frame count up front so Remotion
 * knows the timeline length before rendering. Default duration matches the
 * desktop renderer's typical 30-second story.
 */

import React from 'react';
import { Composition } from 'remotion';
import {
  Clean,
  CleanProps,
  CLEAN_OUTPUT,
  buildScenes,
  computeTotalFrames,
} from './Clean';

/**
 * Default input props used by Remotion Studio. Replace by passing
 * `--props='{"images":[…]}'` to `remotion render`.
 */
const DEFAULT_PROPS: CleanProps = {
  images: [
    // Placeholder Picsum images so Studio renders something out-of-the-box.
    // Replace with real Supabase render URLs at render time.
    'https://picsum.photos/seed/p1/1080/1920',
    'https://picsum.photos/seed/p2/1080/1920',
    'https://picsum.photos/seed/p3/1080/1920',
    'https://picsum.photos/seed/p4/1080/1920',
    'https://picsum.photos/seed/p5/1080/1920',
    'https://picsum.photos/seed/p6/1080/1920',
    'https://picsum.photos/seed/p7/1080/1920',
    'https://picsum.photos/seed/p8/1080/1920',
    'https://picsum.photos/seed/p9/1080/1920',
    'https://picsum.photos/seed/p10/1080/1920',
    'https://picsum.photos/seed/p11/1080/1920',
    'https://picsum.photos/seed/p12/1080/1920',
  ],
  durationSeconds: 30,
  motionMode: 'subtle',
};

/**
 * Resolve final frame count from the props passed to <Composition>. We use
 * `calculateMetadata` so Remotion can dynamically size the timeline when the
 * caller passes a different image count or duration.
 */
export const CleanComposition: React.FC = () => (
  <Composition
    id="Clean"
    component={Clean as React.FC<Record<string, unknown>>}
    durationInFrames={Math.round((DEFAULT_PROPS.durationSeconds ?? 30) * CLEAN_OUTPUT.fps)}
    fps={CLEAN_OUTPUT.fps}
    width={CLEAN_OUTPUT.width}
    height={CLEAN_OUTPUT.height}
    defaultProps={DEFAULT_PROPS}
    calculateMetadata={({ props }) => {
      const p = props as CleanProps;
      const duration = p.durationSeconds ?? 30;
      // If scenes were pre-built, use them. Otherwise treat every image as a
      // portrait scene (worst-case frame count).
      const scenes =
        p.scenes && p.scenes.length > 0
          ? p.scenes
          : buildScenes(
              p.images.map((url) => ({ url, width: 1080, height: 1920 })),
              duration,
              p.motionMode ?? 'subtle',
            );
      return {
        durationInFrames: computeTotalFrames(scenes, CLEAN_OUTPUT.fps),
      };
    }}
  />
);
