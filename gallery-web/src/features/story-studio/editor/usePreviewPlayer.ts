import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";

function useObservedWidth(ref: RefObject<HTMLElement | null>, onWidth: (w: number) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) onWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // observe once on mount; the callback only calls stable state setters
}

/**
 * Layout + transport for the preview Player. Remotion's auto-scale is unreliable
 * in this embed, so we measure the frame and scale the native composition ourselves.
 * Narrow mode is container-based so it works inside embeds, not just full viewport.
 */
export function usePreviewPlayer(compositionWidth: number, fps: number) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const [previewW, setPreviewW] = useState(300);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [curFrame, setCurFrame] = useState(0);

  useObservedWidth(rootRef, (w) => setIsNarrow(w < 760));
  useObservedWidth(previewWrapRef, setPreviewW);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setCurFrame(e.detail.frame);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying()) p.pause();
    else p.play();
  };
  const seekTo = (frame: number) => {
    playerRef.current?.seekTo(frame);
    setCurFrame(frame);
  };
  const fmt = (f: number) => {
    const s = f / fps;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  return {
    rootRef,
    previewWrapRef,
    playerRef,
    isNarrow,
    isPlaying,
    curFrame,
    scale: previewW / compositionWidth,
    togglePlay,
    seekTo,
    fmt,
  };
}
