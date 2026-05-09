// SignedImg — Phase 4.4 drop-in <img> wrapper that resolves to a signed URL.
//
// Use as a 1-line replacement for `<img src={storageUrl(...)} ... />`:
//
//   <img src={storageUrl('gallery-images', img.storage_path)} ... />
//   ↓
//   <SignedImg bucket="gallery-images" path={img.storage_path} ... />
//
// All other <img> props (alt, style, loading, className, onLoad, onError,
// ref, …) pass through unchanged. ref is supported via forwardRef so
// callers (e.g. MasonryGrid in P4.5.D2) can keep their imgRefs map.

import React, { forwardRef } from 'react'
import { useSignedSrc } from '../lib/useSignedSrc'

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>

interface Props extends ImgProps {
  bucket: string
  path: string | null | undefined
}

export const SignedImg = forwardRef<HTMLImageElement, Props>(
  function SignedImg({ bucket, path, ...rest }, ref) {
    const src = useSignedSrc(bucket, path)
    return <img ref={ref} src={src} {...rest} />
  },
)
