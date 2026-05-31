/**
 * Remotion entry. `npm run studio` and `npm run render:local` both load this.
 */

import React from 'react';
import { registerRoot } from 'remotion';
import { CleanComposition } from './Composition';

const RemotionRoot: React.FC = () => (
  <>
    <CleanComposition />
  </>
);

registerRoot(RemotionRoot);
