// SignedImg — Phase 4.4 drop-in <img> wrapper that resolves to a signed URL.
//
// Use as a 1-line replacement for `<img src={storageUrl(...)} ... />`:
//
//   <img src={storageUrl('gallery-images', img.storage_path)} ... />
//   ↓
//   <SignedImg bucket="gallery-images" path={img.storage_path} ... />
//
// All other <img> props (alt, style, loading, className, onLoad, onError, …)
// pass through unchanged.

import React from 'react'
import { useSignedSrc } from '../lib/useSignedSrc'

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>

interface Props extends ImgProps {
  bucket: string
  path: string | null | undefined
}

export function SignedImg({ bucket, path, ...rest }: Props) {
  const src = useSignedSrc(bucket, path)
  return <img src={src} {...rest} />
}
