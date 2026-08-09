/**
 * Remotion entry. `npm run studio` and `npm run render:local` both load this.
 */

import React from 'react';
import { registerRoot } from 'remotion';
import { CleanComposition } from './Composition';
import { StoryStudioComposition } from '../../story-studio-remotion/Root';

const RemotionRoot: React.FC = () => (
  <>
    <CleanComposition />
    {/* Story Studio (edited ScenePlan) composition — same bundle, id "StoryStudio". */}
    <StoryStudioComposition />
  </>
);

registerRoot(RemotionRoot);
